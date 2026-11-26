import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  dropInternshipRows,
  isSignalArchived,
  isSignalDatedToTheDay,
  signalDateMs,
  watchlistRuleMatches,
} from '@bellum/contracts'
import { buildWeeklyDigestSubject, type WeeklyDigestAccount } from '@bellum/email'
import { AccountEntity } from '../../database/entities/account.entity'
import { ACCOUNT_FOLLOWS_TABLE } from '../account-follows/account-follow.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WatchlistRuleEntity } from '../watchlist-rules/watchlist-rule.entity'
import { MailerService } from '../mailer/mailer.service'
import { SuppressionService } from '../mailer/suppression.service'
import { signUnsubscribeToken } from '../mailer/unsubscribe-token'
import { NotificationsService } from './notifications.service'
import { WorkspaceBrandService } from '../workspace/workspace-brand.service'

const DAY_MS = 24 * 60 * 60 * 1000
/** Windowing tolerance for timezone/date-only signals (same as the weekly). */
const DAY_TOLERANCE_MS = DAY_MS
/** Skip a resend when a daily digest already went out within this window —
 *  shorter than the weekly's, so a genuine next-day digest is never blocked
 *  but a replayed cron / multi-replica race collapses to one send. */
const DEDUP_WINDOW_MS = 20 * 60 * 60 * 1000
const MAX_SIGNALS_PER_ACCOUNT = 5

type DailyAccountRow = {
  id: string
  user_id: string
  workspace_id: string | null
  company_name: string
  sector: string | null
  priority_score: number | null
  recent_signals: unknown
}

type DailySignal = { label: string; date: string; dateMs: number; source: string | null }
type DailyAccount = { accountId: string; companyName: string; score: number | null; signals: DailySignal[] }
type UserDailyDigest = {
  userId: string
  workspaceId: string | null
  accounts: DailyAccount[]
  totalSignals: number
}

/**
 * Digest QUOTIDIEN de veille (restitution V2 §11 — cadence « digest quotidien »).
 *
 * Jumeau du {@link WeeklyDigestService} en fenêtre 24 h, avec DEUX différences :
 *
 *  - **Opt-in strict** : contrairement à l'hebdo (défaut ON), le quotidien
 *    n'est envoyé qu'aux utilisateurs qui l'ont EXPLICITEMENT activé
 *    (`watchlist_daily_digest === true`). Personne ne reçoit un email par jour
 *    sans l'avoir demandé.
 *  - **Personnalisé par les règles de veille** (§11) : si le workspace de
 *    l'utilisateur a des `watchlist_rules`, seuls les signaux qui MATCHENT une
 *    règle (secteur / techno / compte / besoin / personne — comparaison
 *    déterministe `watchlistRuleMatches`) partent. Aucune règle = digest
 *    complet des comptes suivis (toujours utile).
 *
 * Règles maison identiques à l'hebdo : AUCUN signal inventé (tout vient de
 * `recent_signals` daté et non archivé), journée vide = pas d'email, opt-out
 * suppression list STRICT, idempotence par notification in-app posée AVANT
 * l'email, best-effort par utilisateur.
 */
