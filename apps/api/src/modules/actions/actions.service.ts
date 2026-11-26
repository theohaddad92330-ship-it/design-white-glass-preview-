import { ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  ActionHistoryCategory,
  ActionHistoryItem,
  ActionHistoryQuery,
  ActionHistoryRollback,
  ActionType,
  PaginationMeta,
  WeeklyStats,
} from '@bellum/contracts'
import { classifyRunOutcome, canonicalCommercialStage } from '@bellum/contracts'
import { In, MoreThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WORKSPACE_SCOPE_COLUMN, workspaceScopeWhere } from '../workspace/workspace-scoping'
import { TrackActionDto } from './dto/track-action.dto'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { EMPTY_MESSAGE_SEND_BREAKDOWN, breakdownMessageSends } from './message-send-provenance'

type ActionHistoryRawRow = {
  action_id: string
  action_type: ActionType
  channel: string | null
  metadata: Record<string, unknown> | null
  created_at: Date
  user_id: string
  actor_first_name: string | null
  actor_last_name: string | null
  actor_email: string | null
  account_id: string | null
  account_name: string | null
  contact_id: string | null
  contact_name: string | null
  /** #3388 — le statut du besoin le plus récemment mis à jour du compte visé,
   *  `null` quand le compte n'a aucun besoin (ou quand la cible n'a pas de
   *  compte). Rattaché au stade canonique par `mapActionHistoryRow`, jamais ici. */
  latest_need_status: string | null
}

type ActionPresentation = {
  category: ActionHistoryCategory
  label: string
  detail: string
  /** Absent = the outcome is genuinely unknown. See {@link RunOutcome}. */
  status?: string
  /** `null` (le défaut) = aucun rollback offert. Épopée #2771. */
  rollback?: ActionHistoryRollback | null
  /** `false` (le défaut) = aucune clôture de tâche CRM offerte. #2319.114 (épopée #2985). */
  crmTaskClosable?: boolean
}

/**
 * What actually became of an analysis run, read from `analysis_runs` — the real
 * state machine — rather than asserted from the action type.
 *
 * `undefined` (the run is unknown to us) is a first-class answer: an action row
 * written before the correlation key existed, or one whose run row failed to
 * insert, cannot be resolved. It reports NO status rather than inheriting the
 * old constant "En cours", which is what made a dead run indistinguishable from
 * a live one.
 */
type RunOutcome = { status: string; createdAt: Date }

/** #4455 — un identifiant d'action est un uuid ; tout autre texte ne désigne aucune action. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Status sentinels (FR), mapped to localised labels client-side by
 *  `statusKeyByServerValue` — same convention as every other status here. */
const RUN_STATUS_LABEL: Record<string, string> = {
  completed: 'Terminée',
  error: 'Échouée',
  canceled: 'Annulée',
}

const STATUS_COMPLETED = 'Terminée'
const STATUS_IN_PROGRESS = 'En cours'
const STATUS_ABANDONED = 'Sans suite'

const DEFAULT_HISTORY_LIMIT = 25

@Injectable()
export class ActionsService {
  private readonly logger = new Logger(ActionsService.name)

  constructor(
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // Product analytics — best-effort, `@Optional()` so the direct-`new` spec
    // (`new ActionsService(repo, accounts, contacts)`) needs no change.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // The real analysis state machine, used to resolve what became of a launched
    // run. `@Optional()` and LAST for the same reason as `analytics` — the
    // direct-`new` specs keep working, and its absence means "unknown outcome",
    // which is a truthful answer rather than a fallback to a constant.
    @Optional()
    @InjectRepository(AnalysisRunEntity)
    private readonly analysisRuns?: Repository<AnalysisRunEntity>,
  ) {}

