import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Logger,
  NotFoundException,
  Optional,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  APPROVAL_TTL_MS,
  DEFAULT_APPROVAL_SETTINGS,
  availableCapabilitiesFrom,
  buildRunIntents,
  cancelCardRequestSchema,
  actionLevelFromPreferences,
  cardExpiresAt,
  confirmCardRequestSchema,
  copilotCardStateSchema,
  decideApprovalRequestSchema,
  assignApprovalRequestSchema,
  snoozeApprovalRequestSchema,
  lauraJobApproveRequestSchema,
  lauraJobGestureRequestSchema,
  type LauraJobView,
  modifyCardRequestSchema,
  MOTIONS_WITHOUT_OUTCOME_CONTRACT,
  WORKFLOW_OUTCOME_CATALOG,
  planWorkflowRequestSchema,
  rejectCardRequestSchema,
  retryCardRequestSchema,
  retryWorkflowRunRequestSchema,
  runCopilotPlanRequestSchema,
  snoozeCardRequestSchema,
  startWorkflowRequestSchema,
  type ActionIntent,
  type ActionRisk,
  type ApprovalSettings,
  type CancelCardRequest,
  type CopilotCardState,
  type ModifyCardRequest,
  type PlanLaunchMode,
  type RejectCardRequest,
  type RunTrace,
  type SnoozeCardRequest,
  type WorkflowActionPlan,
  type WorkflowDefinition,
  type WorkflowTarget,
  TASK_OPEN_STATUSES,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { CrmConnectionEntity } from '../../database/entities/crm-connection.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { returnedRows } from '../../database/returned-rows'
import { ZodValidationPipe } from 'nestjs-zod'
import { CurrentUser, type CurrentUserPayload } from '../../common/decorator/current-user.decorator'
import { WorkspaceRead } from '../../common/decorator/workspace-read.decorator'
import { JwtGuard } from '../auth/jwt.guard'
import { RequirePermission } from '../workspace/require-permission.decorator'
import { WorkspacePermissionGuard } from '../workspace/workspace-permission.guard'
import { ToolRegistryService } from '../tool-registry/tool-registry.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { cardDefinitionForKey } from './copilot-card-catalog'
import { CopilotCardService, type CardView, type PlanRunOutcome } from './copilot-card.service'
import { UserPreferenceEntity } from '../../database/entities/user-preference.entity'
import { LauraJobService } from './laura-job.service'
import {
  simulateAtActionLevel,
  simulationValidates,
  type ActionGesture,
  type ActionLevelSimulationReport,
} from './copilot-action-gate'
import {
  currentStepKeyOf,
  nextStepKeyOf,
  workflowRunCanRetry,
  WorkflowRunnerService,
  type RunContext,
  type RunPrincipal,
} from './workflow-runner.service'
import { WORKFLOW_CATALOG, findWorkflow } from './workflow-catalog'
import { buildRunTraces, emptyTrace, personDisplayName } from './run-trace'
import { NotificationsService } from '../notifications/notifications.service'

/**
 * L'Action OS côté HTTP.
 *
 * Quatre gestes pour les workflows : voir les workflows disponibles, PLANIFIER
 * (sans rien exécuter), lancer, et trancher une approbation. Le plan est un geste
 * à part entière : c'est lui qui rend la prévisualisation possible, et lui qu'un
 * écran appelle avant d'afficher un bouton d'approbation.
 *
 * #1931 L2 — six gestes pour les cartes de Laura (confirmer, refuser, reporter,
 * modifier, réessayer, annuler) et deux lectures (une carte, une liste filtrée
 * par état). Chaque route résout l'espace ACTIF de l'appelant ; aucune ne lit ni
 * n'écrit un run par son seul identifiant.
 *
 * Le contexte d'un run (les intents concrets par pas) est fixé AU LANCEMENT et
 * persisté avec lui : c'est ce que l'approbation relit (D2), jamais un corps de
 * requête. Le moteur ne devine jamais une cible : un pas sans intent est bloqué,
 * pas improvisé.
 */
/** #2400.5 — combien de runs récents nourrissent le dry run : assez pour un
 *  verdict qui ne tienne pas sur un seul geste, borné pour rester une lecture. */
const DRY_RUN_SAMPLE_SIZE = 50

@Controller('action-os')
// `WorkspacePermissionGuard` — #1931 L2 : les gestes de carte déclarent
// `records:write`. La garde est fail-open sur une route sans déclaration : les
// routes de workflow d'avant gardent exactement leur comportement.
@UseGuards(JwtGuard, WorkspacePermissionGuard)
export class ActionOsController {
  private readonly logger = new Logger(ActionOsController.name)

