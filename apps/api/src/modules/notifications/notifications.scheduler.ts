import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { MailerService } from '../mailer/mailer.service'
import { SuppressionService } from '../mailer/suppression.service'
import { NotificationsService } from './notifications.service'
import { DailyDigestService } from './daily-digest.service'
import { WeeklyDigestService } from './weekly-digest.service'
import { Correlated } from '../../correlation-id/background-correlation'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
/** Skip a resend if a weekly summary already went out within this window. */
const DEDUP_WINDOW_MS = 6 * 24 * 60 * 60 * 1000
/** Skip a resend if an `action_overdue` digest already went out within this
 *  window — "max one digest per day" with slack for cron-tick jitter. */
const ACTION_OVERDUE_DEDUP_MS = 20 * 60 * 60 * 1000

type WeeklySummary = {
  title: string
  inAppBody: string
  emailLines: string[]
}

/**
 * Periodic notification deliveries.
 *
 * `@nestjs/schedule` is already bootstrapped app-wide (OutboxModule calls
 * `ScheduleModule.forRoot()`), so the `@Cron` below is discovered and fired by
 * the running API process. Both crons are read-then-write (scan prefs, THEN
 * stamp `last_reminded_on` / count recent notifications) — at N replicas the
 * ticks race inside that window and duplicate in-app notifications + emails,
 * so each cron body runs under the {@link SingletonLockService} tick lock
 * (exactly one replica per tick; unchanged when the lock isn't wired).
 */