  // Multi-user Phase 2: `user_actions` is a team activity feed. Writes keep
  // `user_id` as the actor (created-by) and add `workspace_id` (read scope);
  // reads scope by `workspace_id`. Identical today (1 user = 1 workspace).
  async track(dto: TrackActionDto, userId: string, workspaceId: string): Promise<{ id: string }> {
    // Reject account/contact ids that don't belong to the caller (workspace or
    // created-by): otherwise a planted foreign UUID would surface another
    // tenant's company_name / contact name back through the history joins (IDOR).
    if (dto.account_id) await this.assertOwnsAccount(dto.account_id, userId, workspaceId)
    if (dto.contact_id) await this.assertOwnsContact(dto.contact_id, userId, workspaceId)

    const saved = await this.actions.save(
      this.actions.create({
        user_id: userId,
        workspace_id: workspaceId,
        account_id: dto.account_id ?? null,
        contact_id: dto.contact_id ?? null,
        action_type: dto.action_type,
        channel: dto.channel ?? null,
        metadata: dto.metadata ?? {},
      }),
    )
    // Mirror a "message sent" action into the product-analytics stream (the row
    // above is the team activity feed). Only the send action — copies/opens stay
    // out of the funnel. Best-effort.
    if (dto.action_type === 'message_sent' || dto.action_type === 'plan_action_message_sent') {
      void this.analytics?.track('message_sent', {
        userId,
        workspaceId,
        properties: {
          channel: dto.channel ?? null,
          accountId: dto.account_id ?? null,
          contactId: dto.contact_id ?? null,
        },
      })
    }
    return { id: saved.id }
  }

  async getWeeklyStats(workspaceId: string): Promise<WeeklyStats> {
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    let rows: Pick<UserActionEntity, 'action_type' | 'metadata'>[]
    try {
      rows = await this.actions.find({
        where: { ...workspaceScopeWhere(workspaceId), created_at: MoreThanOrEqual(weekAgo) },
        // `metadata` est nécessaire : c'est `metadata.via` qui distingue un envoi
        // réellement expédié par Bellum d'une déclaration du commercial.
        select: ['action_type', 'metadata'],
      })
    } catch (err) {
      this.logger.warn('Failed to get weekly stats', { error: err })
      return {
        messages_sent: 0,
        messages_breakdown: EMPTY_MESSAGE_SEND_BREAKDOWN,
        messages_copied: 0,
        // La lecture a ÉCHOUÉ : on ne sait rien. Rendre `0` ferait passer une
        // panne pour un résultat — « cassé » et « non mesurable » se ressemblent
        // à l'écran, et c'est le repli honnête qui les distingue.
        responses: null,
        rdv_obtained: null,
        response_rate: null,
      }
    }

    // Ce compteur comptait auparavant `message_sent` SEUL, là où les KPIs manager
    // comptaient déjà `message_sent + plan_action_message_sent` : le même travail
    // affichait deux chiffres selon l'écran. Les deux lisent désormais le même
    // total, TOUJOURS accompagné de sa décomposition par provenance.
    const messages = breakdownMessageSends(rows)
    const copied = rows.filter(a => a.action_type === 'message_copied').length

    // « Non mesuré » n'est pas « mesuré à zéro ».
    //
    // Ces deux compteurs ont été LUS pendant des mois sans que rien ne les
    // ÉCRIVE : aucun écran n'offrait le geste « il a répondu ». Un « 0 » affirmait
    // alors qu'on avait regardé et trouvé zéro, alors qu'on n'avait jamais eu le
    // moyen d'enregistrer une réponse. La question de la doctrine — *si cette
    // valeur est absente, « 0 » est-il VRAI ?* — s'y répond par NON.
    //
    // Un zéro reste VRAI, et se garde, dès que l'espace a consigné au moins une
    // issue de cette famille : c'est alors « rien cette semaine », une mesure.
    const responses = await this.measuredOutcome(workspaceId, 'response_received', rows)
    const rdv = await this.measuredOutcome(workspaceId, 'rdv_obtained', rows)

    return {
      messages_sent: messages.total,
      messages_breakdown: messages,
      messages_copied: copied,
      responses,
      rdv_obtained: rdv,
      // Un taux sans numérateur mesuré n'est pas dérivable ; un taux sans
      // dénominateur non plus. « 0 % » sur un espace qui n'a rien envoyé décrit
      // une contre-performance qui n'a pas eu lieu.
      response_rate:
        responses !== null && messages.total > 0 ? `${Math.round((responses / messages.total) * 100)}%` : null,
    }
  }

  /**
   * Le compte d'une issue sur la fenêtre, ou `null` quand l'espace n'en a JAMAIS
   * consigné aucune de cette famille.
   *
   * La sonde ne part que si la fenêtre est vide : une occurrence dans la fenêtre
   * prouve déjà que l'espace sait en produire, et fait donc l'économie d'une
   * requête. Sa question est « y en a-t-il déjà eu une ? » — le compte lui-même
   * n'est jamais rendu, seul son signe compte.
   */
  private async measuredOutcome(
    workspaceId: string,
    type: Extract<ActionType, 'response_received' | 'rdv_obtained'>,
    windowRows: Pick<UserActionEntity, 'action_type' | 'metadata'>[],
  ): Promise<number | null> {
    const inWindow = windowRows.filter(a => a.action_type === type).length
    if (inWindow > 0) return inWindow
    try {
      const everLogged = await this.actions.count({
        where: { ...workspaceScopeWhere(workspaceId), action_type: type },
      })
      return everLogged > 0 ? 0 : null
    } catch (err) {
      // La sonde a échoué : on ne sait pas si l'espace a déjà consigné. On dit
      // « non mesuré » plutôt que d'affirmer un zéro qu'on n'a pas vérifié.
      this.logger.warn('outcome-ever-logged probe failed', { error: err, tags: { actionType: type } })
      return null
    }
  }