  constructor(
    private readonly runner: WorkflowRunnerService,
    private readonly workspaceContext: WorkspaceContextService,
    // Le registre d'outils, pour résoudre les capacités RÉELLEMENT branchées.
    //
    // Injecté dans le CONTRÔLEUR et non dans le runner : l'orchestration qui
    // traverse deux modules vit ici, c'est la sortie que GA-07 nomme elle-même
    // (le cliquet compte les imports service → service). La règle de décision,
    // elle, est pure et vit dans les contrats (`availableCapabilitiesFrom`).
    private readonly tools: ToolRegistryService,
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvals: Repository<ApprovalRequestEntity>,
    // La CIBLE d'un run : le nom du compte, le contact visé, le CRM branché.
    // Lus ici, au bord, parce que c'est le contrôleur qui connaît l'appelant —
    // et parce que la traduction « pas de workflow → intention » est une
    // fonction PURE des contrats, qui n'a besoin d'aucun service.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(CrmConnectionEntity)
    private readonly crmConnections: Repository<CrmConnectionEntity>,
    // #1498 — de quoi rendre LISIBLES les deux identifiants déjà en base :
    // `workflow_runs.user_id` et `action_approvals.decided_by`.
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    // #1931 L2 — ajouté EN FIN (les specs construisent ce contrôleur par position).
    private readonly cards: CopilotCardService,
    // #2276 tranche 2 — ajouté EN FIN, même raison.
    private readonly lauraJobs: LauraJobService,
    // #2896 / #2449.35 — ajouté EN FIN, même raison. Le sac de préférences où
    // vit le niveau d'action RÉGLÉ : lu ICI, au bord (GA-07 — aucun service de
    // plus), et posé sur le principal du clic. Sans `@Optional()` : absent du
    // module, l'application ne démarre pas — jamais une panne muette.
    @InjectRepository(UserPreferenceEntity)
    private readonly userPreferences?: Repository<UserPreferenceEntity>,
    // #2864 — reste du lot précédent : prévenir le collègue à qui une demande
    // est confiée. Même mécanique que `chat_action_assigned` (#1940.7,
    // `ia-proxy.controller.ts`) : `@Optional()`, injecté EN FIN. Contrairement
    // à l'assignation d'une carte de Laura, ce geste-ci reste BEST-EFFORT (voir
    // `notifyAssignee`) — la délégation a déjà eu lieu au moment de l'appel.
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /**
   * Ce que l'appelant a réellement en face : le compte, le contact, le CRM.
   *
   * ⚠️ Rien n'est DEVINÉ. Un contact non fourni reste absent — on ne prend pas
   * « le premier contact du compte », parce qu'écrire à quelqu'un que personne
   * n'a choisi est exactement l'accident que ce module existe pour empêcher. Les
   * pas qui en dépendaient resteront bloqués, et le diront.
   */
  private async resolveTarget(
    userId: string,
    body: { accountId?: string; contactId?: string },
    now: Date,
  ): Promise<WorkflowTarget> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = body.accountId
      ? await this.accounts.findOne({
          where: { id: body.accountId, workspace_id: workspaceId },
          select: ['id', 'company_name'],
        })
      : null
    // Le contact n'est retenu que s'il appartient à l'espace : un identifiant
    // venu du navigateur ne prouve rien.
    const contact = body.contactId
      ? await this.contacts.findOne({ where: { id: body.contactId, workspace_id: workspaceId }, select: ['id'] })
      : null
    const crm = await this.crmConnections
      .findOne({ where: { workspace_id: workspaceId }, select: ['provider'] })
      .catch(() => null)
    return {
      accountId: account?.id ?? null,
      accountName: account?.company_name ?? null,
      contactId: contact?.id ?? null,
      crmProvider: crm?.provider ?? null,
      now,
    }
  }

  /** Le catalogue, tel qu'il est versionné dans le code. */
  @Get('workflows')
  listWorkflows(): {
    workflows: WorkflowDefinition[]
    outcomes: typeof WORKFLOW_OUTCOME_CATALOG
    motionsWithoutContract: readonly string[]
  } {
    return {
      workflows: [...WORKFLOW_CATALOG],
      // Ce qu'un workflow peut PRODUIRE — ses issues, ses conditions d'arrêt,
      // et ce qu'un humain fait quand il n'aboutit pas. Le catalogue des PAS
      // existait ; celui des ISSUES manquait, et sans lui « 12 relances
      // lancées » ne dit rien de ce qu'elles ont donné.
      outcomes: WORKFLOW_OUTCOME_CATALOG,
      // Les deux motions du corpus qui n'ont AUCUN contrat d'issue. Les nommer
      // vaut mieux que leur en inventer un : une motion dont les issues sont
      // devinées produit des statistiques que personne ne peut relire.
      motionsWithoutContract: MOTIONS_WITHOUT_OUTCOME_CONTRACT,
    }
  }

