import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  defaultNotificationPreferences,
  isSignalArchived,
  isSignalDatedToTheDay,
  signalDateMs,
} from '@bellum/contracts'
import { buildWeeklyDigestSubject, type WeeklyDigestAccount } from '@bellum/email'
import { AccountEntity } from '../../database/entities/account.entity'
import { ACCOUNT_FOLLOWS_TABLE } from '../account-follows/account-follow.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { MailerService } from '../mailer/mailer.service'
import { SuppressionService } from '../mailer/suppression.service'
import { signUnsubscribeToken } from '../mailer/unsubscribe-token'
import { NotificationsService } from './notifications.service'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Skip a resend when a digest already went out within this window — same
 *  (user, week) idempotence guard as the weekly summary (cron replays, extra
 *  manual ticks and multi-replica races all collapse to one send). */
const DEDUP_WINDOW_MS = 6 * 24 * 60 * 60 * 1000
/** Lifecycle states that mean the rep actively follows the account (« comptes
 *  suivis ») — `inbox` is untriaged and `archived` is dismissed. */
/** Display cap per account; the overflow is summarised as « +N autres ». */
const MAX_SIGNALS_PER_ACCOUNT = 5

/** Raw row off the accounts query — `recent_signals` is loose JSONB. */
type DigestAccountRow = {
  id: string
  user_id: string
  workspace_id: string | null
  company_name: string
  priority_score: number | null
  recent_signals: unknown
}

type DigestSignal = {
  label: string
  /** Date string as persisted — shown as-is in the email. */
  date: string
  /** Parsed UTC ms (same parser as the Cockpit/Veille) — used to window/sort. */
  dateMs: number
  source: string | null
}

type DigestAccount = {
  accountId: string
  companyName: string
  score: number | null
  signals: DigestSignal[]
}

type UserWeeklyDigest = {
  userId: string
  /** Workspace of the user's followed accounts — signs the unsubscribe token. */
  workspaceId: string | null
  /** Sorted: highest-priority account first. */
  accounts: DigestAccount[]
  totalSignals: number
}

/**
 * D3 — email digest hebdo de veille : les signaux CHAUDS de la semaine des
 * comptes suivis, dans l'inbox du commercial chaque lundi (rétention).
 *
 * Ridden by the existing `weekly-summary` Monday cron tick (same singleton
 * lock — see {@link NotificationsScheduler.runWeeklySummaries}). Hard rules:
 *
 *  - AUCUN signal inventé : tout vient de `accounts.recent_signals` (la veille
 *    persistée), et seuls les signaux DATÉS dans la fenêtre des 7 derniers
 *    jours partent (le parseur de date est celui du Cockpit/Veille).
 *  - Semaine vide = pas d'email — jamais de digest creux.
 *  - Opt-out double, STRICT : pref `weekly_digest` OFF (défaut ON) OU présence
 *    dans la suppression list (#394) → aucun envoi, aucun marqueur.
 *  - Idempotent : la notification in-app `weekly_digest` est le marqueur de
 *    dedup (user, semaine) — posé AVANT l'email, comme le weekly summary.
 *  - Best-effort : l'échec d'un utilisateur ne casse jamais le batch.
 */
@Injectable()
export class WeeklyDigestService {
  private readonly logger = new Logger(WeeklyDigestService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
    private readonly brands: WorkspaceBrandService,
  ) {}