  async listHistory(workspaceId: string, query: ActionHistoryQuery, viewerId?: string) {
    const limit = query.limit ?? DEFAULT_HISTORY_LIMIT
    const offset = query.offset ?? 0
    const builder = this.createHistoryQuery(workspaceId)

    // Un run d'analyse = UNE ligne. La ligne de lancement (`analysis_started`)
    // résout déjà l'issue réelle du run depuis `analysis_runs` (Terminée /
    // Échouée / En cours) et son détail montre la durée, donc les deux bornes.
    // La ligne `analysis_completed` ne portait rien de plus — pas de clé de
    // corrélation, un « Terminée » codé en dur qui MENTAIT sur un run échoué —
    // et deux lignes se lisaient comme un doublon. On garde le lancement, on
    // retire l'autre. Le détail reste atteignable par la ligne conservée.
    builder.andWhere("action.action_type <> 'analysis_completed'")

    if (query.type) {
      const actionTypes = actionTypesForCategory(query.type)
      if (actionTypes.length === 0) builder.andWhere('1 = 0')
      else builder.andWhere('action.action_type IN (:...actionTypes)', { actionTypes })
    }

    if (query.status) {
      const statusTypes = actionTypesForStatus(query.status)
      if (query.status === STATUS_COMPLETED) {
        // Une analyse terminée n'a plus de ligne `analysis_completed` : son
        // issue se lit sur le run rattaché à la ligne de lancement. On joint
        // donc `analysis_runs` pour que « Terminée » englobe aussi ces runs.
        builder.leftJoin(
          'analysis_runs',
          'run',
          "action.action_type = 'analysis_started' AND run.id::text = action.metadata->>'analysis_run_id'",
        )
        builder.andWhere(
          "(action.action_type IN (:...statusTypes) OR (action.action_type = 'analysis_started' AND run.status = :completedRunStatus))",
          { statusTypes: statusTypes.length > 0 ? statusTypes : ['__none__'], completedRunStatus: 'completed' },
        )
      } else if (statusTypes.length === 0) {
        builder.andWhere('1 = 0')
      } else {
        builder.andWhere('action.action_type IN (:...statusTypes)', { statusTypes })
      }
    }

    if (query.period) {
      builder.andWhere('action.created_at >= :periodStart', { periodStart: periodStart(query.period) })
    }

    // Mode « Depuis votre dernière connexion » : borne basse EXCLUSIVE. `since`
    // est le repère `previous_seen_at` posé au sign-in (cf. LastSeenService), pas
    // une saisie libre — le `>` (et non `>=`) écarte l'instant-repère lui-même.
    if (query.since) {
      builder.andWhere('action.created_at > :since', { since: query.since })
    }

    // Recherche par compte. Le `ILIKE` porte sur le join `accounts` DÉJÀ scopé au
    // tenant (cf. `createHistoryQuery`) : une ligne rattachée au compte d'un autre
    // espace ne peut donc pas remonter, même si son nom correspond.
    if (query.account) {
      builder.andWhere('account.company_name ILIKE :accountSearch', { accountSearch: `%${query.account}%` })
    }

    // Théo B R2.A5 — « moi » : les actions dont l'appelant est l'auteur, DANS son espace (déjà borné plus haut).
    if (query.scope === 'me' && viewerId) {
      builder.andWhere('action.user_id = :viewerId', { viewerId })
    }

    // Filtre par membre : l'AUTEUR de l'action, pas la cible. « Qu'a fait Théo »
    // et « ce qui a été fait chez Théo SA » sont deux questions différentes.
    if (query.actorId) {
      builder.andWhere('action.user_id = :actorId', { actorId: query.actorId })
    }

    // #2200.38 — filtre par canal (LinkedIn, e-mail, téléphone, RDV, autre).
    // La colonne existait déjà sur chaque ligne ; seule la clause manquait.
    if (query.channel) {
      builder.andWhere('action.channel = :channel', { channel: query.channel })
    }

    const totalItems = await builder.getCount()
    const rows = await builder
      .select(historySelect())
      .orderBy('action.created_at', 'DESC')
      .offset(offset)
      .limit(limit)
      .getRawMany<ActionHistoryRawRow>()

    const runOutcomes = await this.resolveRunOutcomes(rows)
    const now = Date.now()
    return {
      data: rows.map(row => mapActionHistoryRow(row, runOutcomes, now)),
      pagination: buildPagination(totalItems, offset, limit),
    }
  }

