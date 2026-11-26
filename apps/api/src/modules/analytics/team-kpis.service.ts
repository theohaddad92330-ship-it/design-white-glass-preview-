import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { MessageSendBreakdown } from '@bellum/contracts'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { countAccountPopulation, type AccountPopulation, type AccountStatusCell } from '../accounts/account-counts'
import { MESSAGE_SEND_SQL } from '../actions/message-send-provenance'
import { withheldBelowThreshold, type WithheldMetric } from './product-analytics-read.service'

/**
 * Manager team KPIs — operator/backoffice view (dashboard-manager, behind the
 * internal-secret guard). Aggregates PER WORKSPACE (team) and PER COMMERCIAL
 * (member drill-down) over the tables that already exist in prod:
 * `analysis_runs`, `accounts`, `contacts` pipeline via `accounts.commercial_status`,
 * `product_events`, `user_actions` and `credit_ledger`.
 *
 * Everything is either directly measured or explicitly surfaced as
 * non-derivable (null + `notes`) — we NEVER fabricate a figure. Read-only.
 *
 * NOTE: this is the cross-tenant sibling of the end-user `ManagerService`
 * (`GET /manager/team-stats`, JWT + workspace-role gate) — same philosophy,
 * different audience/gate, so it lives with the operator analytics.
 */

/** Windowed activity + funnel KPIs shared by the team row and the member row.
 *  Not exported: consumed only through the exported report types below. */
type TeamActivityKpis = {
  /** `analysis_runs` created in-window. */
  analysesStarted: number
  /** Of those, runs whose status reached `completed`. */
  analysesCompleted: number
  /** Snapshot (#4423.2, `accounts/account-counts.ts`) : comptes dont une analyse a été lancée, archivés compris. */
  accountsLaunched: number
  /** Snapshot : comptes `status = 'completed'` — la même « terminée » que la fiche utilisateur. */
  accountsCompleted: number
  /** Snapshot : comptes suivis (statut commercial suivi, hors supprimés). */
  followedAccounts: number
  /** Snapshot: accounts whose `commercial_status` ≠ archived. */
  activeAccounts: number
  /** Snapshot: accounts currently at `commercial_status = 'opportunity'`. */
  hotAccounts: number
  /** `product_events.contact_enriched` in-window. */
  contactsEnriched: number
  /**
   * Total des envois in-window, toutes provenances confondues.
   *
   * ⚠️ Ce total mélange par nature des envois PROUVÉS (expédiés par Bellum) et
   * AUTO-DÉCLARÉS (le commercial dit avoir envoyé sur LinkedIn — Bellum n'a
   * aucune API de messagerie et n'envoie rien). Il ne doit JAMAIS être affiché
   * seul : `messages` porte la décomposition, et l'UI manager l'affiche.
   * Sans elle, le chiffre est auto-gonflable — cliquer « j'ai envoyé » suffit.
   */
  messagesSent: number
  /** Décomposition de `messagesSent` par provenance (vérifié / déclaré / non attribué). */
  messages: MessageSendBreakdown
  /** Rep-logged `response_received` actions in-window (declarative signal). */
  responsesReceived: number
  /** Rep-logged `rdv_obtained` actions in-window (declarative signal). */
  rdvObtained: number
  /** Rep-logged `deal_signed` actions in-window (declarative signal). */
  dealsSigned: number
  /** responsesReceived / messagesSent — null (non-derivable) when 0 messages. */
  responseRate: number | null
  /** rdvObtained / messagesSent — null when 0 messages. */
  rdvRate: number | null
  /** `credit_ledger` consume_analysis + consume_enrichment in-window (positive). */
  creditsConsumed: number
}

/**
 * Charge d'actions ENCORE OUVERTES portée par un commercial (ou par l'équipe).
 * Source : `action_plan_items`, scopé à l'équipe par le COMPTE qui porte l'action
 * (`accounts.workspace_id` — la table d'items n'a pas de colonne workspace).
 * Not exported: consumed only through the exported report types below.
 */
type ActionWorkload = {
  /** Ni faite, ni reportée dans le futur, sur un compte non archivé. */
  open: number
  /** De celles-ci : échéance dépassée (`due_date < CURRENT_DATE`). */
  overdue: number
  /** De celles-ci : échéance dans les 7 prochains jours (aujourd'hui inclus). */
  dueSoon: number
  /** De celles-ci : sans échéance — aucune urgence datée à opposer. */
  undated: number
}

const EMPTY_WORKLOAD: ActionWorkload = { open: 0, overdue: 0, dueSoon: 0, undated: 0 }

/** Fenêtre « à échéance » de la charge d'actions, en jours. */
const DUE_SOON_DAYS = 7