  /**
   * Le plan, sans exécution.
   *
   * Aucun intent n'est fourni sur cette route : elle sert à montrer la FORME du
   * workflow (ses pas, leur coût, leur risque, le niveau exigé) sur une cible
   * donnée. Les pas apparaîtront donc « bloqués faute de cible » — c'est exact,
   * et c'est ce que l'écran doit dire tant que l'utilisateur n'a pas choisi.
   */
  @Post('plan')
  async plan(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(planWorkflowRequestSchema)) body: { definitionKey: string; accountId?: string },
  ): Promise<{ plan: WorkflowActionPlan }> {
    const definition = findWorkflow(body.definitionKey)
    if (!definition) return { plan: emptyPlan(body.definitionKey) }
    const target = await this.resolveTarget(user.userId, body, new Date())
    const context: RunContext = {
      ...(target.accountId ? { accountId: target.accountId } : {}),
      // ⚠️ Les intentions RÉELLES, et non `{}`. Avec un objet vide, le
      // planificateur bloquait TOUS les pas : la prévisualisation montrait donc
      // un workflow entièrement empêché, quelle que soit la cible choisie.
      intents: buildRunIntents(definition, target),
      targetLabel: target.accountName ?? body.accountId ?? 'cible à choisir',
      targetCount: 1,
      // Les capacités RÉELLES, pas celles que le workflow réclame.
      availableCapabilities: await this.capabilitiesOf(user.userId),
    }
    return { plan: this.runner.plan(definition, context, DEFAULT_APPROVAL_SETTINGS as ApprovalSettings) }
  }

  /**
   * #2400.5 — LE DRY RUN : ce que le niveau « automatiser » ferait des gestes
   * RÉELS de ce workflow, AVANT toute activation, sans en exécuter un seul.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * DES DONNÉES RÉELLES, JAMAIS INVENTÉES
   * ─────────────────────────────────────────────────────────────────────────
   * Les gestes rejoués sont les intents FIGÉS des derniers runs de CE workflow
   * pour CET espace (`workflow_runs.intents`, colonne posée par #1931 D2 — la
   * même que l'approbation relit, jamais un corps de requête). Aucune donnée
   * synthétique : un workflow encore jamais lancé rend une simulation VIDE, et
   * `simulationValidates` la refuse déjà (« une simulation vide ne valide
   * rien » — le « non mesuré » ne s'affiche jamais comme un succès).
   *
   * ─────────────────────────────────────────────────────────────────────────
   * PAS UN SECOND CHEMIN DE SIMULATION
   * ─────────────────────────────────────────────────────────────────────────
   * `simulateAtActionLevel` est la même porte PURE que `POST /actions/simulate`
   * (#2449.29) : simuler, c'est l'appeler. `backedByUserGesture: false` — une
   * simulation demandée avant activation ne doit jamais bénéficier du « clic
   * vaut accord » de qui la lance, sinon le rapport serait toujours vert.
   *
   * ⚠️ Sans mesure des six conditions d'« automatiser » (#2449.26-.31 —
   * capacité, policy d'espace, rôle, simulation, plafond, interrupteur ; aucun
   * écran ne les pose encore, GA-38/§Doctrine), la porte répond honnêtement
   * « pas prêt » pour tout geste qui ne sort pas déjà par
   * `never_reaches_a_person`. Ce n'est pas une limite de CE dry run : c'est
   * l'état réel du produit aujourd'hui, jamais un vert inventé.
   */
  @Get('workflows/:definitionKey/dry-run')
  // #2449.28/.32 — même gouvernance que `/actions/simulate` : c'est ce qu'on
  // fait AVANT d'activer une automatisation, réservé à qui pourrait l'activer.
  @RequirePermission('team:manage')
  async dryRunAutomation(
    @CurrentUser() user: CurrentUserPayload,
    @Param('definitionKey') definitionKey: string,
  ): Promise<ActionLevelSimulationReport> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const runs = await this.runs.find({
      where: { workspace_id: workspaceId, definition_key: definitionKey },
      order: { created_at: 'DESC' },
      take: DRY_RUN_SAMPLE_SIZE,
    })
    const gestures: ActionGesture[] = runs.flatMap(run =>
      Object.values(run.intents ?? {})
        .filter((intent): intent is ActionIntent => intent != null)
        .map(intent => ({ intentType: intent.type, targetCount: 1 })),
    )
    const simulation = simulateAtActionLevel({ level: 'automate', gestures, backedByUserGesture: false })
    return { ...simulation, validated: simulationValidates(simulation) }
  }

  /** Lance un run. Idempotent par `idempotencyKey` : deux clics = un run. */
  @Post('runs')
  // D1 (revue de sécurité, 13/09) — un run peut s'exécuter seul (automatique
  // borné) : lancer ÉCRIT. Le droit propre à chaque effet est vérifié en plus à
  // la porte du routeur (`INTENT_PERMISSION`).
  @RequirePermission('records:write')
  async start(
    @CurrentUser() user: CurrentUserPayload,
    @Body(new ZodValidationPipe(startWorkflowRequestSchema))
    body: { definitionKey: string; idempotencyKey: string; accountId?: string; contactId?: string },
  ): Promise<{ run: WorkflowRunEntity; plan: WorkflowActionPlan; reused: boolean }> {
    const definition = findWorkflow(body.definitionKey)
    const target = await this.resolveTarget(user.userId, body, new Date())
    return this.runner.start({
      principal: this.principalOf(user),
      definitionKey: body.definitionKey,
      idempotencyKey: body.idempotencyKey,
      context: {
        ...(target.accountId ? { accountId: target.accountId } : {}),
        ...(target.contactId ? { contactId: target.contactId } : {}),
        // ⚠️ C'était `{}` EN DUR, comme les capacités juste en dessous. Le
        // planificateur bloque tout pas sans intention : aucun run n'a JAMAIS
        // rien exécuté, et chacun s'enregistrait « terminé ». Les deux moitiés
        // de la fausse réussite sont maintenant branchées.
        intents: definition ? buildRunIntents(definition, target) : {},
        targetLabel: target.accountName ?? body.accountId ?? body.contactId ?? 'cible',
        targetCount: 1,
        availableCapabilities: await this.capabilitiesOf(user.userId),
      },
    })
  }

  /**
   * #2865 — Relance MANUELLE d'un run MULTI-PAS, à partir du pas en échec.
   * Distincte de `POST cards/:runId/retry` (une carte n'a qu'un pas) — voir
   * `WorkflowRunnerService.retryRun`, seule place qui décide si et où la
   * relance reprend (`canRetry`/`retryResumeStepKeyOf`, listés ci-dessous).
   */
  @Post('runs/:id/retry')
  // D1 — comme `start` : relancer peut exécuter un pas qui écrit.
  @RequirePermission('records:write')
  async retryRun(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(retryWorkflowRunRequestSchema)) _body: Record<string, never>,
  ): Promise<{ run: WorkflowRunEntity }> {
    return { run: await this.runner.retryRun(id, this.principalOf(user)) }
  }

  /**
   * Les capacités branchées de l'appelant.
   *
   * Une lecture qui échoue ne rend pas « tout disponible » : elle rend le seul
   * ensemble sûr — la notification in-app, que Bellum sert lui-même. Un repli
   * optimiste ferait tenter des envois vers des connecteurs qu'on n'a pas pu
   * vérifier, et c'est le sens inverse de tout ce module.
   */
  private async capabilitiesOf(userId: string): Promise<Set<string>> {
    try {
      return availableCapabilitiesFrom(await this.tools.list(userId))
    } catch (error) {
      this.logger.error('Capacités du workflow illisibles — repli sur la notification seule', { error })
      return new Set<string>(['notifications'])
    }
  }

  /** Les runs de l'espace, récents d'abord — l'alimentation de l'Action Center. */
  @Get('runs')
  async listRuns(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
  ): Promise<{
    runs: (WorkflowRunEntity & {
      trace: RunTrace
      currentStepKey: string | null
      canRetry: boolean
      nextAction: RunNextAction | null
    })[]
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const runs = await this.runs.find({
      where: { workspace_id: workspaceId, ...(status ? { status: status as WorkflowRunEntity['status'] } : {}) },
      order: { created_at: 'DESC' },
      take: 100,
    })
    // #1498 — la traçabilité voyage AVEC le run. La rendre par un second appel
    // ferait un écran qui affiche des lignes puis les complète : le lecteur y
    // verrait « déclenchée par personne » pendant une seconde, ce qui est faux.
    const traces = await this.tracesOf(runs)
    const nextActions = await this.nextActionsOf(runs)
    return {
      runs: runs.map(run => {
        // D7 — l'étape EN COURS d'un run qui tourne, dérivée des pas écrits au fil de l'eau.
        const definition = findWorkflow(run.definition_key) ?? cardDefinitionForKey(run.definition_key)
        // #2865 — le run OFFRE-T-IL une relance ? Seul un workflow MULTI-PAS
        // (`findWorkflow`, jamais une carte à un seul pas) la propose — la
        // MÊME lecture que `WorkflowRunnerService.retryRun` (GA-26).
        const workflowDefinition = findWorkflow(run.definition_key)
        return {
          ...run,
          trace: traces.get(run.id) ?? emptyTrace(run.trigger),
          currentStepKey: definition ? currentStepKeyOf(definition, run) : null,
          canRetry: workflowDefinition ? workflowRunCanRetry(workflowDefinition, run) : false,
          nextAction: (run.account_id ? nextActions.get(run.account_id) : null) ?? null,
        }
      }),
    }
  }

  /**
   * X37 / #3416 — la PROCHAINE ACTION d'un run : la tâche ouverte la plus proche
   * d'échéance du MÊME compte. Une seule lecture pour tous les comptes des runs
   * (jamais une par ligne) ; rien d'ouvert ⇒ pas d'entrée, donc `null` à l'écran.
   */
  private async nextActionsOf(runs: WorkflowRunEntity[]): Promise<Map<string, RunNextAction>> {
    const accountIds = [...new Set(runs.map(run => run.account_id).filter((id): id is string => Boolean(id)))]
    if (accountIds.length === 0) return new Map()
    const rows = returnedRows<{ account_id: string; title: string; due_on: string | Date | null }>(
      await this.runs.manager.query(
        `SELECT DISTINCT ON (account_id) account_id, title, due_on
           FROM tasks
          WHERE workspace_id = $1 AND account_id = ANY($2) AND status = ANY($3)
          ORDER BY account_id, due_on ASC NULLS LAST, created_at ASC`,
        [runs[0]?.workspace_id, accountIds, [...TASK_OPEN_STATUSES]],
      ),
    )
    const byAccount = new Map<string, RunNextAction>(
      rows.map(row => [
        row.account_id,
        {
          title: row.title,
          dueOn: row.due_on ? new Date(row.due_on).toISOString().slice(0, 10) : null,
        },
      ]),
    )
    // #3416 (recette prod 08→09/10 : carte Sanofi sans « Prochaine action ») — un compte sans
    // tâche ouverte garde pourtant la prochaine action que le commercial a ÉCRITE sur sa liste
    // cible. Donnée existante, jamais déduite ; une tâche ouverte l'emporte toujours ; rien
    // d'écrit nulle part ⇒ pas d'entrée, donc aucune ligne.
    const withoutTask = accountIds.filter(id => !byAccount.has(id))
    if (withoutTask.length === 0) return byAccount
    const written = returnedRows<{ account_id: string; next_action: string }>(
      await this.runs.manager.query(
        `SELECT DISTINCT ON (account_id) account_id, next_action
           FROM target_list_items
          WHERE workspace_id = $1 AND account_id = ANY($2) AND removed_at IS NULL
            AND btrim(coalesce(next_action, '')) <> ''
          ORDER BY account_id, updated_at DESC`,
        [runs[0]?.workspace_id, withoutTask],
      ),
    )
    for (const row of written)
      if (!byAccount.has(row.account_id)) byAccount.set(row.account_id, { title: row.next_action.trim(), dueOn: null })
    return byAccount
  }

  /**
   * QUI A DÉCLENCHÉ, QUI A VALIDÉ, DEPUIS QUEL OBJET — #1498.
   *
   * Trois lectures bornées pour cent runs au plus, jamais une par ligne : un
   * `N+1` sur cet écran se voit en production et pas en test, où les listes ont
   * trois éléments.
   *
   * ⚠️ La RÈGLE — quel nom va sur quelle ligne, et ce qui reste `null` — vit
   * dans `run-trace.ts`, pure et testée. Ici il ne reste que les lectures.
   */
  private async tracesOf(runs: WorkflowRunEntity[]): Promise<Map<string, RunTrace>> {
    if (runs.length === 0) return new Map()

    const runIds = runs.map(run => run.id)
    const workspaceIds = [...new Set(runs.map(run => run.workspace_id))]
    const accountIds = [...new Set(runs.map(run => run.account_id).filter((id): id is string => Boolean(id)))]

    const decided = await this.approvals.find({
      where: { run_id: In(runIds), state: In(['approved', 'rejected'] as ApprovalRequestEntity['state'][]) },
      order: { decided_at: 'DESC' },
    })

    const userIds = [
      ...new Set([
        ...runs.map(run => run.user_id),
        ...decided.map(approval => approval.decided_by).filter((id): id is string => Boolean(id)),
      ]),
    ]

    const [profiles, accounts] = await Promise.all([
      userIds.length > 0 ? this.profiles.find({ where: { user_id: In(userIds) } }) : Promise.resolve([]),
      // #1931 L2 — borné à l'espace des runs : une carte porte un `account_id`
      // venu d'une proposition, et un nom de compte ne se lit jamais hors espace.
      accountIds.length > 0
        ? this.accounts.find({ where: { id: In(accountIds), workspace_id: In(workspaceIds) } })
        : Promise.resolve([]),
    ])

    return buildRunTraces({ runs, approvals: decided, profiles, accounts })
  }

  /**
   * #3076 (épopée #2858) — LES CARTES DE LAURA ENCORE NON CLIQUÉES, mises en
   * forme comme une approbation en attente.
   *
   * Root cause : une carte gouvernée (#1931 L2 — `propose_opportunity_update`
   * comme les autres) est un run `workflow_runs` (`trigger: 'copilot_proposal'`,
   * `status: 'planned'`/`'snoozed'`) DÈS sa proposition
   * (`CopilotCardService.propose`), pour survivre au rechargement de `/chat` —
   * mais AUCUNE ligne `action_approvals` n'existe encore pour elle : celle-ci
   * n'est posée qu'au CLIC (`CopilotCardService.confirm`), et seulement si le
   * niveau exige un responsable (`n3`). `listApprovals` ne lisait QUE
   * `action_approvals` : une carte que personne n'a encore cliquée n'y
   * apparaissait donc JAMAIS — « À valider » restait à 0 pendant que la carte
   * survivait très bien dans `/chat`.
   *
   * Bornée à L'AUTEUR (R9, `copilot-card.service.ts` : seul l'auteur d'une
   * carte agit dessus, jamais un coéquipier) et à cent cartes au plus, la même
   * garde que `listApprovals` pose déjà sur `action_approvals`. Une carte déjà
   * EXPIRÉE (`cardExpiresAt`) ne rejoint pas la file : elle ne se valide plus,
   * la carte elle-même le dit déjà dans `/chat`.
   */
  private async unclickedCardApprovals(workspaceId: string, userId: string): Promise<ApprovalRequestEntity[]> {
    const now = new Date()
    const cardRuns = await this.runs.find({
      where: {
        workspace_id: workspaceId,
        user_id: userId,
        trigger: 'copilot_proposal',
        status: In(['planned', 'snoozed'] as WorkflowRunEntity['status'][]),
      },
      order: { created_at: 'DESC' },
      take: 100,
    })
    return cardRuns
      .filter(run => cardDefinitionForKey(run.definition_key) !== null)
      .filter(run => {
        const expiresAt = this.cardExpiresAtOf(run)
        return !expiresAt || expiresAt.getTime() > now.getTime()
      })
      .map(run => this.cardApprovalViewOf(run))
  }

  private cardExpiresAtOf(run: WorkflowRunEntity): Date | null {
    return cardExpiresAt({
      createdAt: run.created_at.toISOString(),
      snoozedUntil: run.snoozed_until ? run.snoozed_until.toISOString() : null,
    })
  }

  /** Une carte NON CLIQUÉE, dans la forme d'une `ApprovalRequestEntity` — même doctrine que `tracesOf` : `id`/`run_id` restent CEUX DU RUN, pour que trancher depuis /actions ou depuis la carte agisse sur la MÊME ligne (#3076). */
  private cardApprovalViewOf(run: WorkflowRunEntity): ApprovalRequestEntity {
    const definition = cardDefinitionForKey(run.definition_key)
    const summary = (run.preview?.whatWillHappen ?? definition?.steps[0]?.intent ?? 'Carte de Laura').slice(0, 2000)
    const expiresAt = this.cardExpiresAtOf(run) ?? new Date(run.created_at.getTime() + APPROVAL_TTL_MS)
    return {
      id: run.id,
      workspace_id: run.workspace_id,
      run_id: run.id,
      step_key: null,
      required_level: definition?.minimumLevel ?? 'n2_user_approval',
      state: 'pending',
      requested_by: run.user_id,
      decided_by: null,
      decided_at: null,
      summary,
      estimated_credits: run.estimated_credits,
      expires_at: expiresAt,
      reason: null,
      assigned_to: null,
      snoozed_until: run.snoozed_until ?? null,
      created_at: run.created_at,
    } as ApprovalRequestEntity
  }

  /** `error` est-il « demande introuvable » PARCE QUE `id` désigne une carte de l'appelant (jamais celle d'un autre) ? */
  private async ownCardRun(error: unknown, id: string, userId: string): Promise<WorkflowRunEntity | null> {
    if (!(error instanceof NotFoundException)) return null
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.runs.findOne({
      where: { id, workspace_id: workspaceId, user_id: userId, trigger: 'copilot_proposal' },
    })
  }

  /**
   * Les approbations en attente — l'onglet « À valider ».
   *
   * #2200.13 / #2200.14 / #2200.21 — QUI, DEPUIS QUOI, ET LA PROCHAINE ÉTAPE :
   * les trois voyageaient déjà avec le RUN (`trace`, `nextStepKey`, cf.
   * `runs()` ci-dessus) sans jamais rejoindre la carte d'approbation qui pointe
   * vers ce même run. Une lecture bornée à cent approbations au plus — jamais
   * une par ligne (même garde qu'à `tracesOf`).
   */
  @Get('approvals')
  async listApprovals(@CurrentUser() user: CurrentUserPayload): Promise<{
    approvals: (ApprovalRequestEntity & { trace: RunTrace; nextStepKey: string | null; risk: ActionRisk | null })[]
  }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
    const decided = await this.approvals.find({
      where: { workspace_id: workspaceId, state: 'pending' },
      order: { created_at: 'DESC' },
      take: 100,
    })
    const approvals = [...decided, ...(await this.unclickedCardApprovals(workspaceId, user.userId))]
    const runIds = [...new Set(approvals.map(approval => approval.run_id))]
    const runs = runIds.length > 0 ? await this.runs.find({ where: { id: In(runIds), workspace_id: workspaceId } }) : []
    const runById = new Map(runs.map(run => [run.id, run]))
    const traces = await this.tracesOf(runs)
    // #2864 — ce qu'on M'A CONFIÉ passe devant. Un tri STABLE, jamais un
    // filtre : la délégation change l'ORDRE, jamais le CONTENU (c76) — les
    // collègues voient toujours toute la file. #2856 — une demande reportée
    // reste servie avec sa date : c'est l'écran qui la range sous « Reportées ».
    const ordered = [...approvals].sort(
      (left, right) => Number(right.assigned_to === user.userId) - Number(left.assigned_to === user.userId),
    )
    return {
      approvals: ordered.map(approval => {
        const run = runById.get(approval.run_id)
        const definition = run ? (findWorkflow(run.definition_key) ?? cardDefinitionForKey(run.definition_key)) : null
        // #2200.39 (épopée #2867) — le risque de la PROCHAINE étape, jamais un
        // recalcul ni une moyenne : une approbation en attente n'a encore écrit
        // aucun pas, donc rien d'autre à relire honnêtement.
        const nextStepKey = run && definition ? nextStepKeyOf(definition, run) : null
        const risk =
          definition && nextStepKey ? (definition.steps.find(step => step.key === nextStepKey)?.risk ?? null) : null
        return {
          ...approval,
          trace: (run ? traces.get(run.id) : undefined) ?? emptyTrace(run?.trigger ?? 'manual'),
          nextStepKey,
          risk,
        }
      }),
    }
  }

  /**
   * Approuver ou refuser. Le refus libère les crédits réservés.
   *
   * D2 (#1931 L2) — ce contrôleur passait `context: { intents: {} }` : le runner
   * sautait tous les pas « faute de cible » et chaque approbation depuis l'Action
   * Center finissait `blocked`, sans qu'une seule action parte. Le runner relit
   * désormais les intents PERSISTÉS avec le run ; cette route n'en transmet aucun.
   */
  @Post('approvals/:id')
  // D1 — depuis L2, approuver EXÉCUTE les intents figés du run.
  @RequirePermission('records:write')
  async decide(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideApprovalRequestSchema)) body: { decision: 'approve' | 'reject'; reason?: string },
  ): Promise<{ run: WorkflowRunEntity }> {
    try {
      const run = await this.runner.decideApprovalRequest({
        approvalId: id,
        principal: this.principalOf(user),
        decision: body.decision,
        ...(body.reason ? { reason: body.reason } : {}),
      })
      return { run }
    } catch (error) {
      // #3076 (épopée #2858) — UNE SEULE FILE : `id` peut désigner une carte de
      // Laura NON CLIQUÉE (`listApprovals` ci-dessus la sert sous la même
      // forme, sans qu'`action_approvals` en porte de ligne — voir
      // `unclickedCardApprovals`). Trancher depuis /actions doit alors agir sur
      // le MÊME run que le clic Valider/Refuser de la carte, dans /chat :
      // même méthode (`CopilotCardService.confirm`/`reject`), même porte.
      const own = await this.ownCardRun(error, id, user.userId)
      if (!own) throw error
      if (body.decision === 'approve') await this.cards.confirm(id, await this.clickPrincipalOf(user))
      else await this.cards.reject(id, this.principalOf(user), body.reason)
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      const run = await this.runs.findOne({ where: { id, workspace_id: workspaceId } })
      if (!run) throw error
      return { run }
    }
  }

  /**
   * #2864 — CONFIER une demande à un collègue du MÊME espace (`null` = retirer).
   * L'appartenance et le droit de trancher du destinataire se vérifient dans le
   * moteur (`canAssign`) ; cette route ne transmet que l'identifiant validé.
   */
  @Post('approvals/:id/assign')
  @RequirePermission('records:write')
  async assignApproval(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignApprovalRequestSchema)) body: { assigneeId: string | null },
  ): Promise<{ approval: ApprovalRequestEntity }> {
    try {
      const approval = await this.runner.assignApprovalRequest({
        approvalId: id,
        principal: this.principalOf(user),
        assigneeId: body.assigneeId,
      })
      // #2864 — reste : `null` retire la délégation, personne à prévenir.
      if (body.assigneeId) await this.notifyAssignee(user.userId, body.assigneeId)
      return { approval }
    } catch (error) {
      // #3076 — reste : une carte de Laura est PERSONNELLE (R9,
      // `copilot-card.service.ts` : seul son auteur la clique). La file est
      // unique, mais confier ne s'y offre pas pour une carte — un refus
      // VISIBLE, jamais un échec muet (même doctrine que la liste ERP).
      if (await this.ownCardRun(error, id, user.userId)) {
        throw new ForbiddenException('Cette carte est personnelle : elle ne se confie pas à un collègue.')
      }
      throw error
    }
  }

  /**
   * #2864 — reste du lot précédent : le collègue à qui une demande vient
   * d'être confiée la voyait déjà passer en tête de sa file « À valider »
   * (#2864, `listApprovals` plus haut) SANS qu'aucun signal ne l'annonce.
   *
   * BEST-EFFORT, à la différence de `chat_action_assigned` (#1940.7,
   * `ia-proxy.controller.ts`) où « l'action EST la notification » et refuse
   * (503) sans le module : ici, la délégation a déjà réussi (écrite en base)
   * quand cette méthode est appelée. Un canal absent ou en échec ne doit pas
   * défaire une réattribution qui a fonctionné — même posture que
   * `notifyMentioned` (`ia-proxy.controller.ts`, #1940.1) pour une mention.
   */
  private async notifyAssignee(assignerId: string, assigneeId: string): Promise<void> {
    if (!this.notifications) return
    try {
      const assigner = await this.profiles.findOne({ where: { user_id: assignerId } })
      const assignerName = (assigner && personDisplayName(assigner)) || 'Un collègue'
      // #4158.56 — l'espace du geste et son auteur : la demande ne se lit plus dans tous les espaces.
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(assignerId)
      await this.notifications.createNotification(assigneeId, {
        workspaceId,
        actorUserId: assignerId,
        type: 'approval_assigned',
        title: `${assignerName} t'a confié une demande à valider`,
        link: '/actions',
      })
    } catch (error) {
      this.logger.warn('Délégation d’approbation : notification non envoyée (la délégation reste effective)', {
        error: { name: error instanceof Error ? error.name : typeof error },
        tags: { feature: 'approval_assigned' },
      })
    }
  }

  /**
   * #2856 — REPORTER une demande (une écriture CRM/ERP en attente) ; `null` la
   * réveille. Rien n'est décidé : la demande reste `pending` et passe par la porte.
   */
  @Post('approvals/:id/snooze')
  @RequirePermission('records:write')
  async snoozeApproval(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(snoozeApprovalRequestSchema)) body: { until: string | null },
  ): Promise<{ approval: ApprovalRequestEntity }> {
    try {
      const approval = await this.runner.snoozeApprovalRequest({
        approvalId: id,
        principal: this.principalOf(user),
        until: body.until === null ? null : new Date(body.until),
      })
      return { approval }
    } catch (error) {
      const own = await this.ownCardRun(error, id, user.userId)
      if (!own) throw error
      // #2856 — même geste que le « Reporter » de la carte (`/chat`) : `until`
      // daté reporte, `null` réveille. `CopilotCardService.snooze` porte les
      // deux sens, même stockage (`snoozed_until`), même contrôle d'accès.
      await this.cards.snooze(id, this.principalOf(user), body.until)
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(user.userId)
      const run = await this.runs.findOne({ where: { id, workspace_id: workspaceId } })
      if (!run) throw error
      return { approval: this.cardApprovalViewOf(run) }
    }
  }

  // ── Cartes de Laura (#1931 L2) ─────────────────────────────────────────────

  /**
   * Les cartes de l'espace. `states` (liste séparée par des virgules) filtre sur
   * l'ÉTAT calculé : l'écran Actions lit `CARD_STATES_IN_ACTIONS_CURRENT` puis
   * `CARD_STATES_IN_ACTIONS_HISTORY` (arbitrage du 12/09) ; la conversation lit
   * `conversationId` sans filtre d'état.
   */
  @Get('cards')
  // Lecture d'espace (fils partagés : un coéquipier voit les cartes). La seule
  // écriture possible ici est l'enregistrement idempotent d'une issue DÉJÀ
  // observée par la file (aucun effet neuf, aucun crédit) — voir `reconcile`.
  @WorkspaceRead()
  async listCards(
    @CurrentUser() user: CurrentUserPayload,
    @Query('states') states?: string,
    @Query('conversationId') conversationId?: string,
  ): Promise<{ cards: CardView[] }> {
    const parsed = states ? parseStates(states) : undefined
    if (conversationId !== undefined && (conversationId.length === 0 || conversationId.length > 200)) {
      throw new BadRequestException('conversationId invalide.')
    }
    return {
      cards: await this.cards.list(this.principalOf(user), {
        ...(parsed ? { states: parsed } : {}),
        ...(conversationId ? { conversationId } : {}),
      }),
    }
  }

  @Get('cards/:runId')
  @WorkspaceRead()
  async card(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.view(runId, this.principalOf(user)) }
  }

  /** Confirmer — le clic EST la décision ; deux onglets, un seul effet. */
  @Post('cards/:runId/confirm')
  // Un geste de carte ÉCRIT (l'Actions de l'équipe, et l'effet de la carte) :
  // `records:write`, que `viewer` n'a pas. Le droit PROPRE à l'effet (ex.
  // `contacts:enrich`) est vérifié en plus par `CopilotCardService`.
  @RequirePermission('records:write')
  async confirmCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(confirmCardRequestSchema)) _body: Record<string, never>,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.confirm(runId, await this.clickPrincipalOf(user)) }
  }

  /**
   * #1950.14 / #1950.18 — le geste de PLAN, sur les cartes d'un tour : « Lancer
   * tout le plan » (`all`) ou « Seulement la 1re étape » (`first`). Chaque étape
   * passe par `confirm` (même droit, même garde) : ce geste n'ouvre aucune porte
   * que le clic d'une carte n'ouvrait pas — il n'enchaîne que ce qui prépare ou
   * crée dans Bellum (`planNextLaunch`, contrat).
   */
  @Post('cards/plan/:turnId/run')
  @RequirePermission('records:write')
  async runCopilotPlan(
    @CurrentUser() user: CurrentUserPayload,
    @Param('turnId', ParseUUIDPipe) turnId: string,
    @Body(new ZodValidationPipe(runCopilotPlanRequestSchema)) body: { mode: PlanLaunchMode },
  ): Promise<PlanRunOutcome> {
    return this.cards.runPlan(turnId, await this.clickPrincipalOf(user), body.mode)
  }

  @Post('cards/:runId/reject')
  @RequirePermission('records:write')
  async rejectCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(rejectCardRequestSchema)) body: RejectCardRequest,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.reject(runId, this.principalOf(user), body.reason) }
  }

  @Post('cards/:runId/snooze')
  @RequirePermission('records:write')
  async snoozeCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(snoozeCardRequestSchema)) body: SnoozeCardRequest,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.snooze(runId, this.principalOf(user), body.until) }
  }

  @Post('cards/:runId/modify')
  @RequirePermission('records:write')
  async modifyCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(modifyCardRequestSchema)) body: ModifyCardRequest,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.modify(runId, this.principalOf(user), body.patch) }
  }

  /** Réessayer — seulement après un échec ; jamais après un résultat inconnu. */
  @Post('cards/:runId/retry')
  @RequirePermission('records:write')
  async retryCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(retryCardRequestSchema)) _body: Record<string, never>,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.retry(runId, this.principalOf(user)) }
  }

  @Post('cards/:runId/cancel')
  @RequirePermission('records:write')
  async cancelCard(
    @CurrentUser() user: CurrentUserPayload,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body(new ZodValidationPipe(cancelCardRequestSchema)) body: CancelCardRequest,
  ): Promise<{ card: CardView }> {
    return { card: await this.cards.cancel(runId, this.principalOf(user), body.reason) }
  }

  // ── #2276 tranche 2 — le job composite de Laura ─────────────────────────────
  // Chaque route est scopée à l'ESPACE et à la PERSONNE qui possède le job
  // (`LauraJobService.owned`) : le job d'un autre est introuvable (404).

  /** La fiche vivante d'un job : la carte la relit pendant qu'il tourne. */
  @Get('jobs/:id')
  // Une lecture — et plus étroite qu'une lecture d'espace : seul le propriétaire lit son job.
  @WorkspaceRead()
  async lauraJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ job: LauraJobView }> {
    return { job: await this.lauraJobs.view(id, this.principalOf(user)) }
  }

  /** Confirmer — réserve le coût maximum et met en file ; 402 si le solde ne le couvre pas. */
  @Post('jobs/:id/confirm')
  @RequirePermission('records:write')
  async confirmLauraJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lauraJobGestureRequestSchema)) _body: Record<string, never>,
  ): Promise<{ job: LauraJobView }> {
    return { job: await this.lauraJobs.confirm(id, this.principalOf(user)) }
  }

  /** Valider l'étape qui attend (écriture CRM, validation demandée) — la porte. */
  @Post('jobs/:id/approve')
  @RequirePermission('records:write')
  async approveLauraJobStep(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lauraJobApproveRequestSchema)) body: { stepKey: string },
  ): Promise<{ job: LauraJobView }> {
    return { job: await this.lauraJobs.approve(id, this.principalOf(user), body.stepKey) }
  }

  /** Reprendre un job partiel ou échoué — jamais un job `unknown`. */
  @Post('jobs/:id/resume')
  @RequirePermission('records:write')
  async resumeLauraJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lauraJobGestureRequestSchema)) _body: Record<string, never>,
  ): Promise<{ job: LauraJobView }> {
    return { job: await this.lauraJobs.resume(id, this.principalOf(user)) }
  }

  @Post('jobs/:id/cancel')
  @RequirePermission('records:write')
  async cancelLauraJob(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(lauraJobGestureRequestSchema)) _body: Record<string, never>,
  ): Promise<{ job: LauraJobView }> {
    return { job: await this.lauraJobs.cancel(id, this.principalOf(user)) }
  }

  /** Un geste HTTP authentifié est, par définition, un geste d'UTILISATEUR (D9). */
  private principalOf(user: CurrentUserPayload): RunPrincipal {
    return { userId: user.userId, email: user.email, origin: 'user' }
  }

  /**
   * #2896 / #2449.35 — le principal d'un CLIC sur une proposition de Laura :
   * celui de toujours, plus le niveau d'action RÉGLÉ par l'appelant, que la
   * porte du routeur (`actionLevelRefusal`) lit. Aucun réglage valide : aucun
   * mandat, la porte se tait et le chemin reste celui d'avant.
   */
  private async clickPrincipalOf(user: CurrentUserPayload): Promise<RunPrincipal> {
    const row = await this.userPreferences?.findOne({ where: { user_id: user.userId } })
    const actionLevel = actionLevelFromPreferences(row?.preferences ?? {})
    return { ...this.principalOf(user), ...(actionLevel ? { actionLevel } : {}) }
  }
}

/** `running,awaiting_review` → états validés ; un nom inconnu est une 400, jamais ignoré en silence. */
function parseStates(raw: string): CopilotCardState[] {
  const names = raw
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
  const parsed = names.map(name => copilotCardStateSchema.safeParse(name))
  if (names.length === 0 || parsed.some(result => !result.success)) {
    throw new BadRequestException('Filtre d’états invalide.')
  }
  return parsed.flatMap(result => (result.success ? [result.data] : []))
}

/** Un plan vide et honnête pour un workflow inconnu : rien d'exécutable, rien
 *  d'approuvable, et le dire plutôt que renvoyer une erreur opaque à un écran. */
function emptyPlan(definitionKey: string): WorkflowActionPlan {
  return {
    definitionKey,
    definitionVersion: 0,
    executableNow: [],
    approvalRequired: [],
    blocked: [],
    estimatedCredits: 0,
    requiredLevel: 'n0_advice',
  }
}

/** X37 / #3416 — la prochaine action d'un run, tirée des tâches ouvertes du compte. */
type RunNextAction = { title: string; dueOn: string | null }