  /**
   * Load the real outcome of every analysis run referenced by this page of rows.
   *
   * One batched query per page, only for rows that actually carry a correlation
   * key, so the common page (messages, exports, reminders) issues none at all.
   * Best-effort: if the lookup fails, every launch row reports an UNKNOWN
   * outcome — which is the truth in that moment — rather than falling back to
   * the old constant.
   */
  private async resolveRunOutcomes(rows: ActionHistoryRawRow[]): Promise<ReadonlyMap<string, RunOutcome>> {
    const runIds = [
      ...new Set(
        rows
          .filter(r => r.action_type === 'analysis_started')
          .map(r => readString(r.metadata, 'analysis_run_id'))
          .filter((id): id is string => !!id),
      ),
    ]
    if (runIds.length === 0) return new Map()

    try {
      if (!this.analysisRuns) return new Map()
      const runs = await this.analysisRuns.find({
        where: { id: In(runIds) },
        select: { id: true, status: true, created_at: true },
      })
      return new Map(runs.map(run => [run.id, { status: run.status, createdAt: run.created_at }]))
    } catch (error) {
      this.logger.warn('Could not resolve analysis run outcomes — reporting unknown rather than guessing', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Map()
    }
  }

  async getHistoryItem(workspaceId: string, id: string): Promise<ActionHistoryItem> {
    // #4455 — l'ancienne adresse web `/actions/ecritures` arrive ici comme
    // identifiant (`/actions/history/ecritures`) : Postgres refusait l'uuid et
    // la page prenait un 500. Un identifiant qui n'est pas un uuid ne désigne
    // aucune action : 404, sans requête.
    if (!UUID_PATTERN.test(id)) throw new NotFoundException('Action not found')
    const rows = await this.createHistoryQuery(workspaceId)
      .andWhere('action.id = :id', { id })
      .select(historySelect())
      .limit(1)
      .getRawMany<ActionHistoryRawRow>()
    const row = rows[0]
    if (!row) throw new NotFoundException('Action not found')
    return mapActionHistoryRow(row, await this.resolveRunOutcomes([row]))
  }

  /**
   * "Mes messages récents" for the personal cockpit (roadmap §5 — seat value).
   * The messages THIS user (the actor) prepared or sent, newest first — STRICTLY
   * scoped by `action.user_id`, never a teammate's activity. Reuses the same
   * projection/labels as the team feed so the item shape is identical.
   */
  async listPersonalMessages(userId: string, limit = 8): Promise<ActionHistoryItem[]> {
    const messageTypes = actionTypesForCategory('message')
    const rows = await this.createActorHistoryQuery(userId)
      .andWhere('action.action_type IN (:...messageTypes)', { messageTypes })
      .select(historySelect())
      .orderBy('action.created_at', 'DESC')
      .limit(limit)
      .getRawMany<ActionHistoryRawRow>()
    // Messages only — no analysis rows here, so there is no run outcome to
    // resolve. Explicit arrow: a bare reference would feed `Array.map`'s index
    // into the outcomes argument.
    return rows.map(row => mapActionHistoryRow(row))
  }

  /** Count the messages this user prepared/sent since `since` — the personal
   *  cockpit "messages cette semaine" KPI. Scoped to the actor (`user_id`). */
  async countMessagesSince(userId: string, since: Date): Promise<number> {
    // ⚠️ L'échec REMONTE — même raison qu'`AccountsService.countPersonalAccounts`,
    // et même tuile : « 0 message cette semaine » sur une requête cassée se lit
    // comme « je n'ai rien envoyé », ce qui est faux. Seul appelant :
    // `PersonalCockpitService`, qui sait montrer un état d'échec.
    return this.actions.count({
      where: {
        user_id: userId,
        action_type: In(actionTypesForCategory('message')),
        created_at: MoreThanOrEqual(since),
      },
    })
  }

  private async assertOwnsAccount(accountId: string, userId: string, workspaceId: string): Promise<void> {
    const count = await this.accounts.count({
      where: [
        { id: accountId, workspace_id: workspaceId },
        { id: accountId, user_id: userId },
      ],
    })
    if (count === 0) throw new ForbiddenException('Compte introuvable dans votre espace.')
  }

  private async assertOwnsContact(contactId: string, userId: string, workspaceId: string): Promise<void> {
    const count = await this.contacts.count({
      where: [
        { id: contactId, workspace_id: workspaceId },
        { id: contactId, user_id: userId },
      ],
    })
    if (count === 0) throw new ForbiddenException('Contact introuvable dans votre espace.')
  }

  // The `profiles` join stays keyed on `action.user_id` — that's the actor whose
  // name/initials render in the feed. The account/contact joins are scoped to the
  // same tenant (workspace, or the actor's own rows) so a planted foreign id can't
  // leak another workspace's company_name / contact name. The `OR … user_id` arm
  // keeps legacy rows whose `workspace_id` was never backfilled rendering correctly.
  private createHistoryQuery(workspaceId: string) {
    return this.actions
      .createQueryBuilder('action')
      .leftJoin(
        'accounts',
        'account',
        'account.id = action.account_id AND (account.workspace_id = action.workspace_id OR account.user_id = action.user_id)',
      )
      .leftJoin(
        'contacts',
        'contact',
        'contact.id = action.contact_id AND (contact.workspace_id = action.workspace_id OR contact.user_id = action.user_id)',
      )
      .leftJoin('profiles', 'profile', 'profile.user_id = action.user_id')
      .leftJoin(latestAccountNeedSubQuery, 'latest_need', 'latest_need.account_id = account.id')
      .where(`action.${WORKSPACE_SCOPE_COLUMN} = :workspaceId`, { workspaceId })
  }

  // Personal-cockpit variant of `createHistoryQuery`: scopes the feed to a SINGLE
  // actor (`action.user_id`) instead of the whole workspace. Same joins so the
  // projection/labels match; the account/contact joins stay scoped to the actor's
  // own rows, so a planted foreign id can never leak another tenant's names.
  private createActorHistoryQuery(userId: string) {
    return this.actions
      .createQueryBuilder('action')
      .leftJoin(
        'accounts',
        'account',
        'account.id = action.account_id AND (account.workspace_id = action.workspace_id OR account.user_id = action.user_id)',
      )
      .leftJoin(
        'contacts',
        'contact',
        'contact.id = action.contact_id AND (contact.workspace_id = action.workspace_id OR contact.user_id = action.user_id)',
      )
      .leftJoin('profiles', 'profile', 'profile.user_id = action.user_id')
      .leftJoin(latestAccountNeedSubQuery, 'latest_need', 'latest_need.account_id = account.id')
      .where('action.user_id = :userId', { userId })
  }
}

/**
 * #3388 — LE BESOIN LE PLUS RÉCENT DE CHAQUE COMPTE, une ligne par compte.
 *
 * Partagée par `createHistoryQuery` ET `createActorHistoryQuery` : deux copies
 * de ce `DISTINCT ON` divergeraient au premier besoin ajouté (même raison que
 * `threadsBaseQuery` dans `chat-messages.service.ts`). Ne recalcule rien que
 * `commercial-state-machine.ts` ne sache déjà rattacher : ce sous-select rend
 * le STATUT stocké, `canonicalCommercialStage('need', …)` fait le reste dans
 * `mapActionHistoryRow`.
 */
function latestAccountNeedSubQuery(
  qb: SelectQueryBuilder<Record<string, unknown>>,
): SelectQueryBuilder<Record<string, unknown>> {
  return qb
    .select('pn.account_id', 'account_id')
    .addSelect('pn.status', 'status')
    .distinctOn(['pn.account_id'])
    .from('project_needs', 'pn')
    .orderBy('pn.account_id', 'ASC')
    .addOrderBy('pn.updated_at', 'DESC')
}

function historySelect(): string[] {
  return [
    'action.id AS action_id',
    'action.action_type AS action_type',
    'action.channel AS channel',
    'action.metadata AS metadata',
    'action.created_at AS created_at',
    'action.user_id AS user_id',
    'profile.first_name AS actor_first_name',
    'profile.last_name AS actor_last_name',
    'profile.email AS actor_email',
    'account.id AS account_id',
    'account.company_name AS account_name',
    'contact.id AS contact_id',
    'contact.full_name AS contact_name',
    'latest_need.status AS latest_need_status',
  ]
}

function mapActionHistoryRow(
  row: ActionHistoryRawRow,
  runOutcomes: ReadonlyMap<string, RunOutcome> = new Map(),
  now: number = Date.now(),
): ActionHistoryItem {
  const presentation = presentAction(row, runOutcomes, now)
  const targetLabel = row.account_name ?? row.contact_name ?? readString(row.metadata, 'company_name') ?? 'Action'
  const actorName = buildActorName(row)

  return {
    id: row.action_id,
    action_type: row.action_type,
    category: presentation.category,
    action_label: presentation.label,
    detail: presentation.detail,
    status: presentation.status,
    channel: normalizeChannel(row.channel),
    actor: {
      id: row.user_id,
      name: actorName,
      initials: initials(actorName),
    },
    target: {
      account_id: row.account_id,
      contact_id: row.contact_id,
      label: targetLabel,
      initials: initials(targetLabel),
      commercial_stage: canonicalCommercialStage('need', row.latest_need_status),
    },
    created_at: row.created_at.toISOString(),
    rollback: presentation.rollback ?? null,
    crmTaskClosable: presentation.crmTaskClosable ?? false,
  }
}

/**
 * The outcome to show on an "Analyse lancée" row.
 *
 * This used to be the constant `'En cours'`. That is not a status — it is a
 * restatement of the action type, and an action type is an immutable past
 * event, so the badge could never stop saying "running". Two consequences, both
 * observed in production: a finished run kept a permanent "En cours" row next to
 * its "Terminée" row, and a run that DIED was indistinguishable from one still
 * working — a real failure rendered as normal progress.
 *
 * Now derived from the run itself. Never invents an outcome: an unresolvable row
 * returns `undefined` (no badge) and an abandoned one says so.
 */
function analysisStartedStatus(outcome: RunOutcome | undefined, now: number): string | undefined {
  if (!outcome) return undefined
  const terminal = RUN_STATUS_LABEL[outcome.status]
  if (terminal) return terminal
  // La dérivation « ce run a-t-il encore une issue à rendre ? » vit dans
  // `@bellum/contracts` : l'alerte d'observabilité « no-outcome » pose la même
  // question à la même table, et deux copies auraient fini par diverger.
  switch (classifyRunOutcome({ status: outcome.status, createdAt: outcome.createdAt }, new Date(now))) {
    case 'no_outcome':
      return STATUS_ABANDONED
    case 'running':
      return STATUS_IN_PROGRESS
    default:
      return undefined
  }
}

function presentAction(
  row: ActionHistoryRawRow,
  runOutcomes: ReadonlyMap<string, RunOutcome>,
  now: number,
): ActionPresentation {
  const metadataDetail = readString(row.metadata, 'detail') ?? readString(row.metadata, 'source_label')
  switch (row.action_type) {
    case 'analysis_started': {
      const runId = readString(row.metadata, 'analysis_run_id')
      return {
        category: 'analysis',
        // La ligne représente le RUN entier (la ligne « Analyse terminée »
        // redondante est repliée) : « Analyse · Terminée » se lit mieux que
        // « Analyse lancée · Terminée ». Le badge de statut porte l'issue.
        label: 'Analyse',
        // Neutre, jamais « Analyse lancée » : la ligne repliée n'est pas
        // l'instant de lancement mais le run entier, dont l'issue est dans le badge.
        detail: 'Analyse complète',
        status: analysisStartedStatus(runId ? runOutcomes.get(runId) : undefined, now),
      }
    }
    case 'analysis_completed':
      return {
        category: 'analysis',
        label: 'Analyse terminée',
        detail: metadataDetail ?? 'Analyse complète',
        status: 'Terminée',
      }
    case 'message_sent':
    case 'plan_action_message_sent':
      return {
        category: 'message',
        label: 'Message envoyé',
        detail: metadataDetail ?? channelDetail(row.channel),
        status: 'Envoyé',
      }
    case 'message_copied':
    case 'plan_action_message_copied':
      return {
        category: 'message',
        label: 'Message copié',
        detail: metadataDetail ?? channelDetail(row.channel),
        status: 'Copié',
      }
    case 'plan_action_enrichment_requested':
      return {
        category: 'enrichment',
        label: 'Enrichissement',
        detail: metadataDetail ?? 'Données demandées',
        status: 'Demandé',
      }
    // Classé en `analysis` et non en `enrichment` : c'est le CRÉDIT qui est
    // prélevé sur le même pool, pas la nature du geste. Quelqu'un qui filtre
    // « Enrichissements » cherche des coordonnées de contacts, pas un plan.
    case 'need_play_generated':
      return {
        category: 'analysis',
        label: 'Plan d’attaque',
        detail: metadataDetail ?? 'Besoin travaillé',
        status: 'Préparé',
      }
    case 'plan_action_added': {
      // #2277.33 (épopée #2771) — `cancel_reminder` cible cette même ligne par
      // son id. Seuls les rappels (`router_intent: 'schedule_reminder'`, posé
      // par `dispatchReminder`) sont éligibles : un événement de calendrier
      // (`create_calendar_event`) journalise sous le MÊME `action_type` sans
      // avoir de compensateur — jamais un bouton qui échouerait au clic.
      const routerIntent = readString(row.metadata, 'router_intent')
      const isReminder = routerIntent === 'schedule_reminder'
      const cancelled = Boolean(readString(row.metadata, 'cancelled_at'))
      return {
        category: 'reminder',
        label: 'Action ajoutée',
        detail: metadataDetail ?? 'Plan d’action',
        status: isReminder && cancelled ? 'Annulé' : 'Programmé',
        rollback: isReminder && !cancelled ? 'cancel_reminder' : null,
      }
    }
    // #2277.36 (épopée #2771) — `remove_crm_task` cible cette ligne par son
    // id. `dispatchCrmTask` est le SEUL émetteur de `crm_task_created`
    // (`router_intent: 'create_crm_task'` toujours posé), donc aucune garde
    // de provenance n'est nécessaire ici contrairement à `plan_action_added`.
    case 'crm_task_created': {
      const withdrawn = Boolean(readString(row.metadata, 'withdrawn_at'))
      // #2319.114 (épopée #2985) — `closed_at` posé par `dispatchCloseCrmTask`.
      // Mutuellement exclusif avec `withdrawn_at` : la même tâche ne se retire
      // pas ET ne se clôture pas, `dispatchCloseCrmTask`/`dispatchRemoveCrmTask`
      // refusent chacun l'autre état déjà posé.
      const closed = Boolean(readString(row.metadata, 'closed_at'))
      // Seul HubSpot sait fermer une tâche depuis ce dépôt (`HubspotClient.closeTask`) —
      // un contrat d'API non vérifiable ne se devine pas pour les autres fournisseurs.
      const provider = readString(row.metadata, 'crm_provider')
      const externalRef = readString(row.metadata, 'external_ref')
      return {
        category: 'other',
        label: 'Tâche CRM',
        detail: metadataDetail ?? 'Contact exporté vers le CRM',
        status: closed ? 'Terminée' : withdrawn ? 'Retirée' : 'Créée',
        rollback: withdrawn || closed ? null : 'remove_crm_task',
        crmTaskClosable: !withdrawn && !closed && provider === 'hubspot' && Boolean(externalRef),
      }
    }
    // #2277.35 (épopée #2771) — `restore_status` restaure le contact ciblé au
    // `previous_status` tracé par `ContactsService.recordOutcomeAction` sur
    // CETTE MÊME ligne. Sans `previous_status` (jamais tracé) ou sans
    // `contact_id` (une déclaration de COMPTE, hors périmètre du rollback —
    // voir le commentaire de `dispatchRestoreStatus`), pas de bouton : il
    // échouerait au clic plutôt que de deviner une valeur de repli.
    case 'response_received':
    case 'rdv_obtained':
    case 'deal_signed': {
      const restored = Boolean(readString(row.metadata, 'restored_at'))
      const previousStatus = readString(row.metadata, 'previous_status')
      const label =
        row.action_type === 'response_received'
          ? 'Réponse consignée'
          : row.action_type === 'rdv_obtained'
            ? 'Rendez-vous décroché'
            : 'Affaire signée'
      return {
        category: 'other',
        label,
        detail: metadataDetail ?? 'Déclaration commerciale',
        status: restored ? 'Restauré' : 'Consignée',
        rollback: !restored && previousStatus && row.contact_id ? 'restore_status' : null,
      }
    }
    case 'plan_action_completed':
      return {
        category: 'reminder',
        label: 'Action terminée',
        detail: metadataDetail ?? 'Plan d’action',
        status: 'Terminée',
      }
    case 'export':
      return {
        category: 'export',
        label: 'Export',
        detail: metadataDetail ?? 'Export CRM',
        status: 'Exporté',
      }
    case 'account_score_changed': {
      // Le score bouge à la complétion d'une (ré)analyse : classé avec les
      // analyses. Le libellé est localisé côté web (labelKeyByActionType) ; le
      // détail `de X à Y` est numérique, donc neutre. Le badge dit le SENS.
      const from = readNumber(row.metadata, 'from')
      const to = readNumber(row.metadata, 'to')
      const status =
        typeof from === 'number' && typeof to === 'number' && from !== to ? scoreStatus(from, to) : undefined
      return {
        category: 'analysis',
        label: 'Score mis à jour',
        detail: metadataDetail ?? scoreDetail(from, to),
        status,
      }
    }
    case 'profile_updated':
      // Le profil ESN n'est ni un compte ni un contact : catégorie « autre ».
      // Libellé + détail localisés côté web ; le badge signale la mise à jour.
      return {
        category: 'other',
        label: 'Profil ESN mis à jour',
        detail: metadataDetail ?? 'Contexte commercial',
        status: 'Mis à jour',
      }
    default:
      return {
        category: 'other',
        label: 'Action enregistrée',
        detail: metadataDetail ?? row.action_type,
        status: 'Enregistrée',
      }
  }
}

function actionTypesForCategory(category: ActionHistoryCategory): ActionType[] {
  // La ligne « Analyse terminée » est repliée dans le lancement (cf.
  // `listHistory`) : le filtre par catégorie ne vise donc que `analysis_started`.
  if (category === 'analysis') return ['analysis_started']
  if (category === 'message')
    return ['message_sent', 'message_copied', 'plan_action_message_sent', 'plan_action_message_copied']
  if (category === 'enrichment') return ['plan_action_enrichment_requested']
  if (category === 'reminder') return ['plan_action_added', 'plan_action_completed', 'plan_action_rescheduled']
  if (category === 'export') return ['export']
  return []
}

function actionTypesForStatus(status: string): ActionType[] {
  // `analysis_completed` a disparu du flux (replié) ; une analyse terminée est
  // ajoutée au filtre « Terminée » par la jointure sur le run, pas par son type.
  if (status === 'Terminée') return ['plan_action_completed']
  if (status === 'Envoyé') return ['message_sent', 'plan_action_message_sent']
  if (status === 'Copié') return ['message_copied', 'plan_action_message_copied']
  if (status === 'Programmé') return ['plan_action_added', 'plan_action_rescheduled']
  return []
}

function buildPagination(totalItems: number, offset: number, size: number): PaginationMeta {
  const currentPage = Math.floor(offset / size) + 1
  const totalPages = Math.max(1, Math.ceil(totalItems / size))
  return {
    currentPage,
    size,
    totalItems,
    totalPages,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  }
}

function buildActorName(row: ActionHistoryRawRow): string {
  const fullName = [row.actor_first_name, row.actor_last_name].filter(Boolean).join(' ').trim()
  return fullName || row.actor_email || 'Utilisateur'
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
}

function readString(metadata: Record<string, unknown> | null, key: string): string | undefined {
  const value = metadata?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function readNumber(metadata: Record<string, unknown> | null, key: string): number | undefined {
  const value = metadata?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Status sentinel for a score change — the DIRECTION (localised client-side by
 *  `statusKeyByServerValue`, same convention as every other status here). */
function scoreStatus(from: number, to: number): string {
  return to > from ? 'En hausse' : 'En baisse'
}

/** Language-neutral `X → Y` detail — safe to render as-is in any locale. Falls
 *  back to a plain label when a bound is missing (older metadata). */
function scoreDetail(from: number | undefined, to: number | undefined): string {
  if (typeof from === 'number' && typeof to === 'number') return `${from} → ${to}`
  return 'Score de priorité'
}

function channelDetail(channel: string | null): string {
  if (channel === 'linkedin') return 'Message LinkedIn'
  if (channel === 'email') return 'Email'
  if (channel === 'phone') return 'Appel téléphonique'
  return 'Engagement'
}

function normalizeChannel(channel: string | null): ActionHistoryItem['channel'] {
  if (
    channel === 'linkedin' ||
    channel === 'email' ||
    channel === 'phone' ||
    channel === 'meeting' ||
    channel === 'other'
  ) {
    return channel
  }
  return null
}

function periodStart(period: NonNullable<ActionHistoryQuery['period']>): Date {
  const days = period === '90d' ? 90 : period === '30d' ? 30 : 7
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date
}