/** One team (workspace) row of the summary. Not exported (in-file consumers only). */
type TeamKpisRow = TeamActivityKpis & {
  workspaceId: string
  workspaceName: string | null
  memberCount: number
  /** Current members with an `onboarding_completed` event (ever). */
  onboardedMembers: number
  /** Of those, members with an `analysis_started` at/after that completion. */
  activatedMembers: number
  /**
   * activatedMembers / onboardedMembers — `null` when nobody onboarded, AND
   * when the denominator is below the publication threshold (#1681.1).
   * {@link activationWithheld} says which of the two.
   */
  activationRate: number | null
  /**
   * #1681.1 — pourquoi le taux ci-dessus est absent, quand il l'est POUR CETTE
   * RAISON. `null` = rien n'a été retenu.
   *
   * ⚠️ C'est ICI que la règle 1 et la règle 5 de `c64_analytique_produit` se
   * croisent, et c'est la ligne la plus dangereuse des deux services
   * historiques : ce tableau est PAR ESPACE NOMMÉ, dans le back-office. « Chez
   * cette ESN, 50 % d'activation » sur deux membres onboardés est une phrase
   * sur une personne, lisible par un opérateur, à côté du nom de son employeur.
   */
  activationWithheld: WithheldMetric | null
}

export type TeamKpisSummary = {
  windowDays: number
  generatedAt: string
  teams: TeamKpisRow[]
  /** Honest caveats: what each figure means + what is NOT derivable. */
  notes: string[]
}

/** One commercial (member) row of the drill-down. Not exported (in-file only). */
type TeamMemberKpis = TeamActivityKpis & {
  userId: string
  name: string
  email: string | null
  role: string
  /** First `onboarding_completed` — null when never emitted (pre-instrumentation). */
  onboardedAt: string | null
  /** First `analysis_started` at/after onboarding — null = not activated OR not derivable. */
  activatedAt: string | null
  /** MAX(user_actions.created_at) all-time. */
  lastActivityAt: string | null
  /**
   * Comptes non archivés dont ce commercial est le RESPONSABLE désigné
   * (`accounts.assigned_to`). À ne pas confondre avec `activeAccounts`, qui
   * compte les comptes qu'il a CRÉÉS (`accounts.user_id`) : un portefeuille se
   * transmet, une création non.
   */
  portfolioAccounts: number
  /** Charge d'actions ouvertes qu'il porte (délégataire, sinon créateur). */
  workload: ActionWorkload
}

export type TeamKpisDetail = {
  windowDays: number
  generatedAt: string
  workspace: { id: string; name: string | null; memberCount: number }
  /** Team roll-up INCLUDING activity of since-departed members. */
  totals: TeamActivityKpis
  /** Accounts by `commercial_status` (inbox/watching/opportunity/customer/archived). */
  pipeline: Array<{ status: string; count: number }>
  members: TeamMemberKpis[]
  /** In-window consumed credits whose `actor_user_id` is NULL — real spend that
   *  cannot be attributed to a commercial (never spread arbitrarily). */
  unattributedCredits: number
  /** Charge d'actions ouvertes de TOUTE l'équipe (porteurs partis compris). */
  workload: ActionWorkload
  /** Actions ouvertes portées par un utilisateur qui n'est plus membre — du
   *  travail réel que plus personne dans l'équipe ne voit passer. */
  offTeamOpenActions: number
  /** Répartition du portefeuille : comptes non archivés avec / sans responsable
   *  désigné (`accounts.assigned_to`). Les deux sommes = comptes actifs. */
  portfolio: { assigned: number; unassigned: number }
  notes: string[]
}

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 365

/** Every caveat the consumer must know — mirrors AnalyticsOverviewService.notes. */
const KPI_NOTES = [
  'Fenêtre glissante : analyses, contacts enrichis, messages/actions et crédits sont comptés sur la fenêtre ; comptes actifs et pipeline sont un instantané de l’état commercial courant (non fenêtré).',
  'Taux de conversion des actions = réponses (et RDV) déclarées par le commercial dans Bellum ÷ messages envoyés — un proxy déclaratif, pas une mesure e-mail vérifiée. null quand aucun message envoyé sur la fenêtre.',
  '« Messages envoyés » agrège deux natures que la décomposition (messages.verified / declared / unattributed) sépare : « verified » = message réellement expédié par Bellum (email, preuve de livraison) ; « declared » = le commercial a déclaré avoir envoyé lui-même sur LinkedIn (Bellum n’a aucune API de messagerie et n’envoie rien — c’est du travail réel mais invérifiable) ; « unattributed » = lignes d’historique antérieures au marquage de provenance, dont la nature ne peut pas être prouvée. Le total seul ne doit pas servir à évaluer un commercial : la part déclarée est auto-déclarative, donc gonflable.',
  'Activation = onboarding_completed suivi d’une première analyse (product_events). Les utilisateurs inscrits avant l’instrumentation n’ont pas d’événement d’onboarding : leur activation est non disponible (null), jamais inventée.',
  'Le taux d’activation d’une équipe est RETENU (null, et `activationWithheld` dit pourquoi) quand le nombre de membres onboardés est sous le minimum d’agrégation de la doctrine (c64_analytique_produit, règle 1). Sous ce seuil, un pourcentage à côté du nom d’un client désigne une personne. Retenu n’est JAMAIS 0 : `activationWithheld.subjects` dit combien de membres ont été observés.',
  'Crédits attribués via credit_ledger.actor_user_id ; les mouvements sans acteur résolu sont comptés au niveau équipe et exposés en « non attribués », jamais répartis arbitrairement.',
  'Le CA généré / la conversion en deal CRM réel n’est pas dérivable des données actuelles (pas de montant ni d’issue CRM) — non affiché plutôt qu’estimé. Seul deal_signed (déclaratif) est compté.',
  'Les totaux équipe incluent l’activité de membres ayant depuis quitté le workspace ; les lignes par commercial ne listent que les membres actuels.',
  'Charge d’actions = éléments de plan encore OUVERTS (ni faits, ni reportés à plus tard) portant sur un compte non archivé — un instantané, pas une fenêtre. Le porteur est le délégataire (action_plan_items.assigned_to) sinon le créateur de l’action. « En retard » = échéance dépassée ; « à échéance » = dans les 7 jours ; les actions sans date sont comptées à part (aucune urgence datée à leur opposer). Les actions dont le porteur a quitté l’équipe sont exposées séparément, jamais réaffectées.',
  'Portefeuille = comptes non archivés dont le commercial est le RESPONSABLE désigné (accounts.assigned_to). C’est une autre grandeur que « Comptes actifs », qui compte les comptes qu’il a CRÉÉS : un portefeuille se transmet, une création non. Les comptes sans responsable sont comptés à part et jamais répartis.',
]

