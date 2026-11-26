import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { summariseAnalysisFound } from './analysis-found'
import { ANALYSIS_LAUNCH_OBSERVER, type AnalysisLaunchObserver } from './analysis-launch.port'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import {
  APPROVAL_TTL_MS,
  CARD_TYPES_OBSOLETE_ONCE_EXECUTED,
  capReplyProposals,
  cardAllowedGestures,
  cardExpiresAt,
  cardStateOf,
  cardTargetKey,
  copilotCardIdempotencyKey,
  isPrimaryCardIndex,
  creditCostOf,
  DEFAULT_RETRY_POLICY,
  defaultSnoozeUntil,
  hasPermission,
  pendingChatActionSchema,
  planNextLaunch,
  planStepsOf,
  workspacePermissionSchema,
  type WorkspaceRole,
  type ActionDispatchArtifact,
  type CardGesture,
  type CardPreview,
  type CardResult,
  type CopilotCardState,
  type PendingChatAction,
  type PlanLaunchMode,
  type WorkflowRunStep,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { ActivitiesService } from '../activities/activities.service'
import { OutreachMessageService } from '../outreach/outreach-message.service'
import { LAURA_SEND_MANDATE, type LauraSendMandate } from './laura-job-drafts'
import { decideApproval } from './approval-policy'
import {
  ANALYSIS_TRACKING_DEFINITION_KEY,
  buildCard,
  cardDefinitionForKey,
  cardNextStepOnSuccess,
  type BuiltCard,
} from './copilot-card-catalog'
import {
  contactVerificationLine,
  LONG_JOB_SPECS,
  analysisSettlementSentence,
  longJobProgressSentence,
} from './long-job-catalog'
import { findWorkflow } from './workflow-catalog'
import { CreditReservationService } from './credit-reservation.service'
import { DEBIT_NOT_REPORTED_REASON, WorkflowRunnerService, type RunPrincipal } from './workflow-runner.service'

/** Ce qu'un écran lit d'une carte. */
export type CardView = {
  id: string
  action: PendingChatAction | null
  state: CopilotCardState
  allowedGestures: readonly CardGesture[]
  preview: CardPreview | null
  result: CardResult | null
  snoozedUntil: string | null
  expiresAt: string | null
  steps: WorkflowRunStep[]
  estimatedCredits: number
  spentCredits: number
  conversationId: string | null
  turnId: string | null
  createdAt: string
  /** #1943.3 — le rang de la proposition dans sa réponse (celui de `pending_actions`), `null` hors carte. */
  proposalIndex: number | null
  /** #1943.3 — « 1 principale » : la première proposition de la réponse (`isPrimaryCardIndex`). */
  primary: boolean
  /**
   * #1952.24 — la page qui POSSÈDE le résultat, jamais devinée. Distinct de
   * `result.externalRef`, qui pour l'analyse suivie porte le jobId (lu par
   * `observeAnalysisTracking`), pas une URL. `null` quand le run ne tient à
   * aucun compte (un réglage, un fait épinglé…).
   */
  accountId: string | null
}

/**
 * #1950.14 / #1950.18 — ce qu'un geste de plan a fait : les cartes RELUES, les
 * rangs lancés, et ce que le serveur a refusé (avec sa phrase, jamais tu).
 */
export type PlanRunOutcome = {
  cards: CardView[]
  launched: number[]
  refused: { rank: number | null; reason: string }[]
}

/** #1950.22 — la phrase d'un refus de clic, selon ce qui est arrivé au prérequis (rang affiché à partir de 1). */
const BLOCKED_BECAUSE = {
  failed: 'a échoué',
  blocked: 'n’a pas pu partir',
  unknown: 'a un résultat inconnu — on ne relance pas à côté de ce qui est peut-être parti',
} as const

type ProposeCardInput = {
  principal: RunPrincipal
  /** `null` pour un fil qui n'a pas de clé (fil d'un compte d'avant les conversations). */
  conversationId: string | null
  turnId: string
  proposalIndex: number
  action: PendingChatAction
}

/** Ce qu'un tour a fait de ses propositions — des NOMBRES, que l'appelant journalise sans contenu. */
type TurnProposalCounts = {
  received: number
  droppedOverCap: number
  invalid: number
  navigation: number
  persisted: number
  reused: number
  superseded: number
  demo: boolean
}

/** #1943.6 — les deux déclencheurs d'obsolescence réellement détectables dans `workflow_runs`. */
const NEWER_IN_THREAD_REASON = 'Remplacée par une proposition plus récente sur la même cible.'
const EXECUTED_ELSEWHERE_REASON = 'Déjà exécutée depuis une autre carte : rien à refaire.'

/** Les statuts d'où un geste « avant lancement » peut partir — la clause `WHERE` du clic. */
const NOT_LAUNCHED: WorkflowRunEntity['status'][] = ['planned', 'snoozed']

/**
 * R9 (#1930) — LE BROUILLON D'UN COÉQUIPIER RESTE À LUI JUSQU'À VALIDATION.
 *
 * La revue de sécurité d'Action OS a trouvé que `GET action-os/cards` (lecture
 * d'ESPACE, `@WorkspaceRead()`) rendait à tout membre le destinataire, l'objet
 * et le corps du brouillon d'un coéquipier, avant que celui-ci ne l'ait validé.
 * Arbitrage de Louis du 13/09/2026 : **seul l'auteur du run le lit** tant que
 * rien n'est parti. Le reste de la carte ne change pas — un coéquipier continue
 * de voir qu'une carte existe, son état, son coût, son fil : c'est le CONTENU
 * personnel qui est retiré, pas la carte.
 *
 * ⚠️ La liste ci-dessous est celle des états VALIDÉS, pas celle des états
 * masqués : elle se lit en complément, pour qu'un état neuf de
 * {@link CopilotCardState} soit masqué par défaut plutôt que rendu en clair par
 * oubli. Ce sont exactement les états qu'un run ne peut atteindre qu'après un
 * lancement (`confirm` réclame `planned`/`snoozed` et pose `running`, puis
 * `executeCard` solde en `executed`/`partial`/`failed`/`unknown_outcome`).
 *
 * Deux états sont volontairement DU CÔTÉ MASQUÉ bien qu'ils suivent un clic de
 * l'auteur, parce que dans les deux cas rien n'est parti vers la messagerie :
 *  - `awaiting_review` (`status: awaiting_approval`) — l'auteur a cliqué, un
 *    responsable doit encore trancher ; le brouillon n'existe nulle part ;
 *  - `blocked` — « Rien n'est parti » (aucun pas exécutable, ou tous sautés).
 */
const DRAFT_VALIDATED_STATES: readonly CopilotCardState[] = [
  'running',
  'executed',
  'partial',
  'failed',
  'unknown_outcome',
]

/** Ce qu'un coéquipier lit à la place — des marqueurs, jamais une valeur inventée (doctrine). */
const MASKED_RECIPIENT = '[destinataire masqué]'
const MASKED_SUBJECT = '[objet masqué]'
const MASKED_DRAFT = '[brouillon masqué — visible une fois validé]'

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

/**
 * #1931 L2 — le service des CARTES de Laura, posé sur Action OS.
 *
 * Une carte = un run `trigger = copilot_proposal`, clé `card:<turnId>:<index>`.
 * Six gestes, chacun une transition ATOMIQUE (`UPDATE … WHERE status IN (…)`) :
 * deux onglets qui cliquent en même temps ne produisent qu'un effet, le second
 * relit ce que le premier a écrit (I5).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUI PEUT AGIR — la règle d'aujourd'hui, gardée telle quelle
 * ─────────────────────────────────────────────────────────────────────────────
 * `canDecide` (`approval-policy.ts:199-221`) : sous `n3`, SEUL l'auteur de la
 * demande la valide ; à `n3`, un responsable (`team:manage`) qui n'est pas le
 * demandeur. Une carte est proposée à son auteur : lui seul la confirme, la
 * refuse, la reporte, la modifie, la relance ou l'annule. Si la dépense ou le
 * volume la montent à `n3`, son clic ouvre une demande `pending`, et c'est un
 * responsable qui tranche — par `POST action-os/approvals/:id`, qui applique
 * `canDecide` et exécute avec les intents PERSISTÉS (D2). Toute lecture est
 * bornée à l'espace actif ; aucune ne cherche un run par son seul `id`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CRÉDITS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce service ne réserve ni ne débite rien lui-même : proposer, refuser,
 * reporter, modifier, annuler coûtent 0 (I7). La réservation d'un enrichissement
 * se pose à l'EXÉCUTION (`WorkflowRunnerService.execute`), c'est-à-dire au clic
 * pour une carte `n2` — l'arbitrage du 12/09 — et à la décision du responsable
 * pour une carte `n3` (une réservation de 30 minutes posée à la demande aurait
 * expiré bien avant qu'un responsable ne la lise).
 */
@Injectable()
export class CopilotCardService {
  private readonly logger = new Logger(CopilotCardService.name)

  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvals: Repository<ApprovalRequestEntity>,
    private readonly runner: WorkflowRunnerService,
    private readonly reservations: CreditReservationService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // #1943.5 — APPENDÉ EN FIN (les specs construisent ce service par position)
    // et optionnel : sans lui, une analyse suivie reste « en cours » — jamais une
    // issue inventée.
    @Optional()
    @Inject(ANALYSIS_LAUNCH_OBSERVER)
    private readonly analysisLaunches?: AnalysisLaunchObserver,
    // #1931.12 — le nom de QUI A AGI (`CardResult.actorName`), déclaré au contrat
    // et rendu par l'écran depuis toujours, mais que rien n'alimentait : les
    // quatre écritures de `result` posaient `actorName: null` sans jamais lire
    // de source réelle. APPENDÉ EN FIN, comme `analysisLaunches` ci-dessus, pour
    // la même raison : les specs construisent ce service par position.
    @Optional()
    @InjectRepository(ProfileEntity)
    private readonly profiles?: Repository<ProfileEntity>,
    // #1931.20 — APPENDÉ EN FIN, comme `analysisLaunches` et `profiles` ci-dessus
    // (les specs construisent ce service par position) et optionnel : sans lui,
    // une carte se règle normalement, elle ne laisse simplement pas de trace
    // dans Actions ni la timeline.
    @Optional()
    private readonly activities?: ActivitiesService,
    // #2366.2 — APPENDÉ EN FIN, même raison. Optionnel et BEST-EFFORT (comme
    // `activities` ci-dessus) : sans lui, ou si la création échoue, la carte se
    // règle normalement — elle ne devient simplement pas un message canonique.
    @Optional()
    private readonly outreachMessages?: OutreachMessageService,
    // #4016 L5 (reprise 20/10) — APPENDÉ EN FIN, même raison. Optionnel : sans lui,
    // le brouillon de Laura reste un brouillon ordinaire, en relecture (c81/c82 inchangées).
    // Par PORT (`LAURA_SEND_MANDATE`), jamais un import du service d'un autre module (GA-07).
    @Optional()
    @Inject(LAURA_SEND_MANDATE)
    private readonly delegations?: LauraSendMandate,
  ) {}

  /**
   * #1931.12 — le nom RÉEL de qui a agi, jamais un repli. Un profil absent ou
   * illisible (compte supprimé, repository non branché dans un test) rend
   * `null` : la carte dit alors CE QUI s'est passé, jamais QUI, plutôt que
   * d'inventer un nom ou d'afficher un e-mail à sa place.
   */
  private async actorNameOf(userId: string): Promise<string | null> {
    const profile = await this.profiles?.findOne({ where: { user_id: userId } })
    if (!profile) return null
    const full = [profile.first_name, profile.last_name]
      .filter(part => part && part.trim())
      .join(' ')
      .trim()
    return full || null
  }

  /**
   * Persiste une proposition de Laura — AVANT tout clic, pour qu'elle survive au
   * rechargement (D1). Idempotent par `card:<turnId>:<index>` : rejouer le même
   * tour rend la même carte. Une carte de navigation rend `null`.
   */
  async propose(input: ProposeCardInput): Promise<{ run: WorkflowRunEntity; reused: boolean } | null> {
    const built = buildCard(input.action)
    if (!built) return null
    const { workspaceId } = await this.runner.workspaceOf(input.principal.userId)
    const key = copilotCardIdempotencyKey(input.turnId, input.proposalIndex)
    const existing = await this.runs.findOne({ where: { workspace_id: workspaceId, idempotency_key: key } })
    if (existing) return { run: existing, reused: true }

    const card = await this.scopeToWorkspace(built, workspaceId)
    const seed = this.runs.create({
      workspace_id: workspaceId,
      user_id: input.principal.userId,
      definition_key: card.definition.key,
      definition_version: card.definition.version,
      trigger: 'copilot_proposal',
      status: 'planned',
      account_id: card.accountId,
      contact_id: card.contactId,
      correlation_id: `card_${input.turnId}_${input.proposalIndex}`.slice(0, 64),
      idempotency_key: key,
      steps: [],
      estimated_credits: card.definition.steps.reduce((sum, step) => sum + step.estimatedCredits, 0),
      spent_credits: 0,
      started_at: null,
      finished_at: null,
      intents: card.intents,
      preview: card.preview,
      result: null,
      conversation_id: input.conversationId,
      turn_id: input.turnId,
      proposal_index: input.proposalIndex,
      snoozed_until: null,
      proposal: input.action,
    })
    try {
      return { run: await this.runs.save(seed), reused: false }
    } catch (error) {
      const conflict = await this.runs.findOne({ where: { workspace_id: workspaceId, idempotency_key: key } })
      if (conflict) return { run: conflict, reused: true }
      throw error
    }
  }

  /**
   * #1943.1 — les cartes d'UN tour de conversation, depuis le `context.pending_actions`
   * BRUT de l'événement `done` du service IA.
   *
   * Ce qui arrive ici est une SORTIE DE MODÈLE, donc une donnée : chaque forme est
   * validée par `pendingChatActionSchema` et une forme invalide est ignorée et
   * COMPTÉE — jamais une carte devinée, jamais un champ complété. Le rang d'une
   * carte est sa position dans la liste reçue (celle que les onglets d'avant le
   * déploiement lisent encore), invalides et navigation compris.
   *
   * #1943.3 — 3 cartes au plus : l'orchestrateur coupe déjà à la source ; cette
   * seconde coupe est la défense en profondeur (un `done` rejoué ou fabriqué ne
   * doit pas ouvrir une quatrième carte).
   *
   * I6 — en démonstration, rien n'est persisté. I7 — rien n'est réservé ni débité :
   * `propose` n'écrit que la carte.
   */
  async proposeTurn(
    input: { principal: RunPrincipal; conversationId: string | null; turnId: string; proposals: unknown },
    now = new Date(),
  ): Promise<{ cards: CardView[]; counts: TurnProposalCounts }> {
    const counts: TurnProposalCounts = {
      received: 0,
      droppedOverCap: 0,
      invalid: 0,
      navigation: 0,
      persisted: 0,
      reused: 0,
      superseded: 0,
      demo: false,
    }
    if (input.proposals === undefined || input.proposals === null) return { cards: [], counts }
    if (!Array.isArray(input.proposals)) return { cards: [], counts: { ...counts, invalid: 1 } }
    counts.received = input.proposals.length

    const { isDemo } = await this.runner.workspaceOf(input.principal.userId)
    if (isDemo) return { cards: [], counts: { ...counts, demo: true } }

    // #1943.3 — la coupe, AVANT la validation : le rang d'une carte ne dépend pas
    // de la validité de ses voisines.
    const { kept, dropped } = capReplyProposals(input.proposals)
    counts.droppedOverCap = dropped

    const cards: CardView[] = []
    for (const [index, raw] of kept.entries()) {
      const parsed = pendingChatActionSchema.safeParse(raw)
      if (!parsed.success) {
        counts.invalid += 1
        continue
      }
      const proposed = await this.propose({
        principal: input.principal,
        conversationId: input.conversationId,
        turnId: input.turnId,
        proposalIndex: index,
        action: parsed.data,
      })
      if (!proposed) {
        counts.navigation += 1
        continue
      }
      if (proposed.reused) {
        counts.reused += 1
        const current = await this.refresh(proposed.run)
        cards.push(this.toView(current, await this.latestApproval(current), now))
        continue
      }
      counts.persisted += 1
      counts.superseded += await this.supersedeOlderInThread(proposed.run, now)
      cards.push(this.toView(proposed.run, null, now))
    }
    return { cards, counts }
  }

  /**
   * D1 — les cartes d'un FIL, avec leur état et leurs gestes du moment : ce que
   * rend la relecture d'une conversation. Par clé de fil quand il en a une, sinon
   * par les tours de ses messages ; rien quand on ne sait désigner ni l'un ni
   * l'autre (jamais « toutes les cartes de l'espace »).
   *
   * Lecture d'ESPACE, comme le fil lui-même (un coéquipier voit les cartes d'un
   * fil partagé, il ne les confirme pas — `loadOwned`).
   */
  async listForThread(
    principal: RunPrincipal,
    filter: { conversationId: string | null; turnIds: readonly string[] },
    now = new Date(),
  ): Promise<CardView[]> {
    const { workspaceId } = await this.runner.workspaceOf(principal.userId)
    const scope = { workspace_id: workspaceId, trigger: 'copilot_proposal' as const }
    const where = filter.conversationId
      ? { ...scope, conversation_id: filter.conversationId }
      : filter.turnIds.length > 0
        ? { ...scope, turn_id: In([...filter.turnIds]) }
        : null
    if (!where) return []
    const rows = await this.runs.find({ where, order: { created_at: 'ASC' }, take: 100 })
    const views: CardView[] = []
    for (const row of rows) {
      const current = await this.refresh(row)
      // R9 — le brouillon d'un coéquipier reste à lui tant que rien n'est validé.
      views.push(this.readableBy(this.toView(current, await this.latestApproval(current), now), current, principal))
    }
    // Chronologique, puis dans l'ordre de la réponse : c'est l'ordre du fil.
    return views.sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
        (left.proposalIndex ?? 0) - (right.proposalIndex ?? 0),
    )
  }

  /**
   * #1955.22 — les cartes CONFIRMÉES d'un fil, pour son export : celles où
   * l'auteur a cliqué, quel que soit le résultat final. Réutilise
   * `DRAFT_VALIDATED_STATES` — le même ensemble qui décide, plus haut, « le
   * brouillon est-il validé » (R9) : une seconde définition de « confirmée »
   * divergerait de la première dès qu'un état neuf s'ajoute.
   */
  async confirmedForThread(
    principal: RunPrincipal,
    conversationId: string | null,
    now = new Date(),
  ): Promise<CardView[]> {
    const views = await this.listForThread(principal, { conversationId, turnIds: [] }, now)
    return views.filter(view => DRAFT_VALIDATED_STATES.includes(view.state))
  }

  /** Une carte, avec son état — et, si elle attend une recherche en file, ce que la file sait maintenant. */
  async view(runId: string, principal: RunPrincipal, now = new Date()): Promise<CardView> {
    const { run } = await this.load(runId, principal)
    const current = await this.refresh(run)
    // R9 — le brouillon d'un coéquipier reste à lui tant que rien n'est validé.
    return this.readableBy(this.toView(current, await this.latestApproval(run), now), current, principal)
  }

  /**
   * Les cartes de l'espace, récentes d'abord. `states` filtre sur l'ÉTAT calculé
   * (les deux lectures de l'écran Actions : `CARD_STATES_IN_ACTIONS_CURRENT` /
   * `_HISTORY`), `conversationId` sur un fil.
   */
  async list(
    principal: RunPrincipal,
    filter: { states?: readonly CopilotCardState[]; conversationId?: string },
    now = new Date(),
  ): Promise<CardView[]> {
    const { workspaceId } = await this.runner.workspaceOf(principal.userId)
    const rows = await this.runs.find({
      where: {
        workspace_id: workspaceId,
        trigger: 'copilot_proposal',
        ...(filter.conversationId ? { conversation_id: filter.conversationId } : {}),
      },
      order: { created_at: 'DESC' },
      take: 100,
    })
    const views: CardView[] = []
    for (const row of rows) {
      const current = await this.refresh(row)
      // R9 — le brouillon d'un coéquipier reste à lui tant que rien n'est validé.
      views.push(this.readableBy(this.toView(current, await this.latestApproval(current), now), current, principal))
    }
    return filter.states ? views.filter(view => filter.states?.includes(view.state)) : views
  }

  /** Confirmer — le clic EST la décision (doctrine). Deux clics, un effet. */
  async confirm(runId: string, principal: RunPrincipal, now = new Date()): Promise<CardView> {
    const { run, workspace } = await this.loadOwned(runId, principal)
    const approval = await this.latestApproval(run)
    const state = this.stateOf(run, approval, now)
    if (!this.allowed(run, state).includes('confirm')) {
      // Déjà lancée (second onglet, double clic) : on rend ce qui est, sans rien relancer.
      if (run.status !== 'planned' && run.status !== 'snoozed' && state !== 'expired') {
        return this.view(runId, principal, now)
      }
      throw new ConflictException(`Cette carte est « ${state} » : elle ne se confirme plus.`)
    }
    // #1950.22 — une étape dont le prérequis DÉCLARÉ a échoué ne démarre pas,
    // ni par le plan ni par son propre clic : le serveur tient la règle.
    await this.assertPlanPrerequisites(run, principal, now)
    const definition = cardDefinitionForKey(run.definition_key)
    if (!definition || !run.intents) throw new ConflictException('Cette carte n’a rien d’exécutable.')
    assertRolePermits(workspace.role, definition.steps[0]?.permission)

    const decision = decideApproval({
      steps: definition.steps,
      workflowMinimum: definition.minimumLevel,
      targetCount: 1,
      estimatedCredits: run.estimated_credits,
      settings: workspace.settings,
    })
    const summary = (run.preview?.whatWillHappen ?? definition.steps[0]?.intent ?? 'Carte de Laura').slice(0, 2000)

    if (decision.needsManager) {
      const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'awaiting_approval' })
      if (!claimed) return this.view(runId, principal, now)
      await this.approvals.save(
        this.approvals.create({
          workspace_id: run.workspace_id,
          run_id: run.id,
          step_key: null,
          required_level: decision.requiredLevel,
          state: 'pending',
          requested_by: run.user_id,
          decided_by: null,
          decided_at: null,
          summary,
          estimated_credits: run.estimated_credits,
          expires_at: new Date(now.getTime() + APPROVAL_TTL_MS),
          reason: null,
        }),
      )
      return this.view(runId, principal, now)
    }

    const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'running', started_at: now })
    if (!claimed) return this.view(runId, principal, now)
    await this.approvals.save(
      this.approvals.create({
        workspace_id: run.workspace_id,
        run_id: run.id,
        step_key: null,
        required_level: decision.requiredLevel,
        state: 'approved',
        requested_by: run.user_id,
        decided_by: principal.userId,
        decided_at: now,
        summary,
        estimated_credits: run.estimated_credits,
        expires_at: new Date(now.getTime() + APPROVAL_TTL_MS),
        reason: null,
      }),
    )
    // #2896 / #2449.35 — `principal.actionLevel` (le niveau RÉGLÉ, lu par le
    // contrôleur) voyage avec ce spread jusqu'à la porte du routeur.
    const executed = await this.runner.executeCard(
      { ...run, status: 'running', started_at: now },
      { ...principal, origin: 'user' },
      1,
    )
    const settled = await this.settleResult(executed.run, executed.artifact)
    // #1943.6 — T2 : ce qui vient de partir rend obsolète la carte identique encore en attente.
    await this.supersedeExecutedElsewhere(settled, now)
    return this.toView(settled, await this.latestApproval(settled), now)
  }

  /**
   * #1950.14 / #1950.18 — LE GESTE DE PLAN : « Lancer tout le plan » (`all`) ou
   * « Seulement la 1re étape » (`first`), sur les cartes d'UN tour.
   *
   * #1950.14 revient sur 1950.3, délibérément (décision Louis 19/09/2026) : les
   * étapes s'enchaînent. Ce qui tient : chacune passe par `confirm` — mêmes
   * droits (seul l'auteur), mêmes gardes, même clé d'effet, aucune porte neuve —
   * et `planNextLaunch` (contrat, GA-26) ne choisit que ce qui prépare ou crée
   * dans Bellum. Ce qui écrirait dehors reste sur sa carte.
   *
   * L'état est RELU après chaque étape : un échec bloque sa dépendante déclarée
   * sans arrêter le reste ; un résultat inconnu arrête tout. Relancé après une
   * fermeture de page, le geste repart de l'état persisté — rien n'est rejoué.
   *
   * Un refus du serveur sur une étape (droit, carte changée entre-temps) ne fait
   * pas tomber le plan : il est rendu avec sa phrase, et le plan continue.
   */
  async runPlan(
    turnId: string,
    principal: RunPrincipal,
    mode: PlanLaunchMode,
    now = new Date(),
  ): Promise<PlanRunOutcome> {
    let cards = await this.listForThread(principal, { conversationId: null, turnIds: [turnId] }, now)
    if (cards.length === 0) throw new NotFoundException('Aucun plan pour ce tour.')
    const launched: number[] = []
    const refused: PlanRunOutcome['refused'] = []
    const tried = new Set<string>()
    // Borne : chaque tour de boucle essaie une carte NEUVE (`tried`), donc jamais
    // plus de tours que le plan ne compte de cartes.
    for (let attempt = 0; attempt < cards.length; attempt += 1) {
      const next = planNextLaunch(cards, mode, tried)
      if (!next) break
      tried.add(next)
      const rank = cards.find(card => card.id === next)?.proposalIndex ?? null
      try {
        const settled = await this.confirm(next, principal)
        cards = cards.map(card => (card.id === settled.id ? settled : card))
        if (rank !== null) launched.push(rank)
      } catch (error) {
        if (!(error instanceof HttpException)) throw error
        refused.push({ rank, reason: error.message })
      }
    }
    return { cards, launched, refused }
  }

  /**
   * #1950.22 — refuse le clic d'une étape dont un prérequis DÉCLARÉ (`depends_on`)
   * a échoué, n'a pas pu partir, ou a un résultat inconnu. Sans déclaration :
   * aucune lecture, aucun refus — le rang seul ne crée jamais de dépendance.
   */
  private async assertPlanPrerequisites(run: WorkflowRunEntity, principal: RunPrincipal, now: Date): Promise<void> {
    if (!run.turn_id || !run.proposal?.depends_on?.length) return
    const siblings = await this.listForThread(principal, { conversationId: null, turnIds: [run.turn_id] }, now)
    const blockedBy = planStepsOf(siblings).find(step => step.id === run.id)?.blockedBy
    if (!blockedBy) return
    throw new ConflictException(`Étape bloquée : l’étape ${blockedBy.rank + 1} ${BLOCKED_BECAUSE[blockedBy.cause]}.`)
  }

  /** Refuser — approbation `rejected` + run `cancelled`. La carte reste visible (historique). */
  async reject(runId: string, principal: RunPrincipal, reason?: string, now = new Date()): Promise<CardView> {
    const { run } = await this.loadOwned(runId, principal)
    this.assertAllowed(run, await this.latestApproval(run), 'reject', now)
    const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'cancelled', finished_at: now })
    if (!claimed) return this.view(runId, principal, now)
    await this.approvals.save(
      this.approvals.create({
        workspace_id: run.workspace_id,
        run_id: run.id,
        step_key: null,
        required_level: 'n2_user_approval',
        state: 'rejected',
        requested_by: run.user_id,
        decided_by: principal.userId,
        decided_at: now,
        summary: (run.preview?.whatWillHappen ?? 'Carte de Laura').slice(0, 2000),
        estimated_credits: run.estimated_credits,
        expires_at: new Date(now.getTime() + APPROVAL_TTL_MS),
        reason: reason ?? null,
      }),
    )
    // Rien n'a été réservé avant le lancement ; solder reste un no-op sûr.
    await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
    return this.view(runId, principal, now)
  }

  /**
   * Reporter — date CHOISIE, défaut demain 9 h (arbitrage du 12/09) ; l'expiration
   * de 3 jours repart de cette date (`cardExpiresAt`).
   *
   * ⚠️ Le défaut est calculé avec l'horloge du SERVEUR : « 9 h » y est 9 h UTC.
   * Le contrat le dit (`snoozeCardRequestSchema` : calculé côté appelant) — l'écran
   * (L4) doit envoyer `until` dans le fuseau de la personne.
   */
  async snooze(runId: string, principal: RunPrincipal, until?: string | null, now = new Date()): Promise<CardView> {
    const { run } = await this.loadOwned(runId, principal)
    this.assertAllowed(run, await this.latestApproval(run), 'snooze', now)
    if (until === null) {
      // #2856 — RÉVEILLER : `until: null`, même stockage que le report
      // (`snoozed_until`), même contrôle d'accès (`loadOwned` ci-dessus). La
      // carte redevient ce qu'elle était avant d'être reportée — `planned`
      // laisse `cardStateOf` retrouver `suggested`/`prepared` selon la preview.
      const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'planned', snoozed_until: null })
      if (!claimed) return this.view(runId, principal, now)
      return this.view(runId, principal, now)
    }
    const target = until ? new Date(until) : defaultSnoozeUntil(now)
    if (Number.isNaN(target.getTime()) || target.getTime() <= now.getTime()) {
      throw new BadRequestException('La date de report doit être dans le futur.')
    }
    const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'snoozed', snoozed_until: target })
    if (!claimed) return this.view(runId, principal, now)
    return this.view(runId, principal, now)
  }

  /** Modifier — avant lancement seulement ; la prévisualisation et les intents sont RECALCULÉS et re-figés. */
  async modify(
    runId: string,
    principal: RunPrincipal,
    patch: Record<string, unknown>,
    now = new Date(),
  ): Promise<CardView> {
    const { run, workspace } = await this.loadOwned(runId, principal)
    this.assertAllowed(run, await this.latestApproval(run), 'modify', now)
    const current = run.proposal
    if (!current) throw new ConflictException('Cette carte ne garde pas sa proposition : elle ne se modifie pas.')
    if ('action' in patch && patch['action'] !== current.action) {
      throw new BadRequestException('Le type d’une carte ne se modifie pas.')
    }
    const merged = pendingChatActionSchema.safeParse({ ...current, ...patch, action: current.action })
    if (!merged.success) throw new BadRequestException(merged.error.issues[0]?.message ?? 'Modification invalide.')
    const built = buildCard(merged.data)
    if (!built) throw new BadRequestException('Cette carte n’a rien d’exécutable.')
    const card = await this.scopeToWorkspace(built, workspace.workspaceId)
    const claimed = await this.claim(run, NOT_LAUNCHED, {
      // #2423.9 — `previous_term`/`new_term` (`propose_mission_amendment`) sont
      // le premier champ `Record<string, unknown>` de l'union : le mapeur
      // « deep partial » de TypeORM ne sait pas le recomposer récursivement à
      // travers une signature d'index générique. La valeur part inchangée
      // (même `jsonb`, même colonne) — seule la vérification de TYPE de cet
      // appel se relâche, pas le runtime.
      proposal: merged.data as QueryDeepPartialEntity<WorkflowRunEntity>['proposal'],
      intents: card.intents,
      preview: card.preview,
      contact_id: card.contactId,
      account_id: card.accountId,
      estimated_credits: card.definition.steps.reduce((sum, step) => sum + step.estimatedCredits, 0),
    })
    if (!claimed) return this.view(runId, principal, now)
    return this.view(runId, principal, now)
  }

  /**
   * Réessayer — SEULEMENT après un échec (`cardAllowedGestures`) : jamais après un
   * résultat inconnu. Une NOUVELLE tentative, avec une clé de dispatch neuve
   * (`<runId>:effect:<n>`) ; le geste lui-même ne coûte rien (I7), l'action
   * relancée suit sa règle de débit habituelle.
   *
   * #2384.2 — LE CLIC EST CAPPÉ À `maxAttempts` (`retryPolicySchema`, posée sur
   * chaque pas depuis `copilot-card-catalog.ts` mais jamais lue jusqu'ici).
   * Reste un geste MANUEL (#1943, aucune reprise automatique) : on borne le
   * clic, on n'automatise rien — le webhook de bounce qui distinguerait
   * permanent/retryable reste un chantier d'infra séparé (non fusionné ici).
   */
  async retry(runId: string, principal: RunPrincipal, now = new Date()): Promise<CardView> {
    const { run, workspace } = await this.loadOwned(runId, principal)
    this.assertAllowed(run, await this.latestApproval(run), 'retry', now)
    assertRolePermits(workspace.role, cardDefinitionForKey(run.definition_key)?.steps[0]?.permission)
    const attempt = run.steps.reduce((max, step) => Math.max(max, step.attempts), 0) + 1
    const maxAttempts =
      cardDefinitionForKey(run.definition_key)?.steps[0]?.retry.maxAttempts ?? DEFAULT_RETRY_POLICY.maxAttempts
    if (attempt > maxAttempts) {
      throw new ConflictException(`Trop de tentatives : ${maxAttempts} au maximum pour cette action.`)
    }
    const claimed = await this.claim(run, ['failed'], { status: 'running', finished_at: null, result: null })
    if (!claimed) return this.view(runId, principal, now)
    const executed = await this.runner.executeCard(
      { ...run, status: 'running', finished_at: null, result: null },
      { ...principal, origin: 'user' },
      attempt,
    )
    const settled = await this.settleResult(executed.run, executed.artifact)
    // #1943.6 — T2 : ce qui vient de partir rend obsolète la carte identique encore en attente.
    await this.supersedeExecutedElsewhere(settled, now)
    return this.toView(settled, await this.latestApproval(settled), now)
  }

  /** Annuler — l'auteur retire une carte qui attend un responsable. Rien n'est parti, rien n'est réservé. */
  async cancel(runId: string, principal: RunPrincipal, reason?: string, now = new Date()): Promise<CardView> {
    const { run } = await this.loadOwned(runId, principal)
    const pending = await this.latestApproval(run)
    this.assertAllowed(run, pending, 'cancel', now)
    const claimed = await this.claim(run, ['awaiting_approval'], { status: 'cancelled', finished_at: now })
    if (!claimed) return this.view(runId, principal, now)
    if (pending?.state === 'pending') {
      await this.approvals.update(
        { id: pending.id, workspace_id: run.workspace_id, state: 'pending' },
        {
          state: 'rejected',
          decided_by: principal.userId,
          decided_at: now,
          reason: reason ?? 'Retirée par son auteur.',
        },
      )
    }
    await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
    return this.view(runId, principal, now)
  }

  /** Obsolète — un fait plus récent a rendu la carte sans objet (appelé par le pont de conversation, L3). */
  async supersede(runId: string, principal: RunPrincipal, reason: string, now = new Date()): Promise<CardView> {
    const { run } = await this.loadOwned(runId, principal)
    await this.markSuperseded(run, reason, now)
    return this.view(runId, principal, now)
  }

  /**
   * #1943.6 — T1 : une NOUVELLE carte du même type sur la même cible, dans le même
   * fil et du même auteur, rend obsolètes les précédentes encore non lancées.
   *
   * Pas au sein d'un même tour (deux propositions d'une même réponse ne sont pas
   * « un fait plus récent » l'une pour l'autre), pas d'un autre auteur (sa carte
   * n'est pas la mienne à retirer), jamais une carte déjà partie.
   */
  private async supersedeOlderInThread(run: WorkflowRunEntity, now: Date): Promise<number> {
    if (!run.conversation_id) return 0
    return this.supersedeMatching(run, { conversation_id: run.conversation_id }, NEWER_IN_THREAD_REASON, now, {
      skipSameTurn: true,
    })
  }

  /**
   * #1943.6 — T2 : une carte vient d'être EXÉCUTÉE ; la même action sur la même
   * cible, encore en attente ailleurs (un autre fil du même auteur), n'a plus
   * d'objet. Seulement pour les effets qu'on ne refait pas
   * (`CARD_TYPES_OBSOLETE_ONCE_EXECUTED`) — un second brouillon reste légitime.
   */
  private async supersedeExecutedElsewhere(run: WorkflowRunEntity, now: Date): Promise<number> {
    if (run.status !== 'done' || !run.proposal) return 0
    if (!CARD_TYPES_OBSOLETE_ONCE_EXECUTED.includes(run.proposal.action)) return 0
    return this.supersedeMatching(run, {}, EXECUTED_ELSEWHERE_REASON, now, { skipSameTurn: false })
  }

  private async supersedeMatching(
    run: WorkflowRunEntity,
    narrowing: { conversation_id?: string },
    reason: string,
    now: Date,
    options: { skipSameTurn: boolean },
  ): Promise<number> {
    const target = run.proposal ? cardTargetKey(run.proposal) : null
    if (!target) return 0
    const siblings = await this.runs.find({
      where: {
        workspace_id: run.workspace_id,
        user_id: run.user_id,
        trigger: 'copilot_proposal',
        definition_key: run.definition_key,
        status: In(NOT_LAUNCHED),
        ...narrowing,
      },
    })
    let superseded = 0
    for (const sibling of siblings) {
      if (sibling.id === run.id) continue
      if (options.skipSameTurn && sibling.turn_id === run.turn_id) continue
      if (!sibling.proposal || cardTargetKey(sibling.proposal) !== target) continue
      if (await this.markSuperseded(sibling, reason, now)) superseded += 1
    }
    return superseded
  }

  /** La transition vers `superseded` (atomique, depuis un état non lancé) et son résultat lisible. */
  private async markSuperseded(run: WorkflowRunEntity, reason: string, now: Date): Promise<boolean> {
    const claimed = await this.claim(run, NOT_LAUNCHED, { status: 'superseded', finished_at: now })
    if (!claimed) return false
    await this.runs.update(
      { id: run.id, workspace_id: run.workspace_id },
      {
        result: {
          outcome: reason.slice(0, 1000),
          occurredAt: now.toISOString(),
          // #1931.12 — pas de repli d'e-mail ici : une supersession est un fait
          // AUTOMATIQUE (une carte plus récente rend celle-ci sans objet),
          // personne n'a agi à cet instant précis. `null` reste vrai.
          actorName: null,
          targetObject: run.preview?.targetObject ?? 'Carte de Laura',
          destination: null,
          externalRef: null,
          creditsSpent: 0,
          nextStep: null,
        },
      },
    )
    return true
  }

  /**
   * SUIVI d'une analyse lancée depuis la conversation (arbitrage du 12/09 :
   * suivi seul, facturation inchangée). Ce service ne lance rien et ne réserve
   * rien (I3) : `AnalysisService.start` a déjà débité. `debitObserved` est le
   * débit que l'APPELANT a observé chez la facturation — `null` s'il ne l'a pas
   * mesuré, et la carte le dira, jamais 0.
   */
  async trackAnalysisLaunch(input: {
    principal: RunPrincipal
    accountId: string
    jobId: string
    debitObserved: number | null
    /**
     * #1943.5 — la clé du LANCEMENT (`analysis:<job>:<instant>`) : le pont qui lance
     * ne connaît pas le tour de conversation. Le suivi rejoint son tour ensuite
     * (`adoptAnalysisLaunches`). À défaut, le couple tour/rang de L2.
     */
    launchKey?: string
    conversationId?: string | null
    turnId?: string | null
    proposalIndex?: number | null
  }): Promise<CardView> {
    const { workspaceId } = await this.runner.workspaceOf(input.principal.userId)
    const key =
      input.launchKey ?? (input.turnId ? copilotCardIdempotencyKey(input.turnId, input.proposalIndex ?? 0) : null)
    if (!key) throw new BadRequestException('Un suivi d’analyse exige une clé de lancement ou un tour.')
    const existing = await this.runs.findOne({ where: { workspace_id: workspaceId, idempotency_key: key } })
    if (existing) return this.toView(existing, null, new Date())
    const account = await this.accounts.findOne({
      where: { id: input.accountId, workspace_id: workspaceId },
      select: ['id', 'company_name'],
    })
    const now = new Date()
    const saved = await this.runs.save(
      this.runs.create({
        workspace_id: workspaceId,
        user_id: input.principal.userId,
        definition_key: ANALYSIS_TRACKING_DEFINITION_KEY,
        definition_version: 1,
        trigger: 'copilot_proposal',
        status: 'running',
        account_id: account?.id ?? null,
        contact_id: null,
        correlation_id: `card_${key}`.slice(0, 64),
        idempotency_key: key,
        steps: [],
        estimated_credits: creditCostOf('account_analysis'),
        spent_credits: input.debitObserved ?? 0,
        started_at: now,
        finished_at: null,
        intents: null,
        preview: {
          whatWillHappen: `Analyser ${account?.company_name ?? 'le compte'}.`,
          targetObject: account?.company_name ?? 'Compte',
          destination: null,
          content: null,
          dataUsed: null,
          costCredits: creditCostOf('account_analysis'),
          connectionUsed: null,
          whatWillNotHappen: 'Aucun crédit en plus : débités au lancement, remboursés si l’analyse échoue.',
        },
        result: {
          outcome: 'Analyse lancée.',
          occurredAt: null,
          // #1931.12 — l'AUTEUR du lancement : la seule personne qui ait agi ici.
          actorName: await this.actorNameOf(input.principal.userId),
          targetObject: account?.company_name ?? 'Compte',
          destination: null,
          externalRef: input.jobId,
          creditsSpent: input.debitObserved,
          nextStep: null,
        },
        conversation_id: input.conversationId ?? null,
        turn_id: input.turnId ?? null,
        proposal_index: input.proposalIndex ?? null,
        snoozed_until: null,
        proposal: null,
      }),
    )
    return this.toView(saved, null, now)
  }

  /**
   * L'issue terminale d'une analyse suivie. « Dépensé » = débit observé −
   * remboursement observé (I4).
   *
   * #1952.17 — une analyse annulée n'est pas une analyse échouée : les TROIS
   * issues terminales sont acceptées ici, pas deux.
   */
  async recordAnalysisOutcome(input: {
    principal: RunPrincipal
    runId: string
    outcome: 'done' | 'failed' | 'cancelled'
    refundObserved: number | null
  }): Promise<CardView> {
    const { run } = await this.loadOwned(input.runId, input.principal)
    if (run.definition_key !== ANALYSIS_TRACKING_DEFINITION_KEY) {
      throw new ConflictException('Cette carte ne suit pas une analyse.')
    }
    const now = new Date()
    const settled = await this.settleAnalysisTracking(run, input.outcome, input.refundObserved, now)
    return settled ? this.toView(settled, null, now) : this.view(input.runId, input.principal, now)
  }

  /**
   * #1943.5 — le suivi d'une analyse lancée PENDANT un tour rejoint ce tour.
   *
   * Le pont qui lance l'analyse (appelé par le service IA au milieu du tour) ne
   * connaît pas le tour : il inscrit un suivi sans ancre. Quand le tour se termine,
   * le contrôleur de chat rattache ces suivis — avec trois bornes, toutes
   * nécessaires : le MÊME auteur, créés DEPUIS le début du tour, et pas plus que
   * les lancements réussis que le tour rapporte (les plus anciens d'abord). Un
   * suivi déjà rattaché ne change jamais de tour (`turn_id IS NULL` dans la
   * transition). Rend le nombre de suivis rattachés.
   */
  async adoptAnalysisLaunches(input: {
    principal: RunPrincipal
    conversationId: string | null
    turnId: string
    since: Date
    launchedInTurn: number
  }): Promise<number> {
    if (input.launchedInTurn <= 0) return 0
    const { workspaceId } = await this.runner.workspaceOf(input.principal.userId)
    const unanchored = await this.runs.find({
      where: {
        workspace_id: workspaceId,
        user_id: input.principal.userId,
        trigger: 'copilot_proposal',
        definition_key: ANALYSIS_TRACKING_DEFINITION_KEY,
        turn_id: IsNull(),
      },
      order: { created_at: 'ASC' },
    })
    let adopted = 0
    for (const run of unanchored) {
      if (adopted >= input.launchedInTurn) break
      if (new Date(run.created_at).getTime() < input.since.getTime()) continue
      const claimed = await this.runs.update(
        { id: run.id, workspace_id: run.workspace_id, turn_id: IsNull() },
        { conversation_id: input.conversationId, turn_id: input.turnId },
      )
      if (claimed.affected) adopted += 1
    }
    return adopted
  }

  /**
   * #1943.5 — l'issue terminale d'une analyse suivie, écrite UNE fois (`running` →
   * issue, atomique). « Dépensé » = débit observé − remboursement observé (I4) ;
   * l'un des deux non mesuré → `null`, jamais 0. Le texte ne dit « remboursés »
   * que si le remboursement OBSERVÉ couvre le débit.
   */
  private async settleAnalysisTracking(
    run: WorkflowRunEntity,
    outcome: 'done' | 'failed' | 'cancelled',
    refundObserved: number | null,
    now: Date,
  ): Promise<WorkflowRunEntity | null> {
    const debited = run.result?.creditsSpent ?? null
    const spent = debited === null || refundObserved === null ? null : Math.max(0, debited - refundObserved)
    const refundedInFull = debited !== null && refundObserved !== null && refundObserved >= debited
    // #1952.32 (#2844) — SEULEMENT sur une analyse RÉUSSIE : un échec ou une
    // annulation n'a rien produit de nouveau à vérifier, et interroger les
    // contacts du compte attribuerait à CE run une confiance mesurée par un
    // travail antérieur, sans rapport avec lui.
    const toVerify =
      outcome === 'done' && run.account_id ? await this.contactsToVerify(run.account_id, run.workspace_id) : []
    const analysisFound =
      outcome === 'done' && run.account_id ? await this.analysisFoundOf(run.account_id, run.workspace_id) : null
    // #1952.17 — une analyse annulée n'est pas une analyse échouée. Le texte ne
    // dit jamais « échoué » d'un arrêt volontaire, et surtout : pas de
    // `nextStep` de relance. Relancer, c'est REDÉBITER un travail que
    // l'utilisateur a lui-même arrêté et dont le crédit vient de lui être rendu
    // (`AnalysisService.cancelByUser` → `refundAnalysisSlot`). Le mot
    // « remboursés » reste subordonné à un remboursement OBSERVÉ (I4) : non lu
    // au registre, il n'est pas promis.
    const result: CardResult = {
      outcome: analysisSettlementSentence(outcome, refundedInFull),
      occurredAt: now.toISOString(),
      // #1931.12 — au nom de l'AUTEUR du lancement (`run.user_id`), quel que
      // soit le lecteur qui observe l'issue (cf. `observeAnalysisTracking`).
      actorName: await this.actorNameOf(run.user_id),
      targetObject: run.result?.targetObject ?? 'Compte',
      destination: null,
      // #2105.39 — une analyse de compte n'est pas une action à effet passant
      // par un connecteur : aucun outil connecté n'y est mêlé.
      connectionUsed: null,
      externalRef: run.result?.externalRef ?? null,
      creditsSpent: spent,
      nextStep: outcome === 'failed' ? 'Relancer l’analyse depuis la conversation.' : null,
      // Absent/vide = rien à vérifier — la LISTE ne fait alors aucune ligne
      // (doctrine : on n'affiche pas ce qu'on n'a pas).
      ...(toVerify.length > 0 ? { toVerify } : {}),
      // #3416.x2 — le résultat réel de l'analyse, pour « Ce que ça apprend ».
      ...(analysisFound ? { analysisFound } : {}),
    }
    const patch = { status: outcome, finished_at: now, spent_credits: spent ?? 0, result }
    const claimed = await this.claim(run, ['running'], patch)
    return claimed ? { ...run, ...patch } : null
  }

  /**
   * #3416.x2 — ce que l'analyse a RÉELLEMENT produit : les contacts vivants du
   * compte, dont ceux à e-mail vérifié. `null` sans contact (jamais un zéro) ou
   * si la lecture échoue — le règlement du run ne dépend pas de ce résumé.
   */
  private async analysisFoundOf(
    accountId: string,
    workspaceId: string,
  ): Promise<{ contacts: number; verifiedEmails: number } | null> {
    try {
      const rows = await this.contacts.find({
        where: { account_id: accountId, workspace_id: workspaceId, deleted_at: IsNull() },
        take: 500,
      })
      return summariseAnalysisFound(rows)
    } catch {
      return null
    }
  }

  /**
   * #1952.32 (#2844) — les contacts du compte dont l'e-mail n'est pas confirmé
   * (`email_confidence` 'medium'/'low', #2120.68), au nom desquels une analyse
   * réussie doit dire « à vérifier ». `high` et `null` (non mesurée) sont
   * exclus PAR `contactVerificationLine` — jamais devinés. Bornée à 20 lignes :
   * une carte ne déroule pas un annuaire entier.
   */
  private async contactsToVerify(accountId: string, workspaceId: string): Promise<string[]> {
    const rows = await this.contacts.find({
      where: { account_id: accountId, workspace_id: workspaceId, email_confidence: In(['medium', 'low']) },
      take: 20,
    })
    return rows
      .map(contact => contactVerificationLine(contact.full_name, contact.email_confidence))
      .filter((line): line is string => line !== null)
  }

  // ── lectures et transitions ────────────────────────────────────────────────

  private async load(runId: string, principal: RunPrincipal): Promise<{ run: WorkflowRunEntity }> {
    const { workspaceId } = await this.runner.workspaceOf(principal.userId)
    const run = await this.runs.findOne({
      where: { id: runId, workspace_id: workspaceId, trigger: 'copilot_proposal' },
    })
    if (!run) throw new NotFoundException('Carte introuvable.')
    return { run }
  }

  private async loadOwned(
    runId: string,
    principal: RunPrincipal,
  ): Promise<{ run: WorkflowRunEntity; workspace: Awaited<ReturnType<WorkflowRunnerService['workspaceOf']>> }> {
    const workspace = await this.runner.workspaceOf(principal.userId)
    const run = await this.runs.findOne({
      where: { id: runId, workspace_id: workspace.workspaceId, trigger: 'copilot_proposal' },
    })
    if (!run) throw new NotFoundException('Carte introuvable.')
    // `canDecide` sous `n3` : seul l'auteur de la demande agit sur elle.
    if (run.user_id !== principal.userId) {
      throw new ForbiddenException("Seul l'auteur de la carte peut agir dessus.")
    }
    return { run, workspace }
  }

  /** `UPDATE … WHERE id AND espace AND status IN (…)` — vrai si CE geste a gagné. */
  private async claim(
    run: WorkflowRunEntity,
    from: WorkflowRunEntity['status'][],
    patch: QueryDeepPartialEntity<WorkflowRunEntity>,
  ): Promise<boolean> {
    const updated = await this.runs.update({ id: run.id, workspace_id: run.workspace_id, status: In(from) }, patch)
    return Boolean(updated.affected)
  }

  private async latestApproval(run: WorkflowRunEntity): Promise<ApprovalRequestEntity | null> {
    return this.approvals.findOne({
      where: { run_id: run.id, workspace_id: run.workspace_id },
      order: { created_at: 'DESC' },
    })
  }

  /**
   * Ce qu'une lecture rafraîchit : une recherche en file dont la file connaît
   * l'issue, et le résultat « après action » d'une carte terminée AILLEURS que par
   * ce service — une carte `n3` exécutée par `POST action-os/approvals/:id` n'a
   * jamais repassé par `confirm`, et sans ceci elle restait sans résultat.
   */
  private async refresh(run: WorkflowRunEntity): Promise<WorkflowRunEntity> {
    if (run.definition_key === ANALYSIS_TRACKING_DEFINITION_KEY) return this.observeAnalysisTracking(run)
    if (run.result && run.status !== 'running') return run
    const observed = run.status === 'running' ? await this.reconcileAsOwner(run) : run
    const settled = await this.settleResult(observed)
    // #1943.6 — T2, pour une carte terminée AILLEURS que par `confirm` (un
    // responsable par `POST action-os/approvals/:id`, une recherche en file) : la
    // première lecture qui la voit faite retire la carte identique en attente.
    if (settled.status === 'done') await this.supersedeExecutedElsewhere(settled, new Date())
    return settled
  }

  /**
   * #1943.5 — l'issue d'une analyse SUIVIE, observée à la lecture : le statut de
   * l'analyse et le remboursement du registre, par le port (au nom de l'AUTEUR du
   * lancement, quel que soit le lecteur). Rien n'est supposé : sans observateur,
   * en vol, ou illisible, la carte reste « en cours ». L'issue s'écrit une fois.
   */
  private async observeAnalysisTracking(run: WorkflowRunEntity): Promise<WorkflowRunEntity> {
    const jobId = run.result?.externalRef
    if (run.status !== 'running' || !this.analysisLaunches || !run.account_id || !jobId) return run
    let observed: Awaited<ReturnType<AnalysisLaunchObserver['observe']>>
    try {
      observed = await this.analysisLaunches.observe({
        userId: run.user_id,
        accountId: run.account_id,
        jobId,
        launchedAt: run.started_at ?? run.created_at,
      })
    } catch {
      return run
    }
    // #1952.1 — encore en vol : la carte porte l'avancement MESURÉ, et rien
    // d'autre. Un `unknown` n'est pas un échec : il laisse la carte en cours.
    // #1952.17 — une analyse annulée n'est pas une analyse échouée, mais c'est
    // bien une issue TERMINALE : la laisser dans le cas « en vol » aurait fait
    // tourner la carte sur « Analyse lancée. » jusqu'à la fin des temps.
    if (observed.state !== 'done' && observed.state !== 'failed' && observed.state !== 'cancelled')
      return this.noteAnalysisProgress(run, observed.progress ?? null)
    const settled = await this.settleAnalysisTracking(run, observed.state, observed.refunded, new Date())
    // Une autre lecture a écrit l'issue la première : on relit ce qu'elle a écrit.
    return settled ?? (await this.runs.findOne({ where: { id: run.id, workspace_id: run.workspace_id } })) ?? run
  }

  /**
   * #1952.1 — L'AVANCEMENT D'UN TRAVAIL LONG, DANS LA SEULE LIGNE QUE LE FIL REND.
   *
   * La carte de suivi d'une analyse affichait « Analyse lancée. » de bout en
   * bout : son ÉTAT était juste, son AVANCEMENT absent. Les quatre points de
   * contrôle du pipeline sont pourtant une mesure — une ligne existe si et
   * seulement si l'écriture de cette phase a été validée. La phrase vient de
   * {@link longJobProgressSentence}, qui rend `null` dès que la position n'est
   * pas établie : « 0 sur 4 » ne s'écrit jamais, parce qu'une liste de phases
   * vide ne distingue pas « rien de franchi » de « rien de lu ».
   *
   * Écrit SEULEMENT quand la phrase change : une carte relue à chaque
   * rafraîchissement du fil n'écrit pas une ligne par lecture. La clause
   * `status: 'running'` fait le reste — une analyse soldée entre deux lectures
   * ne se voit pas repeindre un avancement par-dessus son issue.
   */
  private async noteAnalysisProgress(
    run: WorkflowRunEntity,
    progress: { done: number; total: number } | null,
  ): Promise<WorkflowRunEntity> {
    const sentence = longJobProgressSentence(
      LONG_JOB_SPECS.account_analysis,
      progress?.done ?? null,
      progress?.total ?? null,
    )
    if (!sentence || !run.result || run.result.outcome === sentence) return run
    const result: CardResult = { ...run.result, outcome: sentence }
    await this.runs.update({ id: run.id, workspace_id: run.workspace_id, status: 'running' }, { result })
    return { ...run, result }
  }

  /** La recherche en file est observée AU NOM DE L'AUTEUR : l'état d'un job est borné à son propriétaire. */
  private async reconcileAsOwner(run: WorkflowRunEntity): Promise<WorkflowRunEntity> {
    if (!cardDefinitionForKey(run.definition_key)) return run
    return this.runner.reconcile(run, { userId: run.user_id, email: '' })
  }

  /** Écrit le résultat « après action » (#1931) dès que le run a une issue. */
  private async settleResult(
    run: WorkflowRunEntity,
    artifact: ActionDispatchArtifact | null = null,
  ): Promise<WorkflowRunEntity> {
    if (run.status === 'running' || run.status === 'planned' || run.status === 'snoozed') return run
    if (run.status === 'awaiting_approval' || !cardDefinitionForKey(run.definition_key)) return run
    // #1931.12 — l'auteur du run est celui dont le geste (clic auto-approuvé, ou
    // décision d'un responsable déjà tranchée ailleurs) a produit cet effet.
    const result = cardResultOf(run, artifact, await this.actorNameOf(run.user_id))
    await this.runs.update({ id: run.id, workspace_id: run.workspace_id }, { result })
    // #1931.20 — cet appel n'a lieu qu'ICI, la PREMIÈRE fois que `result` est
    // écrit : `refresh()` ne rappelle jamais `settleResult` une fois
    // `run.result` posé, donc une lecture répétée de la carte n'ingère pas une
    // seconde ligne.
    await this.recordInTimeline(run, result)
    const outreachMessageId = await this.recordCanonicalOutreachDraft(run, artifact)
    // #2366.1 / #2366.2 — une seconde écriture, best-effort comme la première :
    // sans l'identifiant, la carte garde `content` (le texte figé au moment de
    // la génération) mais rien ne permet plus de RELIRE l'objet à jour depuis
    // le fil — l'échec de cette écriture ne doit pas non plus faire échouer le
    // règlement déjà acquis de la carte.
    if (!outreachMessageId) return { ...run, result }
    const withMessage: CardResult = { ...result, outreachMessageId }
    await this.runs.update({ id: run.id, workspace_id: run.workspace_id }, { result: withMessage })
    return { ...run, result: withMessage }
  }

  /**
   * #2366.1 / #2366.2 — un brouillon que Laura vient de GÉNÉRER
   * (`generate_message`, carte « préparer un message ») devient AUSSI le
   * message canonique (`outreach_messages`, source `laura`) : le MÊME objet
   * que lit la fiche Contact et le centre d'approbation Outreach, jamais une
   * seconde version propre au fil. Il naît `needs_review`, comme toute
   * création (`OutreachMessageService.create`) — préparé n'est jamais envoyé.
   *
   * Best-effort, comme {@link recordInTimeline} juste au-dessus : une écriture
   * qui échoue ne doit pas empêcher la carte de se régler — le brouillon reste
   * lisible dans le fil même si son double canonique n'a pas pu naître.
   *
   * `role` n'est PAS lu par `OutreachMessageService.create` (vérifié : ni
   * `create`, ni `saveVersion`, ni `log` ne le consultent — seul un geste HTTP
   * humain passe par la porte RBAC du contrôleur). La valeur posée ici est
   * donc un remplissage de type, jamais une autorisation empruntée.
   */
  private async recordCanonicalOutreachDraft(
    run: WorkflowRunEntity,
    artifact: ActionDispatchArtifact | null,
  ): Promise<string | null> {
    if (!this.outreachMessages) return null
    if (!artifact || artifact.kind !== 'message_draft') return null
    if (!run.contact_id) return null
    try {
      const message = await this.outreachMessages.create(
        { userId: run.user_id, workspaceId: run.workspace_id, role: 'member' },
        {
          contact_id: run.contact_id,
          channel: artifact.channel,
          // Laura n'a aujourd'hui aucun intent plus précis à transmettre ici
          // (le tool `prepare_message_for_contact` ne porte qu'un `angle`
          // libre, pas un des douze intents fermés) — `open_relationship` est
          // le défaut le plus honnête pour une première approche.
          intent: 'open_relationship',
          source: 'laura',
          subject: artifact.subject,
          body: artifact.body,
          // #3234 (#3211.11) — l'ANGLE de ce brouillon devient la RAISON du
          // message canonique : c'est exactement le champ que
          // `fetch_recent_outreach_for_contact` (apps/ia) relit pour refuser
          // une relance identique sans angle nouveau (#3211.1) — sans cette
          // ligne, `reason` restait `null` pour tout message né d'une carte
          // Laura, et cette porte ne comparait jamais rien. `undefined`,
          // jamais deviné, quand aucun angle n'a été donné.
          reason: artifact.angle?.trim() || undefined,
        },
        async () => new Set<string>(),
        'model',
      )
      // #4016 L5 (reprise 20/10) — Laura qui envoie, SOUS mandat `laura_send` signé et vivant
      // seulement (le service décide) ; l'e-mail seul a un connecteur d'envoi. Rien ne part ici.
      // Un échec ici laisse un brouillon ordinaire, jamais un lien perdu.
      if (artifact.channel === 'email' && this.delegations) {
        await this.delegations
          .awaitIfMandated(run.workspace_id, message.id, 'laura_send', new Date())
          .catch((error: unknown) => this.logger.warn(`Mandat Laura non relu : ${(error as Error).message}`))
      }
      return message.id
    } catch (error) {
      this.logger.warn(`Message canonique non créé pour le run ${run.id} : ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #1931.20 — LE RÉSULTAT REND AUSSI DANS ACTIONS ET LA TIMELINE.
   *
   * Sans ceci, le résultat d'une carte ne vivait que dans le fil (et, pour un
   * run rattaché à un compte, dans la lecture live de `AccountTimelineService`)
   * — jamais dans `ExecutedActionsList` (« Actions et décisions ») ni dans la
   * timeline d'un CONTACT, toutes deux lues depuis `activities` (#2124.41).
   *
   * Best-effort, comme `ActivitiesService.recordCrmLookup` et
   * `TasksService.recordCompletion` : une trace qui échoue à s'écrire ne doit
   * pas empêcher la carte de se régler — un `result` déjà écrit en base ne
   * doit jamais dépendre d'un second système pour aboutir. L'ingestion est de
   * toute façon idempotente (`externalId`), une seconde protection derrière le
   * garde-fou de `settleResult`.
   *
   * Un run sans compte NI contact n'a nulle part où apparaître (même garde que
   * `TasksService.recordCompletion`) : rien n'est écrit.
   */
  private async recordInTimeline(run: WorkflowRunEntity, result: CardResult): Promise<void> {
    if (!this.activities) return
    if (!run.account_id && !run.contact_id) return
    const label = cardDefinitionForKey(run.definition_key)?.name.fr
    if (!label) return
    try {
      await this.activities.ingest(run.workspace_id, run.user_id, [
        {
          kind: 'workflow',
          source: 'system',
          direction: 'internal',
          subject: label,
          body: result.outcome,
          occurredAt: result.occurredAt ?? new Date().toISOString(),
          durationSeconds: null,
          accountId: run.account_id,
          contactId: run.contact_id,
          projectId: null,
          linkReason: 'manual',
          externalId: `workflow:${run.id}`,
          externalUrl: null,
          participants: [],
        },
      ])
    } catch (error) {
      this.logger.warn(`Card result not recorded in the timeline: ${(error as Error).message}`)
    }
  }

  /** Vérifie que les cibles d'une proposition appartiennent à l'espace ; sinon la carte n'a pas d'intent. */
  private async scopeToWorkspace(card: BuiltCard, workspaceId: string): Promise<BuiltCard> {
    const contact = card.contactId
      ? await this.contacts.findOne({ where: { id: card.contactId, workspace_id: workspaceId }, select: ['id'] })
      : null
    const account = card.accountId
      ? await this.accounts.findOne({ where: { id: card.accountId, workspace_id: workspaceId }, select: ['id'] })
      : null
    if (card.contactId && !contact) {
      return { ...card, intents: null, preview: null, contactId: null, accountId: account?.id ?? null }
    }
    return { ...card, contactId: contact?.id ?? null, accountId: account?.id ?? null }
  }

  private stateOf(run: WorkflowRunEntity, approval: ApprovalRequestEntity | null, now: Date): CopilotCardState {
    return cardStateOf(
      {
        status: run.status,
        preview: run.preview,
        ...(run.created_at ? { createdAt: iso(run.created_at) ?? undefined } : {}),
        snoozedUntil: iso(run.snoozed_until),
      },
      approval ? { state: approval.state, expiresAt: approval.expires_at.toISOString() } : null,
      now,
    )
  }

  /** Les gestes de l'état — sauf sur un run de SUIVI (analyse), qui ne se pilote pas d'ici. */
  private allowed(run: WorkflowRunEntity, state: CopilotCardState): readonly CardGesture[] {
    return cardDefinitionForKey(run.definition_key) ? cardAllowedGestures(state) : []
  }

  private assertAllowed(
    run: WorkflowRunEntity,
    approval: ApprovalRequestEntity | null,
    gesture: CardGesture,
    now: Date,
  ): void {
    const state = this.stateOf(run, approval, now)
    if (!this.allowed(run, state).includes(gesture)) {
      throw new ConflictException(`Cette carte est « ${state} » : « ${gesture} » n’est pas possible.`)
    }
  }

  /**
   * R9 (#1930) — ce que le LECTEUR a le droit de lire de cette carte.
   *
   * Posé ici, au point le plus bas où l'on tient à la fois le run (donc son
   * `user_id`) et le principal qui demande, pour que les TROIS lectures d'espace
   * (`list`, `view`, `listForThread`) partagent la même règle : une porte plus
   * étroite que son flux n'est pas une porte. Les gestes (`confirm`, `reject`,
   * `snooze`, `modify`, `retry`, `cancel`) passent par `loadOwned`, qui refuse
   * déjà tout autre que l'auteur — ce masquage ne les change donc pas.
   *
   * Le destinataire, l'objet et le corps voyagent dans TROIS champs de la vue,
   * pas un : la proposition brute (`action`), la prévisualisation en huit lignes
   * (`preview.targetObject` = l'objet, `destination` = le destinataire,
   * `preview.content` = le corps, `copilot-card-catalog.ts`) et le résultat
   * après action (`result.targetObject` / `destination`, recopiés de la
   * prévisualisation par `cardResultOf`, et `result.content` = objet + corps).
   * N'en masquer qu'un laisserait R9 ouvert dans les deux autres.
   *
   * Un champ absent reste absent : `null` n'est pas masqué en une chaîne — « non
   * mesuré » n'est pas « masqué », et inventer une valeur serait le défaut d'en face.
   */
  private readableBy(view: CardView, run: WorkflowRunEntity, principal: RunPrincipal): CardView {
    if (view.action?.action !== 'prepare_mail_draft') return view
    if (run.user_id === principal.userId) return view
    if (DRAFT_VALIDATED_STATES.includes(view.state)) return view
    return {
      ...view,
      action: { ...view.action, to: MASKED_RECIPIENT, subject: MASKED_SUBJECT, body: MASKED_DRAFT },
      preview: view.preview
        ? {
            ...view.preview,
            // G.2 — `targetObject` porte désormais l'OBJET du mail : c'est lui qu'on masque.
            targetObject: MASKED_SUBJECT,
            destination: view.preview.destination === null ? null : MASKED_RECIPIENT,
            content: view.preview.content === null ? null : MASKED_DRAFT,
          }
        : null,
      result: view.result
        ? {
            ...view.result,
            // G.2 — `targetObject` porte désormais l'OBJET du mail : c'est lui qu'on masque.
            targetObject: MASKED_SUBJECT,
            destination: view.result.destination === null ? null : MASKED_RECIPIENT,
            ...(view.result.content === undefined ? {} : { content: MASKED_DRAFT }),
          }
        : null,
    }
  }

  private toView(run: WorkflowRunEntity, approval: ApprovalRequestEntity | null, now: Date): CardView {
    const state = this.stateOf(run, approval, now)
    const expiresAt =
      run.status === 'planned' || run.status === 'snoozed'
        ? iso(cardExpiresAt({ createdAt: iso(run.created_at) ?? undefined, snoozedUntil: iso(run.snoozed_until) }))
        : approval?.state === 'pending'
          ? approval.expires_at.toISOString()
          : null
    return {
      id: run.id,
      action: run.proposal ?? null,
      state,
      allowedGestures: this.allowed(run, state),
      preview: run.preview ?? null,
      result: run.result ?? null,
      snoozedUntil: iso(run.snoozed_until),
      expiresAt,
      steps: run.steps ?? [],
      estimatedCredits: run.estimated_credits,
      spentCredits: run.spent_credits,
      conversationId: run.conversation_id ?? null,
      turnId: run.turn_id ?? null,
      createdAt: iso(run.created_at) ?? new Date(0).toISOString(),
      proposalIndex: run.proposal_index ?? null,
      primary: isPrimaryCardIndex(run.proposal_index),
      accountId: run.account_id ?? null,
    }
  }
}

/**
 * Le droit PROPRE à l'effet d'une carte — le même que la route qu'elle remplace
 * (`POST contacts/:id/enrich` exige `contacts:enrich`, l'export CRM `data:export`).
 * Une permission de pas qui n'est pas une valeur de la matrice (brouillon,
 * routine, réglage personnel : leurs routes n'en exigent aucune) n'ajoute rien.
 */
function assertRolePermits(role: WorkspaceRole, permission: string | undefined): void {
  const parsed = workspacePermissionSchema.safeParse(permission)
  if (parsed.success && !hasPermission(role, parsed.data)) {
    throw new ForbiddenException('Votre rôle ne permet pas cette action.')
  }
}

/**
 * Le résultat « après action » d'une carte (#1931) — pure, depuis le run.
 * Rien n'est inventé : pas de coût quand il n'est pas mesuré (`unknown`, débit
 * non rapporté).
 *
 * #1931.12 — `actorName` était toujours `null` ici : le commentaire disait
 * « la trace le résout », mais rien ne le résolvait jamais, nulle part. La
 * fonction reste pure (elle ne lit aucun profil) ; c'est l'APPELANT
 * (`settleResult`) qui résout le nom réel de `run.user_id` et le passe ici —
 * jamais un e-mail en repli, jamais un nom inventé.
 */
export function cardResultOf(
  run: WorkflowRunEntity,
  artifact: ActionDispatchArtifact | null = null,
  actorName: string | null = null,
): CardResult {
  const step = run.steps[0]
  // Le brouillon généré n'existe QUE dans le résultat : on garde celui qui vient
  // d'être produit, sinon celui qu'une écriture précédente a déjà rangé.
  const content = artifact
    ? artifact.subject
      ? `${artifact.subject}\n\n${artifact.body}`
      : artifact.body
    : run.result?.content
  const unmeasured = !step || step.outcome === 'unknown' || step.reason === DEBIT_NOT_REPORTED_REASON
  // #1943.13 / #1943.14 — un run `partial` (#1943.7) est le SEUL cas où « ce qui
  // s'est passé » ne tient pas dans une phrase unique : certains pas ont
  // réussi, d'autres non, et les deux se nomment séparément plutôt que de se
  // fondre dans `outcome`. La phrase de chaque pas vient de SA définition
  // (`WorkflowStep.intent`, déjà servie à la prévisualisation) — jamais
  // recopiée à un second endroit (GA-26) ; `findWorkflow` couvre les routines,
  // `cardDefinitionForKey` les cartes à un seul pas (même repli qu'ailleurs
  // dans ce fichier, ex. `action-os.controller.ts:278`).
  const partialDefinition =
    run.status === 'partial' ? (findWorkflow(run.definition_key) ?? cardDefinitionForKey(run.definition_key)) : null
  const partialStepLabel = (s: (typeof run.steps)[number]): string =>
    partialDefinition?.steps.find(d => d.key === s.key)?.intent ?? s.intentType
  const partialSucceeded = run.status === 'partial' ? run.steps.filter(s => s.outcome === 'done') : []
  // Un pas qui n'a pas réussi se nomme par SA RAISON quand le runner en a
  // consigné une (`step.reason` — un échec, typiquement) ; sans raison (un pas
  // sauté faute de prérequis, par exemple), sa propre phrase déclarée reste la
  // seule chose vraie à dire — jamais une raison devinée.
  const partialNotDone = run.status === 'partial' ? run.steps.filter(s => s.outcome !== 'done') : []
  const partialSucceededText = partialSucceeded.length > 0 ? partialSucceeded.map(partialStepLabel).join(' ; ') : null
  const partialNotDoneText =
    partialNotDone.length > 0
      ? partialNotDone.map(s => (s.reason?.trim() ? s.reason.trim() : partialStepLabel(s))).join(' ; ')
      : null
  const outcomeText = (() => {
    if (run.status === 'partial') return `${partialSucceeded.length}/${run.steps.length} étapes réussies.`
    if (step?.reason) return step.reason
    switch (run.status) {
      case 'done':
        return 'Action exécutée.'
      case 'failed':
        return "L'action a échoué — rien n'a été débité."
      case 'unknown':
        return "Résultat inconnu : l'action est peut-être partie. Vérifiez avant de relancer."
      case 'blocked':
        return "Rien n'est parti."
      case 'cancelled':
        return 'Carte refusée.'
      default:
        return 'Carte mise à jour.'
    }
  })()
  return {
    outcome: outcomeText.slice(0, 1000),
    occurredAt: step?.finishedAt ?? iso(run.finished_at),
    actorName,
    targetObject: (run.preview?.targetObject ?? 'Carte de Laura').slice(0, 300),
    destination: run.preview?.destination ?? null,
    // #2105.39 — l'outil se recopie de la PRÉVISUALISATION, jamais deviné ici :
    // `connectionUsed` est déjà résolu par injection côté catalogue
    // (`copilot-card-catalog.ts`, `connectedClientTools`), ce champ ne fait
    // que le porter jusqu'au résultat. Avant ce point, seul `destination`
    // était recopié — `null` pour 5 des 7 actions à effet, donc aucun outil
    // affiché après exécution malgré une prévisualisation qui le nommait.
    connectionUsed: run.preview?.connectionUsed ?? null,
    externalRef: step?.externalRef ?? null,
    creditsSpent: unmeasured ? null : step.creditsSpent,
    // #1931.17 — « afficher la prochaine étape ». L'écran savait déjà rendre
    // cette ligne et le contrat portait déjà le champ ; seul le SUCCÈS — le cas
    // le plus fréquent, et le seul où « et maintenant ? » se pose vraiment —
    // n'avait rien à y mettre. La phrase vient de la table des cartes, jamais
    // d'ici : deux endroits qui décident la même chose divergent.
    nextStep:
      run.status === 'failed'
        ? 'Réessayer.'
        : run.status === 'unknown'
          ? "Vérifier dans l'outil avant de relancer."
          : run.status === 'done'
            ? cardNextStepOnSuccess(run.definition_key)
            : null,
    // #1943.17 — un lien support n'apparaît QUE sur l'échec que la personne ne
    // peut pas diagnostiquer seule : `unknown` (timeout, cf. #1943.9). Un
    // `failed` ordinaire dit déjà pourquoi (`step.reason`/`outcomeText`), un
    // `blocked` dit qu'il n'y avait rien à exécuter — ni l'un ni l'autre ne
    // justifie de solliciter le support.
    supportSuggested: run.status === 'unknown',
    ...(content !== undefined ? { content: content.slice(0, 20_000) } : {}),
    ...(partialSucceededText ? { succeeded: partialSucceededText.slice(0, 1000) } : {}),
    ...(partialNotDoneText ? { notDone: partialNotDoneText.slice(0, 1000) } : {}),
  }
}