@Injectable()
export class NotificationsScheduler {
  private readonly logger = new Logger(NotificationsScheduler.name)

  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(ActionPlanItemEntity)
    private readonly planItems: Repository<ActionPlanItemEntity>,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    // D3 — email digest hebdo de veille; rides the weekly-summary tick + lock.
    private readonly weeklyDigest: WeeklyDigestService,
    // §11 — digest QUOTIDIEN de veille (opt-in strict, filtré par les règles
    // perso). Son propre tick + lock, indépendant de l'hebdo.
    private readonly dailyDigest: DailyDigestService,
    // Cron-tick lock — `@Optional()` so direct-`new` specs need no stub;
    // without it the crons run unlocked (single-instance behaviour).
    @Optional() private readonly locks?: SingletonLockService,
    // Liste d'opt-out — `@Optional()` pour la même raison. Absente, on n'invente
    // pas un désabonnement : le comportement reste celui d'avant.
    @Optional() private readonly suppression?: SuppressionService,
  ) {}

  /**
   * L'utilisateur a-t-il refusé le courrier de Bellum ?
   *
   * Seul l'E-MAIL est filtré. La notification in-app reste délivrée : se
   * désabonner du courrier n'est pas se retirer une fonction de l'application,
   * et le digest hebdomadaire de veille (qui, lui, coupe tout) est un produit
   * PUREMENT e-mail — la distinction est délibérée.
   *
   * En échec de lecture, on ENVOIE. Un opt-out raté est réparable par un clic
   * de désabonnement ; taire par erreur les relances en retard de quelqu'un lui
   * ferait manquer ses échéances sans qu'il puisse le savoir.
   */
  private async emailOptedOut(userId: string, email: string): Promise<boolean> {
    if (!this.suppression) return false
    try {
      return await this.suppression.isSuppressedForUser(userId, email)
    } catch (err) {
      this.logger.warn('Lecture de la liste d’opt-out en échec — envoi maintenu', {
        user: { id: userId },
        error: err instanceof Error ? err.message : String(err),
      })
      return false
    }
  }

  /* -------------------------- relance reminders -------------------------- */

  /** Daily 07:00 Europe/Paris — the "Rappels de relance". For every user who
   *  opted into `relance_reminders`, drop an in-app notification for each of
   *  their overdue (`due_date < today AND done = false`) plan items, deduped to
   *  one reminder per item per calendar day via `last_reminded_on`. */
  @Cron('0 7 * * *', { name: 'relance-reminders', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runRelanceReminders')
  async runRelanceReminders(): Promise<void> {
    await withSingletonLock(this.locks, 'relance-reminders', async () => {
      const optedIn = await this.prefs.find({ where: { relance_reminders: true } })
      this.logger.log(`Relance reminders: ${optedIn.length} opted-in user(s)`)
      let notified = 0
      for (const pref of optedIn) {
        try {
          notified += await this.sendRelanceRemindersForUser(pref.user_id)
        } catch (err) {
          this.logger.warn('Relance reminders failed for user (non-fatal)', {
            user: { id: pref.user_id },
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      this.logger.log(`Relance reminders: ${notified} item(s) notified`)
    })
  }

  /**
   * In-app reminder for each of one user's overdue, not-yet-reminded-today plan
   * items, plus a best-effort digest email. Returns the number of items
   * reminded. Public so it is unit-testable and can back a future manual
   * "remind me now" action. The pref gate lives in the cron above — callers
   * that reach here are already opted-in.
   */
  async sendRelanceRemindersForUser(userId: string): Promise<number> {
    const today = parisToday()
    // Fetch the user's open items and filter overdue/undeduped in memory — a
    // per-user set is small, and it keeps the "overdue" definition in one place.
    const open = await this.planItems.find({ where: { user_id: userId, done: false } })
    const overdue = open.filter(
      item => item.due_date != null && item.due_date < today && item.last_reminded_on !== today,
    )
    if (overdue.length === 0) return 0

    const companyNames = new Map<string, string>()
    const reminded: { label: string; company: string; dueDate: string }[] = []
    for (const item of overdue) {
      const company = await this.companyName(item.account_id, companyNames)
      await this.notifications.createNotification(userId, {
        type: 'relance',
        title: `Relance en retard — ${company}`,
        body: buildRelanceBody(item.label, item.due_date),
        link: `/accounts/${item.account_id}`,
      })
      // Stamp the dedup marker so tomorrow's run (or a re-run today) skips it.
      await this.planItems.update({ id: item.id }, { last_reminded_on: today })
      reminded.push({ label: item.label, company, dueDate: item.due_date ?? '' })
    }

    // Email is best-effort: a missing provider / profile email must not fail the
    // in-app deliveries above. One digest per run rather than one mail per item.
    try {
      const profile = await this.profiles.findOne({ where: { user_id: userId } })
      const email = profile?.email
      if (email && !(await this.emailOptedOut(userId, email))) {
        const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
        const bodyLines = reminded.map(
          r => `${r.company} — ${r.label || 'Action'}${r.dueDate ? ` (échéance ${r.dueDate})` : ''}`,
        )
        await this.mailer.sendNotificationEmail({
          to: email,
          subject: `${reminded.length} relance${reminded.length > 1 ? 's' : ''} en retard`,
          heading: 'Actions de relance en retard',
          bodyLines: ['Ces actions de votre plan ont dépassé leur échéance :', ...bodyLines],
          ctaUrl: `${frontendUrl}/dashboard`,
          ctaLabel: 'Ouvrir mon tableau de bord',
        })
      }
    } catch (err) {
      this.logger.warn('Relance digest email failed (in-app already delivered)', {
        user: { id: userId },
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return reminded.length
  }

  /* -------------------------- action-overdue digest -------------------------- */

  /** Daily 07:10 Europe/Paris — the `action_overdue` digest (addendum Théo
   *  p.22, transparence billing). For every user who kept `action_overdue` ON
   *  (default), drop ONE in-app notification recapping their overdue
   *  (`due_date < today AND done = false`) plan items. Distinct from the
   *  relance reminders above: opt-out instead of opt-in, a single digest
   *  instead of one notification per item, and no email. */
  @Cron('10 7 * * *', { name: 'action-overdue', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runActionOverdueDigests')
  async runActionOverdueDigests(): Promise<void> {
    await withSingletonLock(this.locks, 'action-overdue', async () => {
      const optedIn = await this.prefs.find({ where: { action_overdue: true } })
      this.logger.log(`Action-overdue digests: ${optedIn.length} opted-in user(s)`)
      let sent = 0
      for (const pref of optedIn) {
        try {
          const result = await this.sendActionOverdueDigestForUser(pref.user_id)
          if (result === 'sent') sent += 1
        } catch (err) {
          this.logger.warn('Action-overdue digest failed for user (non-fatal)', {
            user: { id: pref.user_id },
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      this.logger.log(`Action-overdue digests: sent ${sent}/${optedIn.length}`)
    })
  }

  /**
   * Build + deliver one user's overdue-actions digest (ONE in-app notification,
   * no email). Returns `skipped` when nothing is overdue or a digest already
   * went out within {@link ACTION_OVERDUE_DEDUP_MS} (max one per day — the
   * anti-spam guard). Public so it is unit-testable. The pref gate lives in the
   * cron above — callers that reach here are already opted-in.
   */
  async sendActionOverdueDigestForUser(userId: string): Promise<'sent' | 'skipped'> {
    const alreadySent = await this.notifications.countSince(
      userId,
      'action_overdue',
      new Date(Date.now() - ACTION_OVERDUE_DEDUP_MS),
    )
    if (alreadySent > 0) return 'skipped'

    const today = parisToday()
    const open = await this.planItems.find({ where: { user_id: userId, done: false } })
    const overdue = open
      .filter(item => item.due_date != null && item.due_date < today)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    if (overdue.length === 0) return 'skipped'

    // Name the OLDEST overdue item (most urgent) and count the rest.
    const oldest = overdue[0]
    if (!oldest) return 'skipped'
    const company = await this.companyName(oldest.account_id, new Map<string, string>())
    const count = overdue.length
    const label = oldest.label.trim() || 'Une action de votre plan'
    const rest = count - 1
    const suffix = rest > 0 ? `, +${rest} autre${rest > 1 ? 's' : ''}` : ''

    await this.notifications.createNotification(userId, {
      type: 'action_overdue',
      title: `${count} action${count > 1 ? 's' : ''} en retard`,
      body: `« ${label} » (${company}) — échéance dépassée${oldest.due_date ? ` (${oldest.due_date})` : ''}${suffix}.`,
      link: '/dashboard',
    })
    return 'sent'
  }

  private async companyName(accountId: string, cache: Map<string, string>): Promise<string> {
    const cached = cache.get(accountId)
    if (cached) return cached
    const account = await this.accounts.findOne({ where: { id: accountId } })
    const name = account?.company_name || 'Ce compte'
    cache.set(accountId, name)
    return name
  }

  /**
   * 06:30 Europe/Paris — le digest QUOTIDIEN de veille (§11). Opt-in STRICT
   * (`watchlist_daily_digest === true`) et filtré par les règles perso de
   * veille du workspace ; journée vide = pas d'email. Sous son propre lock
   * singleton pour qu'à N replicas exactement un process envoie.
   */
  @Cron('30 6 * * *', { name: 'daily-veille-digest', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runDailyDigest')
  async runDailyDigest(): Promise<void> {
    await withSingletonLock(this.locks, 'daily-veille-digest', async () => {
      try {
        const { sent, skipped } = await this.dailyDigest.run()
        this.logger.log(`Daily veille digest tick: ${sent} sent, ${skipped} skipped`)
      } catch (err) {
        this.logger.warn('Daily veille digest batch failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  /** Monday 08:00 Europe/Paris — the "Résumé hebdomadaire" email, then the
   *  veille digest (D3), both under the SAME `weekly-summary` tick lock so at
   *  N replicas exactly one process sends either. */
  @Cron('0 8 * * 1', { name: 'weekly-summary', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runWeeklySummaries')
  async runWeeklySummaries(): Promise<void> {
    await withSingletonLock(this.locks, 'weekly-summary', async () => {
      const optedIn = await this.prefs.find({ where: { weekly_summary: true } })
      this.logger.log(`Weekly summary: ${optedIn.length} opted-in user(s)`)
      let sent = 0
      for (const pref of optedIn) {
        try {
          const result = await this.sendWeeklySummaryForUser(pref.user_id)
          if (result === 'sent') sent += 1
        } catch (err) {
          this.logger.warn('Weekly summary failed for user (non-fatal)', {
            user: { id: pref.user_id },
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
      this.logger.log(`Weekly summary: sent ${sent}/${optedIn.length}`)

      // D3 — email digest hebdo de veille. Guarded so a digest failure never
      // takes down the summaries above (and vice versa: summaries already ran).
      try {
        await this.weeklyDigest.run()
      } catch (err) {
        this.logger.warn('Weekly veille digest batch failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  /**
   * #4648 (Louis 27/10/2026) — la purge hebdomadaire : toute notification de plus de 7 jours, lue ou non, pour tous.
   * Gabarit et heure de `weekly-summary`, son PROPRE verrou de tick (une seule réplique purge). Idempotente et
   * reprenable : relancée, elle ne supprime rien de plus. Le journal COMPTE, il ne cite jamais un titre.
   * ⚠️ Le premier passage emporte tout le stock de plus de 7 jours, d'un coup et sans retour — l'effet voulu.
   */
  @Cron('0 8 * * 1', { name: 'notifications-weekly-purge', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runWeeklyPurge')
  async runWeeklyPurge(): Promise<void> {
    await withSingletonLock(this.locks, 'notifications-weekly-purge', async () => {
      try {
        const { deleted, users } = await this.notifications.purgeOlderThan(new Date(Date.now() - WEEK_MS))
        this.logger.log(`Weekly notifications purge: ${deleted} deleted for ${users} user(s)`)
      } catch (err) {
        this.logger.warn('Weekly notifications purge failed (non-fatal)', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })
  }

  /**
   * Build + deliver one user's weekly summary (in-app notification + best-effort
   * email). Returns `skipped` when the user has nothing worth summarising or a
   * summary already went out this window. Public so it is unit-testable and can
   * back a future manual "send me my summary" action.
   */
  async sendWeeklySummaryForUser(userId: string): Promise<'sent' | 'skipped'> {
    const alreadySent = await this.notifications.countSince(
      userId,
      'weekly_summary',
      new Date(Date.now() - DEDUP_WINDOW_MS),
    )
    if (alreadySent > 0) return 'skipped'

    const summary = await this.buildSummary(userId)
    if (!summary) return 'skipped'

    await this.notifications.createNotification(userId, {
      type: 'weekly_summary',
      title: summary.title,
      body: summary.inAppBody,
      link: '/dashboard',
    })

    // Email is best-effort: an unset provider / missing profile email must not
    // fail the in-app delivery above.
    try {
      const profile = await this.profiles.findOne({ where: { user_id: userId } })
      const email = profile?.email
      if (email && !(await this.emailOptedOut(userId, email))) {
        const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000'
        await this.mailer.sendNotificationEmail({
          to: email,
          subject: 'Votre résumé hebdomadaire BellumAI',
          heading: summary.title,
          bodyLines: summary.emailLines,
          ctaUrl: `${frontendUrl}/dashboard`,
          ctaLabel: 'Ouvrir mon tableau de bord',
        })
      }
    } catch (err) {
      this.logger.warn('Weekly summary email failed (in-app already delivered)', {
        user: { id: userId },
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return 'sent'
  }

  /** Aggregate a user's account activity into a short recap, or null when there
   *  is nothing to say (no active accounts). */
  private async buildSummary(userId: string): Promise<WeeklySummary | null> {
    const rows = await this.accounts.find({ where: { user_id: userId } })
    const active = rows.filter(a => a.status !== 'deleted' && a.status !== 'archived')
    if (active.length === 0) return null

    const weekAgo = new Date(Date.now() - WEEK_MS)
    const newThisWeek = active.filter(a => a.created_at instanceof Date && a.created_at >= weekAgo).length
    const completed = active.filter(a => a.status === 'completed')
    const topTargets = [...completed]
      .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
      .slice(0, 3)
      .map(a => `${a.company_name}${a.priority_score != null ? ` — priorité ${a.priority_score}/100` : ''}`)

    const emailLines: string[] = [
      `${active.length} compte${active.length > 1 ? 's' : ''} suivi${active.length > 1 ? 's' : ''} au total.`,
      `${newThisWeek} nouveau${newThisWeek > 1 ? 'x' : ''} compte${newThisWeek > 1 ? 's' : ''} cette semaine.`,
    ]
    if (topTargets.length > 0) {
      emailLines.push('Vos comptes prioritaires :')
      emailLines.push(...topTargets)
    }

    const inAppBody =
      topTargets.length > 0
        ? `${active.length} comptes suivis, ${newThisWeek} nouveaux cette semaine. Priorité : ${topTargets[0]}.`
        : `${active.length} comptes suivis, ${newThisWeek} nouveaux cette semaine.`

    return { title: 'Votre semaine sur BellumAI', inAppBody, emailLines }
  }
}

/** Europe/Paris calendar date as `YYYY-MM-DD` — matches the DATE column so the
 *  `due_date < today` comparison is a plain string compare. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

function buildRelanceBody(label: string, dueDate: string | null): string {
  const action = label.trim() || 'Une action de votre plan'
  return dueDate ? `${action} — échéance dépassée (${dueDate}).` : `${action} — échéance dépassée.`
}