type MemberRow = {
  userId: string
  role: string
  firstName: string | null
  lastName: string | null
  email: string | null
}

type RunsAgg = { started: number; completed: number }
/** #4423.2 — les cellules d'un GROUP BY, ramenées à une population par la définition commune. */
function populationsBy<R extends { status: string; commercialStatus: string; count: unknown }>(
  rows: readonly R[],
  keyOf: (row: R) => string,
): Map<string, AccountsAgg> {
  const cells = new Map<string, AccountStatusCell[]>()
  for (const row of rows) {
    const key = keyOf(row)
    const list = cells.get(key) ?? []
    list.push({ status: row.status, commercialStatus: row.commercialStatus, count: count(row.count) })
    cells.set(key, list)
  }
  return new Map([...cells].map(([key, list]) => [key, countAccountPopulation(list)]))
}

type AccountsAgg = AccountPopulation

const NO_ACCOUNTS: AccountsAgg = { launched: 0, completed: 0, active: 0, followed: 0, hot: 0 }
type ActionsAgg = { messages: MessageSendBreakdown; responses: number; rdv: number; deals: number }

const EMPTY_ACTIONS_AGG: ActionsAgg = {
  messages: { verified: 0, declared: 0, unattributed: 0, total: 0 },
  responses: 0,
  rdv: 0,
  deals: 0,
}

/** Assemble la décomposition d'envois d'une ligne agrégée SQL. */
function messageBreakdown(row: {
  messagesSent: unknown
  messagesVerified: unknown
  messagesDeclared: unknown
  messagesUnattributed: unknown
}): MessageSendBreakdown {
  return {
    verified: count(row.messagesVerified),
    declared: count(row.messagesDeclared),
    unattributed: count(row.messagesUnattributed),
    total: count(row.messagesSent),
  }
}

/** Somme terme à terme de décompositions d'envois. */
function sumBreakdowns(items: readonly MessageSendBreakdown[]): MessageSendBreakdown {
  return items.reduce<MessageSendBreakdown>(
    (acc, b) => ({
      verified: acc.verified + b.verified,
      declared: acc.declared + b.declared,
      unattributed: acc.unattributed + b.unattributed,
      total: acc.total + b.total,
    }),
    { verified: 0, declared: 0, unattributed: 0, total: 0 },
  )
}

/** A finite non-null count (Postgres aggregates can arrive as strings). */
function count(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** numerator / denominator rounded to 2 dp — null when not derivable (0 denom). */
function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) / 100 : null
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function displayName(m: MemberRow): string {
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return full || m.email?.split('@')[0] || 'Membre'
}

/** Parse + clamp the window, falling back to the default on garbage. */
function clampWindow(value: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, n))
}

@Injectable()
export class TeamKpisService {
  constructor(
    // One repo is enough: all rollups run as raw SQL via `manager.query`, which
    // can read any table — same pattern as AnalyticsOverviewService.
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.events.manager.query(sql, params) as Promise<T[]>
  }

  // ── Summary: one row per workspace ─────────────────────────────────────────