@Injectable()
export class DailyDigestService {
  private readonly logger = new Logger(DailyDigestService.name)

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly prefs: Repository<NotificationPreferenceEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(WatchlistRuleEntity)
    private readonly rules: Repository<WatchlistRuleEntity>,
    private readonly notifications: NotificationsService,
    private readonly mailer: MailerService,
    private readonly suppression: SuppressionService,
    private readonly config: ConfigService,
    private readonly brands: WorkspaceBrandService,
  ) {}

  async run(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
    const [rows, ruleRows] = await Promise.all([this.fetchFollowedAccountSignals(), this.rules.find()])
    const rulesByWorkspace = groupRulesByWorkspace(ruleRows)
    const digests = composeDailyDigests(rows, now.getTime(), rulesByWorkspace)
    let sent = 0
    let skipped = 0
    for (const digest of digests) {
      try {
        const result = await this.sendDigestToUser(digest, now)
        if (result === 'sent') sent += 1
        else skipped += 1
      } catch (err) {
        skipped += 1
        this.logger.warn('Daily veille digest failed for user (non-fatal)', {
          user: { id: digest.userId },
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    this.logger.log(`Daily veille digest: ${sent} sent, ${skipped} skipped (${digests.length} candidate user(s))`)
    return { sent, skipped }
  }

  private async sendDigestToUser(digest: UserDailyDigest, now: Date): Promise<'sent' | 'skipped'> {
    // Opt-in STRICT : seul un `true` explicite reçoit le quotidien.
    const pref = await this.prefs.findOne({ where: { user_id: digest.userId } })
    if (!pref || pref.watchlist_daily_digest !== true) return 'skipped'

    const alreadySent = await this.notifications.countSince(
      digest.userId,
      'daily_digest',
      new Date(now.getTime() - DEDUP_WINDOW_MS),
    )
    if (alreadySent > 0) return 'skipped'

    const profile = await this.profiles.findOne({ where: { user_id: digest.userId } })
    const email = profile?.email ?? null

    if (email && digest.workspaceId && (await this.suppression.isSuppressed(digest.workspaceId, email))) {
      return 'skipped'
    }

    const subject = buildWeeklyDigestSubject(digest.totalSignals, digest.accounts.length, 'daily')

    await this.notifications.createNotification(digest.userId, {
      type: 'daily_digest',
      title: subject,
      body: buildInAppBody(digest),
      link: '/dashboard',
    })

    try {
      if (email) {
        const frontendUrl = (this.config.get<string>('frontendUrl') ?? 'http://localhost:3000').replace(/\/$/, '')
        const unsubscribe = this.buildUnsubscribe(digest.workspaceId, email, frontendUrl)
        await this.mailer.sendWeeklyDigestEmail({
          to: email,
          // L'expéditeur déclaré par l'espace, ou le nôtre (délivrabilité).
          from: await this.brands.getSendingAddress(digest.workspaceId),
          cadence: 'daily',
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
      this.logger.warn('Daily veille digest email failed (in-app already delivered)', {
        user: { id: digest.userId },
        error: err instanceof Error ? err.message : String(err),
      })
    }

    return 'sent'
  }

  private async fetchFollowedAccountSignals(): Promise<DailyAccountRow[]> {
    return (
      this.accounts
        .createQueryBuilder('account')
        .select([
          'account.id AS id',
          // #4267.1 — le destinataire est CELUI QUI SUIT le compte (suivi explicite), pas son propriétaire.
          'follow.user_id AS user_id',
          'account.workspace_id AS workspace_id',
          'account.company_name AS company_name',
          'account.sector AS sector',
          'account.priority_score AS priority_score',
          'account.recent_signals AS recent_signals',
        ])
        // #4267.1 — les comptes SUIVIS EXPLICITEMENT (une ligne par suiveur), plus le statut commercial.
        .innerJoin(ACCOUNT_FOLLOWS_TABLE, 'follow', 'follow.account_id = account.id AND follow.archived_at IS NULL')
        .where('account.status NOT IN (:...excluded)', { excluded: ['deleted', 'archived'] })
        .andWhere('jsonb_array_length(COALESCE(account.recent_signals, :emptySignals::jsonb)) > 0', {
          emptySignals: '[]',
        })
        .getRawMany<DailyAccountRow>()
    )
  }

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

/** Rules keyed by workspace — a user's digest is filtered by the rules of the
 *  workspace its followed accounts belong to. */
export function groupRulesByWorkspace(rows: WatchlistRuleEntity[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const row of rows) {
    const list = map.get(row.workspace_id) ?? []
    list.push(row.value)
    map.set(row.workspace_id, list)
  }
  return map
}

/**
 * Group the day's signals by user then by account, honouring the workspace's
 * watchlist rules. Pure so the windowing / grouping / filtering rules are
 * unit-testable without the Nest graph.
 */
export function composeDailyDigests(
  rows: DailyAccountRow[],
  nowMs: number,
  rulesByWorkspace: Map<string, string[]>,
): UserDailyDigest[] {
  const byUser = new Map<string, UserDailyDigest>()
  for (const row of rows) {
    const dayWindow = readDailySignals(row.recent_signals, nowMs)
    if (dayWindow.length === 0) continue

    // Filtre par règles du workspace (§11). Aucune règle = pas de filtre.
    const ruleValues = row.workspace_id ? (rulesByWorkspace.get(row.workspace_id) ?? []) : []
    const signals =
      ruleValues.length === 0
        ? dayWindow
        : dayWindow.filter(signal =>
            ruleValues.some(value =>
              watchlistRuleMatches(value, signal.label, signal.source, row.company_name, row.sector),
            ),
          )
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

/** The account's signals dated inside the trailing 24 h window, labelled and
 *  not archived. Same shared parser/rules as the weekly digest — only the
 *  window differs. */
function readDailySignals(value: unknown, nowMs: number): DailySignal[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const signals: DailySignal[] = []
  // #4044 — une offre de stage n'est jamais un signal : pas dans l'e-mail du matin.
  for (const raw of dropInternshipRows(value, { jobsOnly: true })) {
    if (!raw || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    const label = readSignalLabel(record)
    if (!label) continue
    const date = typeof record['date'] === 'string' ? record['date'].trim() : ''
    const dateMs = signalDateMs(date)
    // #4832 — une date incomplète vaut la FIN de sa période : « octobre 2026 » n'est pas « de la semaine ».
    if (!isSignalDatedToTheDay(date)) continue
    if (dateMs === null || dateMs < nowMs - DAY_MS || dateMs > nowMs + DAY_TOLERANCE_MS) continue
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

function readSignalLabel(record: Record<string, unknown>): string | null {
  for (const field of ['title', 'label', 'description', 'signal', 'summary'] as const) {
    const value = record[field]
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  }
  return null
}

function toEmailAccount(account: DailyAccount, frontendUrl: string): WeeklyDigestAccount {
  const shown = account.signals.slice(0, MAX_SIGNALS_PER_ACCOUNT)
  return {
    companyName: account.companyName,
    accountUrl: `${frontendUrl}/accounts/${account.accountId}`,
    signals: shown.map(signal => ({ label: signal.label, date: signal.date, source: signal.source })),
    extraSignals: account.signals.length - shown.length,
  }
}

function buildInAppBody(digest: UserDailyDigest): string {
  const s = digest.totalSignals
  const a = digest.accounts.length
  const lead = `${s} ${s > 1 ? 'signaux détectés' : 'signal détecté'} aujourd'hui sur ${a} ${a > 1 ? 'comptes suivis' : 'compte suivi'}.`
  const first = digest.accounts[0]
  return first ? `${lead} En tête : ${first.companyName}.` : lead
}