  /** One pass over every user with followed accounts. Returns counters for the
   *  cron log line. Per-user failures are swallowed (best-effort batch). */
  async run(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
    const rows = await this.fetchFollowedAccountSignals()
    const digests = composeWeeklyDigests(rows, now.getTime())
    let sent = 0
    let skipped = 0
    for (const digest of digests) {
      try {
        const result = await this.sendDigestToUser(digest, now)
        if (result === 'sent') sent += 1
        else skipped += 1
      } catch (err) {
        skipped += 1
        this.logger.warn('Weekly veille digest failed for user (non-fatal)', {
          user: { id: digest.userId },
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.logger.log(`Weekly veille digest: ${sent} sent, ${skipped} skipped (${digests.length} candidate user(s))`)
    return { sent, skipped }
  }

  /**
   * Deliver one user's digest: pref gate → (user, week) dedup → suppression
   * list → in-app marker → best-effort email. `skipped` = a guard said no;
   * the caller already knows the digest is non-empty.
   */
  private async sendDigestToUser(digest: UserWeeklyDigest, now: Date): Promise<'sent' | 'skipped'> {
    // Pref gate. #2082.16 — l'absence de ligne ne vaut PAS consentement : le
    // défaut se lit au seul endroit où il vit (`defaultNotificationPreferences`,
    // GA-26), et il est FAUX pour un envoi. Avant le 15/09/2026 cette ligne
    // disait `pref && pref.weekly_digest === false`, donc un compte sans ligne
    // de préférences recevait l'e-mail sans avoir jamais rien coché.
    const pref = await this.prefs.findOne({ where: { user_id: digest.userId } })
    const optedIn = pref?.weekly_digest ?? defaultNotificationPreferences.weekly_digest
    if (!optedIn) return 'skipped'

    // Idempotence: one digest per (user, week) even when the cron replays.
    const alreadySent = await this.notifications.countSince(
      digest.userId,
      'weekly_digest',
      new Date(now.getTime() - DEDUP_WINDOW_MS),
    )
    if (alreadySent > 0) return 'skipped'

    const profile = await this.profiles.findOne({ where: { user_id: digest.userId } })
    const email = profile?.email ?? null

    // Suppression list (#394) — STRICT: an unsubscribed address gets nothing,
    // not even the in-app mirror (the digest is an email product; a user who
    // opted out must not be nagged weekly through a side door).
    if (email && digest.workspaceId && (await this.suppression.isSuppressed(digest.workspaceId, email))) {
      return 'skipped'
    }

    const subject = buildWeeklyDigestSubject(digest.totalSignals, digest.accounts.length)

    // In-app mirror doubles as the dedup marker — stamped BEFORE the email so
    // a replayed cron can never double-send (same pattern as weekly summary).
    await this.notifications.createNotification(digest.userId, {
      type: 'weekly_digest',
      title: subject,
      body: buildInAppBody(digest),
      link: '/dashboard',
    })

    // Email is best-effort: a missing provider must not fail the in-app
    // delivery above (nor the rest of the batch).
    try {
      if (email) {
        const frontendUrl = (this.config.get<string>('frontendUrl') ?? 'http://localhost:3000').replace(/\/$/, '')
        const unsubscribe = this.buildUnsubscribe(digest.workspaceId, email, frontendUrl)
        await this.mailer.sendWeeklyDigestEmail({
          to: email,
          // L'expéditeur déclaré par l'espace, ou le nôtre (délivrabilité).
          from: await this.brands.getSendingAddress(digest.workspaceId),
          firstName: profile?.first_name ?? null,
          totalSignals: digest.totalSignals,
          totalAccounts: digest.accounts.length,
          accounts: digest.accounts.map(account => toEmailAccount(account, frontendUrl)),
          dashboardUrl: `${frontendUrl}/dashboard`,
          settingsUrl: `${frontendUrl}/settings/notifications`,
          unsubscribeUrl: unsubscribe.url,
          oneClickUnsubscribe: unsubscribe.oneClick,
        })
      }
    } catch (err) {
      this.logger.warn('Weekly veille digest email failed (in-app already delivered)', {
        user: { id: digest.userId },
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return 'sent'
  }

  /** Followed accounts that persisted at least one veille signal — slim
   *  projection (never drags `raw_analysis` across the wire). */
  private async fetchFollowedAccountSignals(): Promise<DigestAccountRow[]> {
    return (
      this.accounts
        .createQueryBuilder('account')
        .select([
          'account.id AS id',
          // #4267.1 — le destinataire est CELUI QUI SUIT le compte (suivi explicite), pas son propriétaire.
          'follow.user_id AS user_id',
          'account.workspace_id AS workspace_id',
          'account.company_name AS company_name',
          'account.priority_score AS priority_score',
          'account.recent_signals AS recent_signals',
        ])
        // #4267.1 — les comptes SUIVIS EXPLICITEMENT (une ligne par suiveur), plus le statut commercial.
        .innerJoin(ACCOUNT_FOLLOWS_TABLE, 'follow', 'follow.account_id = account.id AND follow.archived_at IS NULL')
        .where('account.status NOT IN (:...excluded)', { excluded: ['deleted', 'archived'] })
        .andWhere('jsonb_array_length(COALESCE(account.recent_signals, :emptySignals::jsonb)) > 0', {
          emptySignals: '[]',
        })
        .getRawMany<DigestAccountRow>()
    )
  }

  /** Signed one-click unsubscribe (existing `/emails/unsubscribe` route) when
   *  the secret + public URL + workspace are known; otherwise fall back to the
   *  settings screen (footer link only, no RFC 8058 headers). */
  private buildUnsubscribe(
    workspaceId: string | null,
    email: string,
    frontendUrl: string,
  ): { url: string; oneClick: boolean } {
    const secret = this.config.get<string>('internalApiSecret') ?? ''
    const base = this.config.get<string>('apiPublicUrl')
    if (secret && base && workspaceId) {
      const token = signUnsubscribeToken({ workspaceId, email }, secret)
      return { url: `${base.replace(/\/$/, '')}/emails/unsubscribe?token=${encodeURIComponent(token)}`, oneClick: true }
    }
    return { url: `${frontendUrl}/settings/notifications`, oneClick: false }
  }
}

/**
 * Group the week's signals by user then by account. Pure so the windowing /
 * grouping rules are unit-testable without the Nest graph. A user whose
 * followed accounts have NO weekly signal simply does not appear (their week
 * is empty → no email).
 */
export function composeWeeklyDigests(rows: DigestAccountRow[], nowMs: number): UserWeeklyDigest[] {
  const byUser = new Map<string, UserWeeklyDigest>()
  for (const row of rows) {
    const signals = readWeeklySignals(row.recent_signals, nowMs)
    if (signals.length === 0) continue
    const digest = byUser.get(row.user_id) ?? {
      userId: row.user_id,
      workspaceId: null,
      accounts: [],
      totalSignals: 0,
    }
    digest.workspaceId = digest.workspaceId ?? row.workspace_id ?? null
    digest.accounts.push({
      accountId: row.id,
      companyName: row.company_name || 'Ce compte',
      score: row.priority_score ?? null,
      signals,
    })
    digest.totalSignals += signals.length
    byUser.set(row.user_id, digest)
  }
  for (const digest of byUser.values()) {
    digest.accounts.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.signals.length - a.signals.length)
  }
  return [...byUser.values()]
}

/**
 * The account's signals that genuinely belong to THIS week: labelled, dated
 * (parseable through the shared Cockpit/Veille parser) inside the trailing
 * 7-day window (+1 day of timezone tolerance), and not stamped `archive` by
 * the IA. Undated or out-of-window signals are dropped — they are real, but
 * they are NOT « de la semaine » and must never pad the digest.
 */
function readWeeklySignals(value: unknown, nowMs: number): DigestSignal[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const signals: DigestSignal[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const label = readSignalLabel(record)
    if (!label) continue
    const date = typeof record['date'] === 'string' ? record['date'].trim() : ''
    const dateMs = signalDateMs(date)
    // #4832 — une date incomplète vaut la FIN de sa période : « octobre 2026 » n'est pas « de la semaine ».
    if (!isSignalDatedToTheDay(date)) continue
    if (dateMs === null || dateMs < nowMs - WEEK_MS || dateMs > nowMs + DAY_MS) continue
    const freshness = typeof record['freshness'] === 'string' ? record['freshness'] : null
    if (isSignalArchived({ freshness, date }, nowMs)) continue
    const rawSource = record['source']
    const source = typeof rawSource === 'string' && rawSource.trim().length > 0 ? rawSource.trim() : null
    const key = `${label}|${source ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    signals.push({ label, date, dateMs, source })
  }
  return signals.sort((a, b) => b.dateMs - a.dateMs)
}

/** Same label fields (and order) as the Cockpit signals feed — the digest must
 *  title a signal exactly like the product does elsewhere. */
function readSignalLabel(record: Record<string, unknown>): string | null {
  for (const field of ['title', 'label', 'description', 'signal', 'summary'] as const) {
    const value = record[field]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

function toEmailAccount(account: DigestAccount, frontendUrl: string): WeeklyDigestAccount {
  const shown = account.signals.slice(0, MAX_SIGNALS_PER_ACCOUNT)
  return {
    companyName: account.companyName,
    accountUrl: `${frontendUrl}/accounts/${account.accountId}`,
    signals: shown.map(signal => ({ label: signal.label, date: signal.date, source: signal.source })),
    extraSignals: account.signals.length - shown.length,
  }
}

function buildInAppBody(digest: UserWeeklyDigest): string {
  const s = digest.totalSignals
  const a = digest.accounts.length
  const lead = `${s} ${s > 1 ? 'signaux détectés' : 'signal détecté'} cette semaine sur ${a} ${a > 1 ? 'comptes suivis' : 'compte suivi'}.`
  const first = digest.accounts[0]
  return first ? `${lead} En tête : ${first.companyName}.` : lead
}