  async getTeams(windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<TeamKpisSummary> {
    const windowDays = clampWindow(windowDaysInput)

    const [teams, runs, accounts, enriched, actions, credits, activation] = await Promise.all([
      this.listTeams(),
      this.runsByWorkspace(windowDays),
      this.accountsByWorkspace(),
      this.enrichedByWorkspace(windowDays),
      this.actionsByWorkspace(windowDays),
      this.creditsByWorkspace(windowDays),
      this.activationByWorkspace(),
    ])

    const rows: TeamKpisRow[] = teams.map(t => {
      const r = runs.get(t.workspaceId) ?? { started: 0, completed: 0 }
      const a = accounts.get(t.workspaceId) ?? NO_ACCOUNTS
      const act = actions.get(t.workspaceId) ?? EMPTY_ACTIONS_AGG
      const activ = activation.get(t.workspaceId) ?? { onboarded: 0, activated: 0 }
      // #1681.1 — LE SEUIL, APPLIQUÉ, et l'ordre compte : il passe AVANT le
      // calcul, pas après. Le registre de doctrine nommait ce fichier comme
      // l'un des deux qui « publient leurs agrégats quel que soit l'effectif ».
      //
      // ⚠️ Ce taux-ci et pas `responseRate`/`rdvRate` : ce qui décide est ce que
      // compte le DÉNOMINATEUR. Ici ce sont des MEMBRES — des personnes — dans
      // un espace NOMMÉ. Pour les deux autres, c'est un nombre de messages
      // envoyés : un volume de travail, pas un effectif de personnes.
      const activationWithheld = withheldBelowThreshold('activationRate', activ.onboarded)
      return {
        workspaceId: t.workspaceId,
        workspaceName: t.workspaceName,
        memberCount: t.memberCount,
        analysesStarted: r.started,
        analysesCompleted: r.completed,
        accountsLaunched: a.launched,
        accountsCompleted: a.completed,
        followedAccounts: a.followed,
        activeAccounts: a.active,
        hotAccounts: a.hot,
        contactsEnriched: enriched.get(t.workspaceId) ?? 0,
        messagesSent: act.messages.total,
        messages: act.messages,
        responsesReceived: act.responses,
        rdvObtained: act.rdv,
        dealsSigned: act.deals,
        responseRate: ratioOrNull(act.responses, act.messages.total),
        rdvRate: ratioOrNull(act.rdv, act.messages.total),
        creditsConsumed: credits.get(t.workspaceId) ?? 0,
        onboardedMembers: activ.onboarded,
        activatedMembers: activ.activated,
        activationRate: activationWithheld ? null : ratioOrNull(activ.activated, activ.onboarded),
        activationWithheld,
      }
    })

    return {
      windowDays,
      generatedAt: new Date().toISOString(),
      teams: rows,
      notes: KPI_NOTES,
    }
  }

  /** `-- q:teams` — every workspace + its member count. */
  private async listTeams(): Promise<
    Array<{ workspaceId: string; workspaceName: string | null; memberCount: number }>
  > {
    const rows = await this.query<{ workspaceId: string; workspaceName: string | null; memberCount: unknown }>(
      `-- q:teams
       SELECT w.id AS "workspaceId", w.name AS "workspaceName", COUNT(m.user_id)::int AS "memberCount"
       FROM workspaces w
       LEFT JOIN workspace_members m ON m.workspace_id = w.id
       GROUP BY w.id, w.name
       ORDER BY w.name ASC NULLS LAST, w.id ASC`,
      [],
    )
    return rows.map(r => ({
      workspaceId: r.workspaceId,
      workspaceName: r.workspaceName,
      memberCount: count(r.memberCount),
    }))
  }

  /** `-- q:runs_ws` — analyses started/completed per workspace in-window. */
  private async runsByWorkspace(windowDays: number): Promise<Map<string, RunsAgg>> {
    const rows = await this.query<{ workspaceId: string; started: unknown; completed: unknown }>(
      `-- q:runs_ws
       SELECT workspace_id AS "workspaceId",
              COUNT(*)::int AS "started",
              COUNT(*) FILTER (WHERE status = 'completed')::int AS "completed"
       FROM analysis_runs
       WHERE workspace_id IS NOT NULL
         AND created_at >= now() - make_interval(days => $1)
       GROUP BY workspace_id`,
      [windowDays],
    )
    return new Map(rows.map(r => [r.workspaceId, { started: count(r.started), completed: count(r.completed) }]))
  }

  /** `-- q:accounts_ws` — snapshot des comptes par (statut, statut commercial), lu par la définition commune. */
  private async accountsByWorkspace(): Promise<Map<string, AccountsAgg>> {
    const rows = await this.query<{ workspaceId: string; status: string; commercialStatus: string; count: unknown }>(
      `-- q:accounts_ws
       SELECT workspace_id AS "workspaceId", status, commercial_status AS "commercialStatus", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id IS NOT NULL
       GROUP BY workspace_id, status, commercial_status`,
      [],
    )
    return populationsBy(rows, r => r.workspaceId)
  }

  /** `-- q:enriched_ws` — contact_enriched events per workspace in-window. */
  private async enrichedByWorkspace(windowDays: number): Promise<Map<string, number>> {
    const rows = await this.query<{ workspaceId: string; enriched: unknown }>(
      `-- q:enriched_ws
       SELECT workspace_id AS "workspaceId", COUNT(*)::int AS "enriched"
       FROM product_events
       WHERE event_name = 'contact_enriched'
         AND workspace_id IS NOT NULL
         AND occurred_at >= now() - make_interval(days => $1)
       GROUP BY workspace_id`,
      [windowDays],
    )
    return new Map(rows.map(r => [r.workspaceId, count(r.enriched)]))
  }

  /** `-- q:actions_ws` — outbound action funnel per workspace in-window. */
  private async actionsByWorkspace(windowDays: number): Promise<Map<string, ActionsAgg>> {
    const rows = await this.query<{
      workspaceId: string
      messagesSent: unknown
      messagesVerified: unknown
      messagesDeclared: unknown
      messagesUnattributed: unknown
      responses: unknown
      rdv: unknown
      deals: unknown
    }>(
      `-- q:actions_ws
       SELECT workspace_id AS "workspaceId",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.total})::int AS "messagesSent",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.verified})::int AS "messagesVerified",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.declared})::int AS "messagesDeclared",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.unattributed})::int AS "messagesUnattributed",
              COUNT(*) FILTER (WHERE action_type = 'response_received')::int AS "responses",
              COUNT(*) FILTER (WHERE action_type = 'rdv_obtained')::int AS "rdv",
              COUNT(*) FILTER (WHERE action_type = 'deal_signed')::int AS "deals"
       FROM user_actions
       WHERE workspace_id IS NOT NULL
         AND created_at >= now() - make_interval(days => $1)
       GROUP BY workspace_id`,
      [windowDays],
    )
    return new Map(
      rows.map(r => [
        r.workspaceId,
        {
          messages: messageBreakdown(r),
          responses: count(r.responses),
          rdv: count(r.rdv),
          deals: count(r.deals),
        },
      ]),
    )
  }

  /** `-- q:credits_ws` — consumed credits per workspace in-window (positive). */
  private async creditsByWorkspace(windowDays: number): Promise<Map<string, number>> {
    const rows = await this.query<{ workspaceId: string; consumed: unknown }>(
      `-- q:credits_ws
       SELECT workspace_id AS "workspaceId",
              COALESCE(-SUM(delta) FILTER (WHERE kind IN ('consume_analysis', 'consume_enrichment')), 0)::int AS "consumed"
       FROM credit_ledger
       WHERE workspace_id IS NOT NULL
         AND created_at >= now() - make_interval(days => $1)
       GROUP BY workspace_id`,
      [windowDays],
    )
    return new Map(rows.map(r => [r.workspaceId, count(r.consumed)]))
  }

  /** `-- q:activation_ws` — per workspace: current members who completed
   *  onboarding (ever) + those with an analysis at/after that completion. */
  private async activationByWorkspace(): Promise<Map<string, { onboarded: number; activated: number }>> {
    const rows = await this.query<{ workspaceId: string; onboarded: unknown; activated: unknown }>(
      `-- q:activation_ws
       SELECT m.workspace_id AS "workspaceId",
              COUNT(*)::int AS "onboarded",
              COUNT(*) FILTER (WHERE fa.first_analysis IS NOT NULL)::int AS "activated"
       FROM workspace_members m
       JOIN (
         SELECT user_id, MIN(occurred_at) AS completed_at
         FROM product_events
         WHERE event_name = 'onboarding_completed'
         GROUP BY user_id
       ) oc ON oc.user_id = m.user_id
       LEFT JOIN LATERAL (
         SELECT MIN(a.occurred_at) AS first_analysis
         FROM product_events a
         WHERE a.user_id = m.user_id
           AND a.event_name = 'analysis_started'
           AND a.occurred_at >= oc.completed_at
       ) fa ON true
       GROUP BY m.workspace_id`,
      [],
    )
    return new Map(rows.map(r => [r.workspaceId, { onboarded: count(r.onboarded), activated: count(r.activated) }]))
  }

  // ── Drill-down: one row per commercial of a workspace ─────────────────────

  async getTeamDetail(workspaceId: string, windowDaysInput = DEFAULT_WINDOW_DAYS): Promise<TeamKpisDetail> {
    const windowDays = clampWindow(windowDaysInput)

    const workspace = await this.findWorkspace(workspaceId)
    if (!workspace) throw new NotFoundException('Workspace introuvable.')

    const [
      members,
      runs,
      accounts,
      enriched,
      actions,
      credits,
      activation,
      lastActivity,
      pipeline,
      workloads,
      portfolio,
    ] = await Promise.all([
      this.listMembers(workspaceId),
      this.runsByMember(workspaceId, windowDays),
      this.accountsByMember(workspaceId),
      this.enrichedByMember(workspaceId, windowDays),
      this.actionsByMember(workspaceId, windowDays),
      this.creditsByMember(workspaceId, windowDays),
      this.activationByMember(workspaceId),
      this.lastActivityByMember(workspaceId),
      this.pipelineByStatus(workspaceId),
      this.workloadByMember(workspaceId),
      this.portfolioByMember(workspaceId),
    ])

    const memberRows: TeamMemberKpis[] = members
      .map(m => {
        const r = runs.get(m.userId) ?? { started: 0, completed: 0 }
        const a = accounts.get(m.userId) ?? NO_ACCOUNTS
        const act = actions.get(m.userId) ?? EMPTY_ACTIONS_AGG
        const activ = activation.get(m.userId)
        return {
          userId: m.userId,
          name: displayName(m),
          email: m.email,
          role: m.role,
          analysesStarted: r.started,
          analysesCompleted: r.completed,
          accountsLaunched: a.launched,
          accountsCompleted: a.completed,
          followedAccounts: a.followed,
          activeAccounts: a.active,
          hotAccounts: a.hot,
          contactsEnriched: enriched.get(m.userId) ?? 0,
          messagesSent: act.messages.total,
          messages: act.messages,
          responsesReceived: act.responses,
          rdvObtained: act.rdv,
          dealsSigned: act.deals,
          responseRate: ratioOrNull(act.responses, act.messages.total),
          rdvRate: ratioOrNull(act.rdv, act.messages.total),
          creditsConsumed: credits.attributed.get(m.userId) ?? 0,
          onboardedAt: activ?.onboardedAt ?? null,
          activatedAt: activ?.activatedAt ?? null,
          lastActivityAt: lastActivity.get(m.userId) ?? null,
          portfolioAccounts: portfolio.assignedByUser.get(m.userId) ?? 0,
          workload: workloads.get(m.userId) ?? EMPTY_WORKLOAD,
        }
      })
      .sort((a, b) => b.messagesSent - a.messagesSent || b.analysesStarted - a.analysesStarted)

    // Team totals from the RAW aggregates (not the member rows): activity of a
    // since-departed member is still real team output and must not vanish.
    const totalRuns = sumValues([...runs.values()], r => r.started)
    const totalCompleted = sumValues([...runs.values()], r => r.completed)
    const totalMessages = sumBreakdowns([...actions.values()].map(a => a.messages))
    const totalResponses = sumValues([...actions.values()], a => a.responses)
    const totalRdv = sumValues([...actions.values()], a => a.rdv)
    const totalDeals = sumValues([...actions.values()], a => a.deals)
    const totalAttributedCredits = sumValues([...credits.attributed.values()], c => c)

    const totals: TeamActivityKpis = {
      analysesStarted: totalRuns,
      analysesCompleted: totalCompleted,
      accountsLaunched: sumValues([...accounts.values()], a => a.launched),
      accountsCompleted: sumValues([...accounts.values()], a => a.completed),
      followedAccounts: sumValues([...accounts.values()], a => a.followed),
      activeAccounts: sumValues([...accounts.values()], a => a.active),
      hotAccounts: sumValues([...accounts.values()], a => a.hot),
      contactsEnriched: sumValues([...enriched.values()], e => e),
      messagesSent: totalMessages.total,
      messages: totalMessages,
      responsesReceived: totalResponses,
      rdvObtained: totalRdv,
      dealsSigned: totalDeals,
      responseRate: ratioOrNull(totalResponses, totalMessages.total),
      rdvRate: ratioOrNull(totalRdv, totalMessages.total),
      creditsConsumed: totalAttributedCredits + credits.unattributed,
    }

    // Charge d'équipe : la somme des porteurs, membres actuels ET partis — une
    // action ouverte reste ouverte quand son porteur s'en va. La part orpheline
    // est isolée plutôt que réaffectée à quelqu'un qui ne l'a jamais vue.
    const memberIds = new Set(members.map(m => m.userId))
    const teamWorkload = sumWorkloads([...workloads.values()])
    const offTeamOpenActions = sumValues(
      [...workloads.entries()].filter(([userId]) => !memberIds.has(userId)),
      ([, w]) => w.open,
    )

    return {
      windowDays,
      generatedAt: new Date().toISOString(),
      workspace: { id: workspace.id, name: workspace.name, memberCount: members.length },
      totals,
      pipeline,
      members: memberRows,
      unattributedCredits: credits.unattributed,
      workload: teamWorkload,
      offTeamOpenActions,
      portfolio: { assigned: portfolio.assigned, unassigned: portfolio.unassigned },
      notes: KPI_NOTES,
    }
  }

  /** `-- q:workspace` — the workspace (also the 404 check). */
  private async findWorkspace(workspaceId: string): Promise<{ id: string; name: string | null } | null> {
    const rows = await this.query<{ id: string; name: string | null }>(
      `-- q:workspace
       SELECT id, name FROM workspaces WHERE id = $1`,
      [workspaceId],
    )
    return rows[0] ?? null
  }

  /** `-- q:members` — current members + profile identity. */
  private async listMembers(workspaceId: string): Promise<MemberRow[]> {
    return this.query<MemberRow>(
      `-- q:members
       SELECT m.user_id AS "userId", m.role AS "role",
              p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email"
       FROM workspace_members m
       LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE m.workspace_id = $1`,
      [workspaceId],
    )
  }

  /** `-- q:runs_member` — analyses started/completed per commercial in-window. */
  private async runsByMember(workspaceId: string, windowDays: number): Promise<Map<string, RunsAgg>> {
    const rows = await this.query<{ userId: string; started: unknown; completed: unknown }>(
      `-- q:runs_member
       SELECT user_id AS "userId",
              COUNT(*)::int AS "started",
              COUNT(*) FILTER (WHERE status = 'completed')::int AS "completed"
       FROM analysis_runs
       WHERE workspace_id = $1
         AND created_at >= now() - make_interval(days => $2)
       GROUP BY user_id`,
      [workspaceId, windowDays],
    )
    return new Map(rows.map(r => [r.userId, { started: count(r.started), completed: count(r.completed) }]))
  }

  /** `-- q:accounts_member` — snapshot par commercial, même définition que la fiche utilisateur. */
  private async accountsByMember(workspaceId: string): Promise<Map<string, AccountsAgg>> {
    const rows = await this.query<{ userId: string; status: string; commercialStatus: string; count: unknown }>(
      `-- q:accounts_member
       SELECT user_id AS "userId", status, commercial_status AS "commercialStatus", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1
       GROUP BY user_id, status, commercial_status`,
      [workspaceId],
    )
    return populationsBy(rows, r => r.userId)
  }

  /** `-- q:enriched_member` — contact_enriched events per commercial in-window. */
  private async enrichedByMember(workspaceId: string, windowDays: number): Promise<Map<string, number>> {
    const rows = await this.query<{ userId: string; enriched: unknown }>(
      `-- q:enriched_member
       SELECT user_id AS "userId", COUNT(*)::int AS "enriched"
       FROM product_events
       WHERE event_name = 'contact_enriched'
         AND workspace_id = $1
         AND occurred_at >= now() - make_interval(days => $2)
       GROUP BY user_id`,
      [workspaceId, windowDays],
    )
    return new Map(rows.map(r => [r.userId, count(r.enriched)]))
  }

  /** `-- q:actions_member` — outbound action funnel per commercial in-window. */
  private async actionsByMember(workspaceId: string, windowDays: number): Promise<Map<string, ActionsAgg>> {
    const rows = await this.query<{
      userId: string
      messagesSent: unknown
      messagesVerified: unknown
      messagesDeclared: unknown
      messagesUnattributed: unknown
      responses: unknown
      rdv: unknown
      deals: unknown
    }>(
      `-- q:actions_member
       SELECT user_id AS "userId",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.total})::int AS "messagesSent",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.verified})::int AS "messagesVerified",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.declared})::int AS "messagesDeclared",
              COUNT(*) FILTER (WHERE ${MESSAGE_SEND_SQL.unattributed})::int AS "messagesUnattributed",
              COUNT(*) FILTER (WHERE action_type = 'response_received')::int AS "responses",
              COUNT(*) FILTER (WHERE action_type = 'rdv_obtained')::int AS "rdv",
              COUNT(*) FILTER (WHERE action_type = 'deal_signed')::int AS "deals"
       FROM user_actions
       WHERE workspace_id = $1
         AND created_at >= now() - make_interval(days => $2)
       GROUP BY user_id`,
      [workspaceId, windowDays],
    )
    return new Map(
      rows.map(r => [
        r.userId,
        {
          messages: messageBreakdown(r),
          responses: count(r.responses),
          rdv: count(r.rdv),
          deals: count(r.deals),
        },
      ]),
    )
  }

  /** `-- q:credits_member` — consumed credits per actor in-window; a NULL actor
   *  is real spend that cannot be attributed to a commercial. */
  private async creditsByMember(
    workspaceId: string,
    windowDays: number,
  ): Promise<{ attributed: Map<string, number>; unattributed: number }> {
    const rows = await this.query<{ userId: string | null; consumed: unknown }>(
      `-- q:credits_member
       SELECT actor_user_id AS "userId",
              COALESCE(-SUM(delta) FILTER (WHERE kind IN ('consume_analysis', 'consume_enrichment')), 0)::int AS "consumed"
       FROM credit_ledger
       WHERE workspace_id = $1
         AND created_at >= now() - make_interval(days => $2)
       GROUP BY actor_user_id`,
      [workspaceId, windowDays],
    )
    const attributed = new Map<string, number>()
    let unattributed = 0
    for (const r of rows) {
      if (r.userId === null) unattributed += count(r.consumed)
      else attributed.set(r.userId, count(r.consumed))
    }
    return { attributed, unattributed }
  }

  /** `-- q:activation_member` — per member: first onboarding completion + first
   *  analysis at/after it. Members absent here never emitted the event. */
  private async activationByMember(
    workspaceId: string,
  ): Promise<Map<string, { onboardedAt: string | null; activatedAt: string | null }>> {
    const rows = await this.query<{
      userId: string
      onboardedAt: Date | string | null
      activatedAt: Date | string | null
    }>(
      `-- q:activation_member
       SELECT oc.user_id AS "userId", oc.completed_at AS "onboardedAt", fa.first_analysis AS "activatedAt"
       FROM (
         SELECT user_id, MIN(occurred_at) AS completed_at
         FROM product_events
         WHERE event_name = 'onboarding_completed'
         GROUP BY user_id
       ) oc
       JOIN workspace_members m ON m.user_id = oc.user_id AND m.workspace_id = $1
       LEFT JOIN LATERAL (
         SELECT MIN(a.occurred_at) AS first_analysis
         FROM product_events a
         WHERE a.user_id = oc.user_id
           AND a.event_name = 'analysis_started'
           AND a.occurred_at >= oc.completed_at
       ) fa ON true`,
      [workspaceId],
    )
    return new Map(
      rows.map(r => [r.userId, { onboardedAt: toIsoOrNull(r.onboardedAt), activatedAt: toIsoOrNull(r.activatedAt) }]),
    )
  }

  /** `-- q:last_activity` — MAX(user_actions.created_at) per commercial (all-time). */
  private async lastActivityByMember(workspaceId: string): Promise<Map<string, string | null>> {
    const rows = await this.query<{ userId: string; lastAt: Date | string | null }>(
      `-- q:last_activity
       SELECT user_id AS "userId", MAX(created_at) AS "lastAt"
       FROM user_actions
       WHERE workspace_id = $1
       GROUP BY user_id`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, toIsoOrNull(r.lastAt)]))
  }

  /**
   * `-- q:workload_member` — charge d'actions ouvertes par PORTEUR (snapshot).
   *
   * Le périmètre « ouvert » reprend mot pour mot celui du cockpit côté produit
   * (`ManagerService.sharedActions`) : ni faite (`done` / `execution_status`),
   * ni parquée dans le futur (`snoozed_until`), sur un compte non archivé — sinon
   * l'opérateur et le manager liraient deux « actions en cours » différentes.
   *
   * Le scope équipe se lit sur le COMPTE : `action_plan_items` n'a pas de colonne
   * workspace, et le compte est de toute façon le porteur de l'action. La jointure
   * `a.workspace_id = $1` EST le cloisonnement.
   *
   * Le porteur est le délégataire quand l'action a été déléguée, sinon son
   * créateur : c'est la personne qui doit agir, pas celle qui a rédigé la ligne.
   */
  private async workloadByMember(workspaceId: string): Promise<Map<string, ActionWorkload>> {
    const rows = await this.query<{
      userId: string
      open: unknown
      overdue: unknown
      dueSoon: unknown
      undated: unknown
    }>(
      `-- q:workload_member
       SELECT COALESCE(i.assigned_to, i.user_id) AS "userId",
              COUNT(*)::int AS "open",
              COUNT(*) FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE)::int AS "overdue",
              COUNT(*) FILTER (
                WHERE i.due_date IS NOT NULL
                  AND i.due_date >= CURRENT_DATE
                  AND i.due_date <= CURRENT_DATE + $2
              )::int AS "dueSoon",
              COUNT(*) FILTER (WHERE i.due_date IS NULL)::int AS "undated"
       FROM action_plan_items i
       JOIN accounts a ON a.id = i.account_id
       WHERE a.workspace_id = $1
         AND a.commercial_status <> 'archived'
         AND i.done = false
         AND i.execution_status <> 'done'
         AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
       GROUP BY COALESCE(i.assigned_to, i.user_id)`,
      [workspaceId, DUE_SOON_DAYS],
    )
    return new Map(
      rows.map(r => [
        r.userId,
        {
          open: count(r.open),
          overdue: count(r.overdue),
          dueSoon: count(r.dueSoon),
          undated: count(r.undated),
        },
      ]),
    )
  }

  /**
   * `-- q:portfolio_member` — comptes non archivés par RESPONSABLE désigné
   * (`accounts.assigned_to`, snapshot). Le bucket NULL, ce sont les comptes sans
   * responsable : ils ne sont jamais répartis, ils sont comptés pour ce qu'ils
   * sont — un trou de couverture.
   */
  private async portfolioByMember(
    workspaceId: string,
  ): Promise<{ assignedByUser: Map<string, number>; assigned: number; unassigned: number }> {
    const rows = await this.query<{ userId: string | null; count: unknown }>(
      `-- q:portfolio_member
       SELECT assigned_to AS "userId", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1 AND commercial_status <> 'archived'
       GROUP BY assigned_to`,
      [workspaceId],
    )
    const assignedByUser = new Map<string, number>()
    let assigned = 0
    let unassigned = 0
    for (const r of rows) {
      const n = count(r.count)
      if (r.userId === null) unassigned += n
      else {
        assignedByUser.set(r.userId, n)
        assigned += n
      }
    }
    return { assignedByUser, assigned, unassigned }
  }

  /** `-- q:pipeline` — accounts by commercial_status (snapshot). */
  private async pipelineByStatus(workspaceId: string): Promise<Array<{ status: string; count: number }>> {
    const rows = await this.query<{ status: string; count: unknown }>(
      `-- q:pipeline
       SELECT commercial_status AS "status", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1
       GROUP BY commercial_status
       ORDER BY "count" DESC`,
      [workspaceId],
    )
    return rows.map(r => ({ status: r.status, count: count(r.count) }))
  }
}

function sumValues<T>(values: T[], pick: (v: T) => number): number {
  return values.reduce((s, v) => s + pick(v), 0)
}

/** Somme terme à terme de charges d'actions. */
function sumWorkloads(items: readonly ActionWorkload[]): ActionWorkload {
  return items.reduce<ActionWorkload>(
    (acc, w) => ({
      open: acc.open + w.open,
      overdue: acc.overdue + w.overdue,
      dueSoon: acc.dueSoon + w.dueSoon,
      undated: acc.undated + w.undated,
    }),
    { ...EMPTY_WORKLOAD },
  )
}
