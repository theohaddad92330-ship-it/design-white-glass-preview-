import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type {
  ActionDispatchArtifact,
  ActionIntent,
  ActionOutcome,
  ApprovalSettings,
  WorkflowActionPlan,
  WorkflowBlockedStep,
  WorkflowDefinition,
  WorkflowPlannedStep,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowStep,
  WorkspaceRole,
} from '@bellum/contracts'
import { ApprovalRequestEntity } from '../../database/entities/approval-request.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { ActionRouterService, DEBIT_NOT_REPORTED, type ActionPrincipal } from '../action-router/action-router.service'
import { INTENT_PERMISSION } from '../action-router/intent-permission'
// #1952.29 — le NOM de l'événement vient du registre qui le filtre. Import de
// constantes pures : aucun service, aucune dépendance de module (règle n°7).
import { LAURA_JOB_COMPLETED_EVENT } from '../integrations/integration-providers'
// #2276.62 — le lien de retour vers UN fil précis, à l'endroit où il vit déjà
// (#1940.1/#1940.7). Fonction pure : même note que l'import ci-dessus.
import { chatNotificationLink } from '../ia-proxy/chat-notification-link'
// #2946/#2105.9 — le pont Action OS → Tâche : `TasksModule` est déjà importé
// par `ActionOsModule` (pour `CanonicalActionsController`), sans cycle
// (`TasksModule` n'importe que `PlanFeaturesModule`/`WorkspaceModule`/
// `ActivitiesModule`, aucun n'atteint `ActionOsModule`).
import { TasksService } from '../tasks/tasks.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  canAssign,
  canDecide,
  canSnooze,
  decideApproval,
  demandsAHuman,
  resolveSettings,
  type ApprovalDecision,
} from './approval-policy'
import { cardDefinitionForKey } from './copilot-card-catalog'
import { CreditReservationService } from './credit-reservation.service'
import { JOB_RETURN_NOTIFIER, type JobReturnNotifier } from './job-return-notifier.port'
import { LONG_JOB_NOTIFIER, type LongJobNotifier } from './long-job-notifier.port'
import { findWorkflow } from './workflow-catalog'

/**
 * Le moteur d'exécution gouvernée (addendum final p22, p29-32).
 *
 * Il tient la boucle complète : déclencheur → contexte → plan → approbation →
 * exécution → résultat → mémoire. Ce qu'il n'est PAS, c'est un second
 * orchestrateur : il ne réimplémente aucune capacité, il compose celles du
 * routeur d'actions, et il s'appuie sur l'infrastructure déjà là (le journal
 * `user_actions`, les identifiants de corrélation).
 *
 * Trois propriétés le distinguent d'une simple boucle « pour chaque pas,
 * appeler » :
 *
 *  - **Il planifie avant d'agir.** Le plan est produit et rendu en trois listes
 *    (exécutable, à approuver, bloqué) — l'utilisateur voit tout avant que quoi
 *    que ce soit ne parte.
 *  - **Il n'exécute pas ce qui n'a pas été approuvé.** Le niveau exigé est
 *    calculé par une politique pure, et l'absence d'approbation ne fait pas
 *    échouer le run : elle le met en attente, ce qui est un état différent.
 *  - **Il ne rejoue pas ce qu'il ne comprend pas.** Un `unknown` (timeout) n'est
 *    ni un succès ni un échec ; il stoppe la reprise automatique du pas, parce
 *    que rejouer un envoi peut-être déjà parti est pire que de ne rien faire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES CRÉDITS — #1931 L2, les sept invariants (simulation :
 * `credit-invariants.simulation.spec.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 *  I2 — ce moteur ne DÉBITE jamais. Il réserve et solde (`CreditReservationService`,
 *       qui ne touche pas le ledger) ; le débit reste chez le service métier.
 *  I3 — une réservation ne survit JAMAIS au débit qu'elle annonçait : elle est
 *       soldée pas par pas, dès que le débit (ou son absence) est observé — et
 *       plus seulement en fin de run, ce qui comptait le crédit deux fois pendant
 *       tous les pas suivants.
 *  I4 — « dépensé » = `creditsDebited` rapporté par le routeur, jamais
 *       l'estimation du pas (D3).
 *  I6 — en démo, aucune réservation (D5).
 */

/** Durée de validité d'une demande d'approbation. Au-delà, le contexte qui l'a
 *  motivée n'est plus le même : on préfère la refaire que l'accorder à l'aveugle. */
import { APPROVAL_TTL_MS, can, hasPermission, localDayKey } from '@bellum/contracts' // #1931 — constante unique (GA-26), déménagée dans les contrats

/** #1943.4 — l'auteur d'une demande tranchée n'est plus là pour qu'elle parte en son nom. */
const AUTHOR_UNAVAILABLE_REASON =
  "L'auteur de cette carte n'est plus actif dans cet espace : rien n'est parti. Elle se refait depuis la conversation."
/** #1943.4 — l'auteur a perdu le droit propre à l'effet depuis qu'il l'a préparée. */
const AUTHOR_LACKS_PERMISSION_REASON = "L'auteur de cette carte n'a plus le droit de cette action : rien n'est parti."

/**
 * #2865 — les statuts d'un run MULTI-PAS qui appellent une relance manuelle :
 * `failed` (échoué), `partial` et `unknown` (interrompu — une partie est
 * passée, ou le premier pas tenté a fini `unknown`).
 *
 * ⚠️ `blocked` et `cancelled` en sont volontairement EXCLUS, même si aucun pas
 * n'a réussi : un `blocked` n'a JAMAIS rien exécuté (capacité manquante, cible
 * non résolue) — le geste qu'il appelle est de brancher un outil, pas de
 * rejouer (voir `start`, plus haut) ; un `cancelled` est un refus humain, qui
 * ne se relance pas de lui-même.
 */
const RETRYABLE_RUN_STATUSES = new Set<WorkflowRunStatus>(['failed', 'partial', 'unknown'])

/**
 * Le principal d'un run, RENOMMÉ ici pour les fichiers du module.
 *
 * GA-07 compte aussi les `import type` : un fichier neuf d'Action OS qui irait
 * chercher `ActionPrincipal` dans `../action-router/action-router.service`
 * ajouterait un import ET un fichier au cliquet (au plafond, 254/124). Ce
 * fichier l'importe déjà ; les autres le reprennent d'ici.
 */
export type RunPrincipal = ActionPrincipal

/**
 * `creditsSpent` d'un pas est un entier (schéma `workflowRunStepSchema`) : il ne
 * sait pas dire « non mesuré ». Quand la recherche n'a pas rapporté son débit,
 * le pas porte 0 ET cette raison (écrite par le routeur) — que la carte relit
 * pour afficher `null`, jamais 0. Renommée ici pour les fichiers du module
 * (même raison GA-07 que {@link RunPrincipal}).
 */
export const DEBIT_NOT_REPORTED_REASON = DEBIT_NOT_REPORTED

/** Ce qu'il faut pour planifier : la cible et les intents concrets à exécuter. */
export type RunContext = {
  accountId?: string
  contactId?: string
  /** Un intent CONCRET par pas, préparé par l'appelant (copilote, cron, écran). */
  intents: Partial<Record<string, ActionIntent>>
  /** Libellé lisible de la cible, pour la prévisualisation. */
  targetLabel: string
  /** Nombre de cibles réellement touchées — pilote le seuil de volume. */
  targetCount: number
  /** Capacités connectées de l'espace (`crm`, `email`, `calendar`…). */
  availableCapabilities: ReadonlySet<string>
}

@Injectable()
export class WorkflowRunnerService {
  private readonly logger = new Logger(WorkflowRunnerService.name)

  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(ApprovalRequestEntity)
    private readonly approvals: Repository<ApprovalRequestEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    private readonly router: ActionRouterService,
    private readonly reservations: CreditReservationService,
    private readonly workspaceContext: WorkspaceContextService,
    /**
     * #1952.29 — l'accusé de fin vers les canaux DÉJÀ branchés (tranché Louis
     * 16/09/2026). `@Optional` parce que ce moteur se construit à la main dans
     * une douzaine de tests d'exécution : absent, il ne s'annonce nulle part et
     * rien d'autre ne change. Le câblage réel vit dans `action-os.module.ts`.
     */
    @Optional()
    @Inject(LONG_JOB_NOTIFIER)
    private readonly longJobNotifier?: LongJobNotifier,
    /**
     * #2276.62 — le retour dans Laura, par la cloche existante. Même
     * discipline `@Optional` que `longJobNotifier` juste au-dessus : absent,
     * rien ne s'annonce à la cloche et rien d'autre ne change. Le câblage
     * réel vit dans `action-os.module.ts`.
     */
    @Optional()
    @Inject(JOB_RETURN_NOTIFIER)
    private readonly jobReturnNotifier?: JobReturnNotifier,
    /**
     * #2946/#2105.9 — le pont Action OS → Tâche : une demande d'approbation
     * pose AUSSI une tâche `relatedActionRunId`, pour apparaître dans le brief
     * du jour. `@Optional` même discipline que les deux notificateurs
     * ci-dessus : absent (construction à la main dans les specs), aucune
     * tâche ne se crée et rien d'autre ne change.
     */
    @Optional()
    private readonly tasksService?: TasksService,
  ) {}

  /**
   * Produit le plan SANS rien exécuter — la « prévisualisation » du rapport.
   *
   * Un pas atterrit dans `blocked` dès que sa capacité manque ou que l'appelant
   * n'a pas fourni d'intent concret. C'est volontairement strict : un pas qu'on
   * ne sait pas exécuter ne doit pas figurer dans « exécutable maintenant » en
   * espérant que ça passe.
   */
  plan(definition: WorkflowDefinition, context: RunContext, settings: ApprovalSettings): WorkflowActionPlan {
    const executableNow: WorkflowPlannedStep[] = []
    const approvalRequired: WorkflowPlannedStep[] = []
    const blocked: WorkflowBlockedStep[] = []

    for (const step of definition.steps) {
      const planned: WorkflowPlannedStep = {
        step,
        target: context.targetLabel,
        rationale: step.intent,
      }
      if (!context.availableCapabilities.has(step.capability)) {
        blocked.push({ ...planned, missing: `Capacité « ${step.capability} » non connectée.` })
        continue
      }
      if (!context.intents[step.key]) {
        blocked.push({ ...planned, missing: 'Aucune cible résolue pour ce pas.' })
        continue
      }
      approvalRequired.push(planned)
    }

    // Le coût annoncé ne compte QUE ce qui peut réellement partir : additionner
    // un pas bloqué gonflerait le devis d'une dépense qui n'aura pas lieu.
    const runnable = [...executableNow, ...approvalRequired].map(p => p.step)
    const estimatedCredits = runnable.reduce((sum, step) => sum + step.estimatedCredits, 0)
    const decision = this.decide(definition, runnable, context, estimatedCredits, settings)

    // Sous le niveau d'approbation, un pas part sans demander : on les bascule
    // alors dans la liste « exécutable maintenant ».
    //
    // ⚠️ La question « ce niveau exige-t-il quelqu'un ? » ne se réécrit PAS ici.
    // Elle s'écrivait `=== 'n4_bounded_auto' || === 'n5_extended_auto'`, ce qui
    // est la même règle que celle de la politique, recopiée — et le jour où la
    // politique a changé d'ordre, cette copie serait restée sur l'ancien.
    if (!demandsAHuman(decision.requiredLevel)) {
      executableNow.push(...approvalRequired.splice(0, approvalRequired.length))
    }

    return {
      definitionKey: definition.key,
      definitionVersion: definition.version,
      executableNow,
      approvalRequired,
      blocked,
      estimatedCredits,
      requiredLevel: decision.requiredLevel,
    }
  }

  private decide(
    definition: WorkflowDefinition,
    steps: WorkflowStep[],
    context: RunContext,
    estimatedCredits: number,
    settings: ApprovalSettings,
  ): ApprovalDecision {
    return decideApproval({
      steps,
      workflowMinimum: definition.minimumLevel,
      targetCount: context.targetCount,
      estimatedCredits,
      settings,
    })
  }

  /**
   * Crée le run et, selon le niveau exigé, l'exécute ou le met en attente.
   *
   * L'idempotence est portée par un index unique en base, pas par une
   * vérification applicative : deux requêtes simultanées passeraient toutes deux
   * un `SELECT` avant que l'une n'ait inséré. On tente donc l'insertion et on
   * rattrape le conflit — c'est la seule façon d'être correct sous concurrence.
   */
  async start(input: {
    principal: ActionPrincipal
    definitionKey: string
    idempotencyKey: string
    context: RunContext
  }): Promise<{ run: WorkflowRunEntity; plan: WorkflowActionPlan; reused: boolean }> {
    const definition = findWorkflow(input.definitionKey)
    if (!definition) throw new NotFoundException(`Workflow inconnu : ${input.definitionKey}`)
    if (!definition.enabled) throw new BadRequestException('Ce workflow est désactivé.')

    const { workspaceId, workspace } = await this.resolveWorkspace(input.principal.userId)
    const settings = resolveSettings(workspace)
    const plan = this.plan(definition, input.context, settings)
    // D2 (revue de sécurité, 13/09) — seuls les pas qui PEUVENT partir (exécutables
    // maintenant ou à approuver) gardent leur intent. Le résumé approuvé ne liste
    // qu'eux ; figer aussi ceux d'un pas BLOQUÉ (capacité non connectée) le faisait
    // partir après l'approbation sans jamais avoir été montré.
    const runnableKeys = new Set([...plan.executableNow, ...plan.approvalRequired].map(planned => planned.step.key))
    const runnableIntents = Object.fromEntries(
      Object.entries(input.context.intents).filter(([key]) => runnableKeys.has(key)),
    )
    const frozen = { ...input, context: { ...input.context, intents: runnableIntents } }

    const existing = await this.runs.findOne({
      where: { workspace_id: workspaceId, idempotency_key: input.idempotencyKey },
    })
    if (existing) return { run: existing, plan, reused: true }

    const run = await this.insertRun({ workspaceId, definition, plan, input: frozen })
    if (run.reused) return { run: run.entity, plan, reused: true }

    if (plan.approvalRequired.length > 0) {
      await this.requestApproval(run.entity, plan, settings)
      return { run: run.entity, plan, reused: false }
    }
    if (plan.executableNow.length === 0) {
      // Rien d'exécutable : le run s'arrête d'emblée, et son statut le dit —
      // `blocked`, pas `done`. Le commentaire d'origine avait la bonne intention
      // (« le marquer done laisserait croire qu'il a agi ») et écrivait quand
      // même `done`, faute d'un statut pour « rien n'est parti ». Le geste que
      // ça appelle est de brancher un outil, jamais de rejouer.
      await this.runs.update(run.entity.id, { status: 'blocked', finished_at: new Date() })
      return { run: { ...run.entity, status: 'blocked' }, plan, reused: false }
    }
    const executed = await this.execute(run.entity, definition, runnableIntents, input.principal, { attempt: 1 })
    return { run: executed.run, plan, reused: false }
  }

  /** Insère le run en rattrapant le conflit d'idempotence (course entre deux clics). */
  private async insertRun(args: {
    workspaceId: string
    definition: WorkflowDefinition
    plan: WorkflowActionPlan
    input: { principal: ActionPrincipal; idempotencyKey: string; context: RunContext }
  }): Promise<{ entity: WorkflowRunEntity; reused: boolean }> {
    const { workspaceId, definition, plan, input } = args
    const seed = this.runs.create({
      workspace_id: workspaceId,
      user_id: input.principal.userId,
      definition_key: definition.key,
      definition_version: definition.version,
      trigger: definition.trigger,
      status: plan.approvalRequired.length > 0 ? 'awaiting_approval' : 'planned',
      account_id: input.context.accountId ?? null,
      contact_id: input.context.contactId ?? null,
      correlation_id: `wf_${definition.key}_${input.idempotencyKey}`.slice(0, 64),
      idempotency_key: input.idempotencyKey,
      steps: [],
      estimated_credits: plan.estimatedCredits,
      spent_credits: 0,
      started_at: null,
      finished_at: null,
      // D2 — les intents sont FIGÉS avec le run, au moment où la demande est
      // montrée. C'est d'ici, et d'ici seulement, que l'approbation les relira :
      // jamais du corps de la requête qui approuve.
      intents: input.context.intents,
    })
    try {
      return { entity: await this.runs.save(seed), reused: false }
    } catch (error) {
      const conflict = await this.runs.findOne({
        where: { workspace_id: workspaceId, idempotency_key: input.idempotencyKey },
      })
      if (conflict) return { entity: conflict, reused: true }
      throw error
    }
  }

  /** Ouvre la demande d'approbation qui gèle le run jusqu'à décision humaine. */
  private async requestApproval(
    run: WorkflowRunEntity,
    plan: WorkflowActionPlan,
    settings: ApprovalSettings,
  ): Promise<ApprovalRequestEntity> {
    void settings
    // Le résumé est FIGÉ ici : le recalculer à l'affichage ferait approuver
    // autre chose que ce qui a été montré (le dossier bouge entre-temps).
    const summary = plan.approvalRequired
      .map(planned => `${planned.step.intent} — ${planned.target}`)
      .join('\n')
      .slice(0, 2000)
    const approval = await this.approvals.save(
      this.approvals.create({
        workspace_id: run.workspace_id,
        run_id: run.id,
        step_key: null,
        required_level: plan.requiredLevel,
        state: 'pending',
        requested_by: run.user_id,
        decided_by: null,
        decided_at: null,
        summary,
        estimated_credits: plan.estimatedCredits,
        expires_at: new Date(Date.now() + APPROVAL_TTL_MS),
        reason: null,
        // #2864 / #2856 — ni déléguée ni reportée à sa naissance.
        assigned_to: null,
        snoozed_until: null,
      }),
    )
    await this.createApprovalTasks(run, plan, summary)
    return approval
  }

  /**
   * #2946/#2105.9 — LE PONT ACTION OS → TÂCHE.
   *
   * Une demande d'approbation n'existait QUE dans le centre d'approbation
   * Action OS (`ApprovalRequestEntity`) — invisible du brief du jour et de la
   * liste de tâches, alors que `Task.relatedActionRunId` avait déjà sa colonne
   * (migration `TaskRelatedActionRun1796321319913`) et son discriminant
   * (`resolveTaskType` classe toute tâche liée à un run en `validation`),
   * jamais produits faute d'appelant.
   *
   * On RÉUTILISE l'objet TÂCHE (GA-26) exactement comme
   * `TasksService.requestManagerValidation` : le décideur suit `canDecide`
   * (`approval-policy.ts`) — sous `n3_manager_approval`, l'auteur du run
   * décide seul (tâche posée sur lui-même) ; à `n3`, chaque responsable
   * d'équipe (`team:manage`) hors l'auteur reçoit sa propre tâche. La tâche ne
   * duplique pas la décision : elle pointe vers le MÊME run et se contente de
   * la rendre visible ; décider reste un geste sur l'approbation elle-même
   * (`decideApprovalRequest`).
   */
  private async createApprovalTasks(run: WorkflowRunEntity, plan: WorkflowActionPlan, summary: string): Promise<void> {
    if (!this.tasksService) return
    const title = `Valider : ${summary.split('\n')[0] ?? run.definition_key}`.slice(0, 300)
    const taskInput = {
      title,
      dueOn: localDayKey(new Date()),
      priority: 'normal' as const,
      expectedResult: 'Décision : approuver ou refuser cette exécution.',
      // #2395.8 (épopée #2871) — même fait que `expectedResult` : cette
      // tâche N'A qu'un seul but, se décider sur le run.
      objective: 'Approuver ou refuser l’exécution proposée.',
    }
    if (plan.requiredLevel !== 'n3_manager_approval') {
      await this.tasksService.create(run.user_id, { ...taskInput, ownerId: run.user_id }, 'action_os_approval', run.id)
      return
    }
    const members = await this.workspaceContext.listMembers(run.user_id)
    const managers = members.filter(
      member => member.userId !== run.user_id && hasPermission(member.role, 'team:manage'),
    )
    for (const manager of managers) {
      await this.tasksService.create(
        run.user_id,
        { ...taskInput, ownerId: manager.userId },
        'action_os_approval',
        run.id,
      )
    }
  }

  /**
   * Tranche une demande d'approbation. Un `approve` déclenche l'exécution ; un
   * `reject` clôt le run en `cancelled` et libère les crédits réservés.
   *
   * D2 (#1931 L2) — il n'y a PLUS de `context` dans cette signature. Le
   * contrôleur passait `intents: {}` : tous les pas étaient sautés « faute de
   * cible » et le run approuvé finissait `blocked`, sans qu'une seule action
   * parte. Les intents viennent désormais du run PERSISTÉ (colonne `intents`) —
   * donc de ce qui a été montré au moment de la demande, et d'aucun corps de
   * requête qu'un appelant pourrait composer.
   */
  /**
   * Le run d'une demande, relu tel qu'il est. #1959.12 — c'est ce qu'on rend à
   * qui arrive après la décision de quelqu'un d'autre : l'état RÉEL, jamais un
   * état supposé ni une erreur. Introuvable reste introuvable.
   */
  private async runOf(runId: string, workspaceId: string): Promise<WorkflowRunEntity> {
    const run = await this.runs.findOne({ where: { id: runId, workspace_id: workspaceId } })
    if (!run) throw new NotFoundException('Exécution introuvable.')
    return run
  }

  async decideApprovalRequest(input: {
    approvalId: string
    principal: ActionPrincipal
    decision: 'approve' | 'reject'
    reason?: string
  }): Promise<WorkflowRunEntity> {
    const { workspaceId, role } = await this.resolveWorkspace(input.principal.userId)
    const approval = await this.approvals.findOne({
      where: { id: input.approvalId, workspace_id: workspaceId },
    })
    if (!approval) throw new NotFoundException('Demande introuvable.')
    // #1959.12 — LE SECOND VALIDATEUR VOIT LE RÉSULTAT, PAS UNE ERREUR.
    //
    // Deux responsables ouvrent la même demande ; le premier valide, le second
    // clique une seconde plus tard. Il recevait `400 Demande déjà « approved »`
    // — un message d'échec pour une action qui a RÉUSSI, sans aucune trace de
    // ce qui s'est passé. Rien ne se réexécute (l'invariant D3 tient : on ne
    // touche ni `approvals` ni `runs`), mais ce qui a eu lieu se LIT.
    //
    // ⚠️ `expired` reste une erreur : une demande expirée n'a été tranchée par
    // PERSONNE, et rendre le run ferait lire « rien ne s'est passé » sans dire
    // pourquoi ni quoi faire. Elle garde son message plus bas.
    if (approval.state === 'approved' || approval.state === 'rejected') {
      return this.runOf(approval.run_id, workspaceId)
    }
    if (approval.state !== 'pending') throw new BadRequestException(`Demande déjà « ${approval.state} ».`)
    if (approval.expires_at.getTime() < Date.now()) {
      await this.approvals.update(approval.id, { state: 'expired', decided_at: new Date() })
      throw new BadRequestException('Demande expirée — relancez le workflow.')
    }

    const verdict = canDecide({
      requiredLevel: approval.required_level,
      deciderRole: role,
      deciderId: input.principal.userId,
      requesterId: approval.requested_by,
      // #2864 — le collègue à qui la demande a été confiée tranche un clic simple.
      assigneeId: approval.assigned_to ?? null,
    })
    if (!verdict.allowed) throw new ForbiddenException(verdict.reason)

    const run = await this.runs.findOne({ where: { id: approval.run_id, workspace_id: workspaceId } })
    if (!run) throw new NotFoundException('Exécution introuvable.')

    // D2 — une demande créée AVANT que les intents ne soient persistés n'a rien
    // à exécuter. On ne les reconstruit pas : ce serait exécuter autre chose que
    // ce qui a été montré (la date de relance, le CRM branché auront bougé). La
    // demande reste EN ATTENTE — elle se refuse, ou expire d'elle-même (≤ 3 j).
    if (input.decision === 'approve' && !run.intents) {
      throw new BadRequestException(
        "Cette demande date d'avant l'enregistrement de ses actions : elle ne peut pas être exécutée telle quelle. Refusez-la, puis relancez le workflow.",
      )
    }

    // D3 (revue de sécurité, 13/09) — la demande se RÉCLAME : lue `pending` plus haut,
    // elle a pu être tranchée depuis (seconde validation, auteur qui annule sa carte).
    // Seule la réclamation qui touche une ligne décide ; l'autre ne relance rien.
    const claimed = await this.approvals.update(
      { id: approval.id, workspace_id: workspaceId, state: 'pending' },
      {
        state: input.decision === 'approve' ? 'approved' : 'rejected',
        decided_by: input.principal.userId,
        decided_at: new Date(),
        reason: input.reason ?? null,
      },
    )
    // #1959.12 — la course perdue est le MÊME cas qu'au-dessus, vu une
    // milliseconde plus tard : l'autre a tranché, rien ne se relance ici, et
    // celui qui a perdu lit le run réel plutôt qu'un 400.
    if (!claimed.affected) return this.runOf(approval.run_id, workspaceId)

    if (input.decision === 'reject') {
      await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
      await this.runs.update(run.id, { status: 'cancelled', finished_at: new Date() })
      return { ...run, status: 'cancelled' }
    }

    const definition = findWorkflow(run.definition_key) ?? cardDefinitionForKey(run.definition_key)
    if (!definition) throw new NotFoundException(`Workflow inconnu : ${run.definition_key}`)
    // D3 — le run se réclame aussi (`awaiting_approval → running`) : un auteur qui a
    // annulé pendant la validation l'a sorti de l'attente, et rien ne doit partir.
    const runClaimed = await this.runs.update(
      { id: run.id, workspace_id: workspaceId, status: 'awaiting_approval' },
      { status: 'running', started_at: run.started_at ?? new Date() },
    )
    if (!runClaimed.affected) {
      this.logger.warn('Demande validée sur un run qui n’attend plus — rien ne part', {
        tags: { 'action_os.run': run.id },
      })
      return (await this.runs.findOne({ where: { id: run.id, workspace_id: workspaceId } })) ?? run
    }
    // #1943.4 — décision de Louis du 13/09 : ce qu'un responsable valide
    // s'exécute au nom de son AUTEUR (le responsable reste tracé : `decided_by`).
    // Exécuter avec `input.principal` faisait porter au responsable le contrôle
    // de propriété du routeur, le débit et l'écriture dans l'outil connecté.
    const executor = await this.executorFor(run, definition, input.principal)
    if ('blockedReason' in executor) {
      const steps = definition.steps.map(step => emptyResult(step, 'skipped', executor.blockedReason))
      const finishedAt = new Date()
      await this.runs.update(run.id, { status: 'blocked', steps, finished_at: finishedAt })
      this.logger.warn('Demande approuvée sans exécution : auteur indisponible', {
        tags: { 'action_os.run': run.id },
      })
      return { ...run, status: 'blocked', steps, finished_at: finishedAt }
    }
    return (await this.execute(run, definition, run.intents ?? {}, executor.principal, { attempt: 1 })).run
  }

  /**
   * #1943.4 — QUI exécute une demande tranchée : son AUTEUR, jamais le décideur.
   *
   * L'auteur qui tranche lui-même (`n2`) garde son principal tel quel. Sinon, les
   * contrôles s'évaluent sur l'AUTEUR, au moment de la décision :
   *  - il est encore membre ACTIF de l'espace du run — le routeur résout l'espace
   *    par l'espace actif du principal : un auteur parti, ou actif ailleurs,
   *    ferait écrire dans le mauvais espace. Rien ne part, et le run le dit ;
   *  - il détient encore le droit PROPRE à chaque pas qui va partir.
   * Un auteur indisponible n'est jamais remplacé par le décideur.
   *
   * `email` vide : le runner ne connaît pas l'adresse de l'auteur, et n'en invente
   * pas — la seule lecture est la réponse-à d'un envoi, facultative.
   */
  private async executorFor(
    run: WorkflowRunEntity,
    definition: WorkflowDefinition,
    decider: ActionPrincipal,
  ): Promise<{ principal: ActionPrincipal } | { blockedReason: string }> {
    if (run.user_id === decider.userId) return { principal: decider }
    let author: { workspaceId: string; role: WorkspaceRole }
    try {
      author = await this.workspaceContext.resolveActiveWorkspace(run.user_id)
    } catch {
      return { blockedReason: AUTHOR_UNAVAILABLE_REASON }
    }
    if (author.workspaceId !== run.workspace_id) return { blockedReason: AUTHOR_UNAVAILABLE_REASON }
    const intents = run.intents ?? {}
    // D1 (revue de sécurité, 13/09) — le droit d'un pas est celui de son INTENT, la
    // règle de la porte du routeur. `step.permission` porte des valeurs HORS matrice
    // (`contacts:send`, `crm:write`) : `safeParse` échouait et ce contrôle était inerte.
    const required = [
      ...new Set(
        definition.steps.flatMap(step => {
          const intent = intents[step.key]
          const permission = intent ? INTENT_PERMISSION[intent.type] : null
          return permission ? [permission] : []
        }),
      ),
    ]
    if (required.some(permission => !hasPermission(author.role, permission))) {
      const extra = await this.workspaceContext.extraPermissionsOf(run.workspace_id, run.user_id)
      if (required.some(permission => !can(author.role, extra, permission))) {
        return { blockedReason: AUTHOR_LACKS_PERMISSION_REASON }
      }
    }
    return { principal: { userId: run.user_id, email: '', origin: 'user' } }
  }

  /**
   * Exécute une carte de copilote (un run `copilot_proposal` à un pas) avec ses
   * intents PERSISTÉS. `attempt` alimente la clé de dispatch
   * `<runId>:<pas>:<tentative>` : un « Réessayer » est une NOUVELLE tentative
   * (clé neuve), un double clic sur la même tentative ne produit rien de plus.
   */
  async executeCard(
    run: WorkflowRunEntity,
    principal: ActionPrincipal,
    attempt: number,
  ): Promise<{ run: WorkflowRunEntity; artifact: ActionDispatchArtifact | null }> {
    const definition = cardDefinitionForKey(run.definition_key)
    if (!definition) throw new NotFoundException(`Carte inconnue : ${run.definition_key}`)
    return this.execute(run, definition, run.intents ?? {}, principal, { attempt })
  }

  /**
   * #2865 — Relance MANUELLE d'un run multi-pas, à partir du premier pas qui
   * n'a pas abouti. Distinct de `CopilotCardService.retry` : une carte n'a
   * qu'un pas (`steps[0]`), un run de `WorkflowRunnerService` peut en avoir
   * plusieurs, et rejouer TOUT le run rejouerait un pas déjà réussi qui a
   * peut-être déjà écrit (#2200.29).
   *
   * Deux refus, chacun avec sa raison :
   *  - le run n'est pas dans un état qui appelle une reprise (`blocked` —
   *    rien n'est parti, le geste est de brancher un outil ; `cancelled` —
   *    un refus ne se relance pas tout seul ; tout run déjà en cours ou
   *    terminé avec succès) ;
   *  - le pas par lequel la reprise recommencerait a fini `unknown` — la
   *    doctrine l'arrête : rejouer un envoi peut-être déjà parti est pire que
   *    de ne rien faire. Ce cas se vérifie à la main, hors de ce geste.
   *
   * Les pas déjà `done` ne repassent JAMAIS dans `execute` : ils sont
   * préservés tels quels (`priorResults`), et seuls les pas restants,
   * dans l'ordre des dépendances, sont soumis au routeur.
   */
  async retryRun(runId: string, principal: ActionPrincipal): Promise<WorkflowRunEntity> {
    const { workspaceId } = await this.resolveWorkspace(principal.userId)
    const run = await this.runOf(runId, workspaceId)
    const definition = findWorkflow(run.definition_key)
    if (!definition) {
      throw new BadRequestException('Ce run ne vient pas d’un workflow multi-pas : relancez-le depuis sa carte.')
    }
    if (!RETRYABLE_RUN_STATUSES.has(run.status)) {
      throw new ConflictException(`Ce run est « ${run.status} » : il ne se relance pas.`)
    }

    const ordered = orderByDependency(definition.steps)
    const priorByKey = new Map(run.steps.map(step => [step.key, step]))
    // La MÊME lecture que le champ `canRetry` du contrôleur (GA-26) : un seul
    // endroit décide si et où une relance reprendrait.
    const resumeKey = retryResumeStepKeyOf(definition, run)
    if (!resumeKey) {
      const stuck = ordered.find(step => priorByKey.get(step.key)?.outcome !== 'done')
      if (stuck && priorByKey.get(stuck.key)?.outcome === 'unknown') {
        throw new ConflictException(
          'Le résultat du pas en cours est inconnu (délai dépassé) : il ne se relance pas tout seul — vérifiez s’il est parti avant de continuer.',
        )
      }
      throw new ConflictException('Tous les pas de ce run ont déjà réussi : rien à relancer.')
    }
    const resumeIndex = ordered.findIndex(step => step.key === resumeKey)

    // Réclamation atomique (D3) — deux clics ne relancent le run qu'une fois ;
    // l'autre retombe sur le run tel qu'il est déjà en train de tourner.
    const claimed = await this.runs.update(
      { id: run.id, workspace_id: workspaceId, status: In([...RETRYABLE_RUN_STATUSES]) },
      { status: 'running', finished_at: null },
    )
    if (!claimed.affected) return this.runOf(runId, workspaceId)

    const preserved = ordered.slice(0, resumeIndex).map(step => priorByKey.get(step.key)!)
    const remaining = ordered.slice(resumeIndex)
    const attempt = Math.max(0, ...run.steps.map(step => step.attempts)) + 1
    const executed = await this.execute(
      { ...run, status: 'running', finished_at: null },
      definition,
      run.intents ?? {},
      principal,
      { attempt, stepsToRun: remaining, priorResults: preserved },
    )
    return executed.run
  }

  /**
   * L'espace, le rôle, les réglages d'approbation et le drapeau démo de
   * l'appelant — pour les fichiers du module qui ne peuvent pas importer
   * `WorkspaceContextService` sans franchir GA-07 (voir {@link RunPrincipal}).
   */
  async workspaceOf(userId: string): Promise<{
    workspaceId: string
    role: WorkspaceRole
    settings: ApprovalSettings
    isDemo: boolean
  }> {
    const { workspaceId, role, workspace } = await this.resolveWorkspace(userId)
    return {
      workspaceId,
      role,
      settings: resolveSettings(workspace),
      isDemo: await this.workspaceContext.isDemoWorkspace(userId),
    }
  }

  /**
   * Relit l'issue d'un pas resté EN FILE (enrichissement en tâche de fond, D4).
   *
   * Ce n'est PAS une reprise : rien n'est redispatché. On demande au routeur ce
   * que la file sait, et on écrit ce qu'on apprend. Un `unknown` observé (job
   * expiré ou perdu) reste `unknown` — le vérifier est un geste humain.
   *
   * La réservation a normalement été soldée par le worker lui-même, dans la
   * même exécution que le débit (I3). La soldée ici est un FILET : idempotente,
   * elle ne fait rien si le worker l'a déjà fait, et rattrape un worker mort
   * entre les deux écritures.
   */
  async reconcile(run: WorkflowRunEntity, principal: ActionPrincipal): Promise<WorkflowRunEntity> {
    if (run.status !== 'running') return run
    const index = run.steps.findIndex(step => step.outcome === 'queued')
    const step = index >= 0 ? run.steps[index] : undefined
    const intent = step ? run.intents?.[step.key] : undefined
    if (!step || !intent) return run

    const observed = await this.router.observe(intent, principal)
    if (observed.status === 'queued') return run

    const outcome = toOutcome(observed.status)
    const creditsSpent = observed.creditsDebited ?? 0
    if (outcome !== 'unknown') {
      await this.reservations.settle(run.workspace_id, run.correlation_id, creditsSpent > 0 ? 'consumed' : 'released')
    }
    const steps = run.steps.map((current, position) =>
      position === index
        ? {
            ...current,
            outcome,
            creditsSpent,
            externalRef: observed.externalRef ?? current.externalRef,
            reason: observed.reason ?? current.reason,
            finishedAt: new Date().toISOString(),
          }
        : current,
    )
    const status = runStatusFrom(steps)
    const spent = steps.reduce((sum, current) => sum + current.creditsSpent, 0)
    const finishedAt = status === 'running' ? null : new Date()
    // Deux lectures simultanées observent la même issue : la première écrit,
    // la seconde ne trouve plus de run `running` et relit ce qui a été écrit.
    const claimed = await this.runs.update(
      { id: run.id, workspace_id: run.workspace_id, status: 'running' },
      { status, steps, spent_credits: spent, finished_at: finishedAt },
    )
    if (!claimed.affected) {
      return (await this.runs.findOne({ where: { id: run.id, workspace_id: run.workspace_id } })) ?? run
    }
    return { ...run, status, steps, spent_credits: spent, finished_at: finishedAt }
  }

  /**
   * Exécute les pas dans l'ordre des dépendances.
   *
   * Un pas dont une dépendance n'a pas abouti est `skipped`, pas `failed` : il
   * n'a pas raté, il n'a pas eu lieu. Confondre les deux ferait apparaître des
   * échecs en cascade dans le journal et rendrait illisible la cause réelle.
   */
  private async execute(
    run: WorkflowRunEntity,
    definition: WorkflowDefinition,
    intents: Partial<Record<string, ActionIntent>>,
    principal: ActionPrincipal,
    options: {
      attempt: number
      /**
       * #2865 — une RELANCE ne rejoue que les pas RESTANTS, dans l'ordre des
       * dépendances : le défaut (absent) reste la définition entière, pour
       * `start`/`decideApprovalRequest`, qui exécutent un run pour la première fois.
       */
      stepsToRun?: WorkflowStep[]
      /** #2865 — les pas déjà réussis d'une relance, préservés TELS QUELS en tête
       *  du résultat : jamais rejoués, jamais réécrits. */
      priorResults?: WorkflowRunStep[]
    },
  ): Promise<{ run: WorkflowRunEntity; artifact: ActionDispatchArtifact | null }> {
    // #4119 — une exception (routeur, écriture du run) entre la réservation et le solde final laissait
    // la ligne `reserved` jusqu'à l'expiration à 30 min. On la libère ici ; `settle` ne matche que
    // `state: 'reserved'`, donc un solde déjà fait (ou rien réservé) est un no-op. Une recherche déjà
    // CONFIÉE au worker n'est pas touchée : c'est lui qui la soldera.
    const hold = { handedToWorker: false }
    try {
      return await this.executeSteps(run, definition, intents, principal, options, hold)
    } catch (error) {
      if (!hold.handedToWorker) {
        await this.reservations.settle(run.workspace_id, run.correlation_id, 'released').catch(() => undefined)
      }
      throw error
    }
  }

  private async executeSteps(
    run: WorkflowRunEntity,
    definition: WorkflowDefinition,
    intents: Partial<Record<string, ActionIntent>>,
    principal: ActionPrincipal,
    options: {
      attempt: number
      stepsToRun?: WorkflowStep[]
      priorResults?: WorkflowRunStep[]
    },
    hold: { handedToWorker: boolean },
  ): Promise<{ run: WorkflowRunEntity; artifact: ActionDispatchArtifact | null }> {
    await this.runs.update(run.id, { status: 'running', started_at: run.started_at ?? new Date() })

    const ordered = options.stepsToRun ?? orderByDependency(definition.steps)
    // D5 / I6 — une salle de démonstration ne débite rien : lui réserver un
    // crédit contredirait son propre bandeau (`demo-coverage.ts` :
    // `credit_reservations` vide à dessein).
    const isDemo = await this.workspaceContext.isDemoWorkspace(run.user_id)
    // I3 — on ne réserve que ce qui peut PARTIR : un pas sans intent ne coûtera
    // rien, et l'annoncer gèlerait un crédit pour rien (l'ancienne somme portait
    // sur TOUS les pas de la définition).
    let reserved = isDemo
      ? 0
      : ordered.filter(step => intents[step.key]).reduce((sum, step) => sum + step.estimatedCredits, 0)
    if (reserved > 0) {
      // On balaie AVANT de réserver, et seulement pour cet espace : un run tué
      // en plein vol (déploiement, OOM) laisse sa ligne `reserved` derrière lui,
      // et le moment où l'espace repart est exactement celui où l'on sait qu'il
      // n'y a plus personne dessus. Le solde annoncé, lui, ignore déjà les
      // réservations périmées par leur date — ce balayage est de l'hygiène de
      // table, pas une condition de justesse.
      await this.reservations.sweepExpired(run.workspace_id)
      await this.reservations.reserve({
        workspaceId: run.workspace_id,
        userId: run.user_id,
        kind: 'enrichment',
        amount: reserved,
        reference: run.correlation_id,
      })
    }

    // #2865 — une relance PRÉSERVE les pas déjà réussis : ils entrent tels
    // quels dans le résultat, avant que la boucle n'écrive la suite.
    const results: WorkflowRunStep[] = [...(options.priorResults ?? [])]
    const outcomeByKey = new Map<string, ActionOutcome>(results.map(step => [step.key, step.outcome]))
    let spent = results.reduce((sum, step) => sum + step.creditsSpent, 0)
    /** Vrai quand le worker d'une recherche en file soldera lui-même la réservation. */
    let settledByWorker = false
    /**
     * #1931 L2 — ce qu'un pas a PRODUIT sans le persister ailleurs (le texte d'un
     * brouillon généré). Rendu à l'appelant, qui le garde dans le résultat de la
     * carte : sans cela, le brouillon n'existait que le temps de la requête.
     */
    let artifact: ActionDispatchArtifact | null = null

    for (const step of ordered) {
      const blockedBy = step.dependsOn.find(key => outcomeByKey.get(key) !== 'done')
      const intent = intents[step.key]
      if (blockedBy || !intent) {
        results.push(
          emptyResult(
            step,
            'skipped',
            blockedBy ? `Le pas « ${blockedBy} » n'a pas abouti.` : 'Aucune cible résolue pour ce pas.',
          ),
        )
        outcomeByKey.set(step.key, 'skipped')
        continue
      }

      const startedAt = new Date().toISOString()
      // I3 — la réservation n'est confiée au worker que pour une recherche EN
      // FILE (D4 : c'est lui qui observe le débit) et que si elle ne couvre QUE
      // ce pas : il la solde en entier, il ne sait pas en rendre une part. Un
      // enrichissement synchrone qui part en `unknown` n'a pas de worker : sa
      // réservation se libère ici, comme les autres.
      const queuedLookup = intent.type === 'enrich_contact' && intent.mode === 'queued'
      const handsReservationToWorker = queuedLookup && reserved > 0 && reserved === step.estimatedCredits
      const dispatched = await this.router.dispatch(
        { ...intent, idempotencyKey: `${run.id}:${step.key}:${options.attempt}` },
        principal,
        {
          // #2855 — la carte que ce pas exécute vient d'un RUN (une routine ou
          // une proposition du copilote), jamais d'un clic direct sur un
          // formulaire : la provenance le nomme, même quand le clic de
          // validation la rend `origin: 'user'`.
          source: { kind: 'routine', ref: run.id },
          ...(handsReservationToWorker ? { reservationReference: run.correlation_id } : {}),
        },
      )
      const outcome = toOutcome(dispatched.status)
      // #4119 — dès le retour du routeur, la recherche est partie avec la référence : une exception
      // d'écriture juste après ne doit pas libérer ce que son worker va solder.
      if ((outcome === 'queued' || outcome === 'unknown') && handsReservationToWorker) hold.handedToWorker = true
      // I4 / D3 — le crédit compté est celui que la capacité a DÉBITÉ, rapporté
      // par le routeur. Un enrichissement « fait » qui n'a rien trouvé débite 0 :
      // recopier l'estimation faisait mentir le total.
      const creditsSpent = dispatched.creditsDebited ?? 0
      spent += creditsSpent
      if (dispatched.artifact) artifact = dispatched.artifact
      results.push({
        key: step.key,
        intentType: step.intentType,
        // #2201.43 — la capacité voyage désormais jusqu'à la trace persistée.
        capability: step.capability,
        outcome,
        attempts: options.attempt,
        externalRef: dispatched.externalRef ?? null,
        creditsSpent,
        reason: dispatched.reason ?? null,
        startedAt,
        finishedAt: outcome === 'queued' ? null : new Date().toISOString(),
      })
      outcomeByKey.set(step.key, outcome)
      // D7 — les pas s'écrivent AU FIL de l'exécution : un écran qui relit le
      // run pendant qu'il tourne voit ce qui est fait et ce qui reste
      // (`currentStepKeyOf`), plus une liste vide jusqu'à la toute fin.
      await this.runs.update(run.id, { steps: [...results], spent_credits: spent })

      if (step.estimatedCredits > 0 && reserved > 0) {
        if ((outcome === 'queued' || outcome === 'unknown') && handsReservationToWorker) {
          // La recherche est partie (ou l'a peut-être été) avec la référence :
          // son worker soldera. Libérer ici rendrait le crédit « disponible »
          // pendant une recherche qui va peut-être le débiter.
          settledByWorker = true
          hold.handedToWorker = true
          reserved = 0
        } else {
          reserved = await this.shrinkReservation(run, reserved, step.estimatedCredits, creditsSpent)
        }
      }

      if (outcome === 'unknown') {
        // On ne rejoue pas et on ne continue pas : la suite dépend d'un état
        // qu'on ne connaît pas. Rejouer un envoi peut-être déjà parti est pire
        // que de s'arrêter et de le dire.
        this.logger.warn('Pas en état inconnu — exécution interrompue', {
          tags: { 'action_os.run': run.id, 'action_os.step': step.key },
        })
        break
      }
    }

    const status = runStatusFrom(results)
    // Ce qui reste réservé n'a plus de pas pour le dépenser (sautés, bloqués,
    // interrompus) : libéré. Jamais « consommé » d'office — I4.
    if (reserved > 0 && !settledByWorker)
      await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
    const finishedAt = status === 'running' ? null : new Date()
    await this.runs.update(run.id, {
      status,
      steps: results,
      spent_credits: spent,
      finished_at: finishedAt,
    })
    if (finishedAt) this.announceLongJobDone(run, status)
    return { run: { ...run, status, steps: results, spent_credits: spent, finished_at: finishedAt }, artifact }
  }

  /**
   * #1952.29 — L'ACCUSÉ DE FIN, VERS LES CANAUX DÉJÀ BRANCHÉS — allumé par
   * défaut, tranché Louis 16/09/2026 CONTRE la recommandation inverse.
   *
   * ⚠️ RISQUE ASSUMÉ, écrit ici pour qu'il ne redevienne pas un bug dans six
   * semaines : un canal branché est un canal d'ÉQUIPE, et un travail de Laura
   * est le geste d'UNE personne. L'accusé peut donc devenir du bruit partagé, et
   * dire à toute une équipe ce qu'un commercial a demandé. L'interrupteur qui
   * tient ce risque est la case par ÉVÉNEMENT de chaque canal (Réglages ›
   * Intégrations), celle-là même qui gouverne déjà l'accusé de fin d'analyse.
   *
   * QUI reçoit : seulement les canaux que l'espace a lui-même connectés, par
   * `IntegrationsService.notifyUser` — aucun e-mail, aucun destinataire deviné,
   * et jamais un prospect. C'est un accusé technique vers l'espace lui-même.
   *
   * QUOI déclenche : un run qui vient de la CONVERSATION (`turn_id`), et qui
   * vient d'atteindre un état terminal. Les runs de routine et ceux de l'Action
   * Center n'ont pas de tour de conversation : ils n'annoncent rien, et c'est ce
   * qui distingue « un travail long de Laura » du reste.
   *
   * Ce qui n'est PAS annoncé ici, et pourquoi : l'analyse de compte lancée
   * depuis la conversation. Ce moteur ne l'exécute pas — elle est OBSERVÉE
   * (`analysis-launch.port.ts`), et son propre worker envoie déjà son accusé
   * (`analysis.worker.ts`, `analysis.completed`). L'annoncer une seconde fois
   * dirait deux fois la même chose (loi 4).
   *
   * Best-effort et hors du chemin critique : `notifyUser` ne lève pas, mais un
   * canal lent ne doit pas retarder la fin d'un run.
   */
  private announceLongJobDone(run: WorkflowRunEntity, status: WorkflowRunStatus): void {
    if (!run.turn_id) return
    const label = run.preview?.whatWillHappen ?? run.definition_key
    const title = `${longJobDonePrefix(status)} — ${label}`
    if (this.longJobNotifier) {
      void this.longJobNotifier
        .notifyUser(run.user_id, {
          type: LAURA_JOB_COMPLETED_EVENT,
          text: title,
          data: {
            runId: run.id,
            status,
            conversationId: run.conversation_id,
            link: '/actions',
          },
        })
        .catch(() => undefined)
    }
    // #2276.62 — le résultat revient dans LE fil qui a demandé ce travail
    // (jamais un fil deviné) : sans lui — un run hors conversation n'annonce
    // déjà rien du tout, ligne au-dessus — on garde le lien actuel, rien
    // d'inventé.
    if (this.jobReturnNotifier && run.conversation_id) {
      void this.jobReturnNotifier
        .notify(run.user_id, {
          title: `${longJobDonePrefix(status)} — ${label}`,
          link: chatNotificationLink({ conversationId: run.conversation_id, accountId: run.account_id ?? null }),
        })
        .catch(() => undefined)
    }
  }

  /**
   * I3 — le pas coûteux vient de finir : sa part de la réservation est soldée
   * (consommée si un débit a été observé, libérée sinon), et seul le RESTE est
   * re-réservé sous la même référence. Le solde annoncé ne compte donc jamais un
   * crédit débité ET encore réservé au-delà de l'écriture en cours.
   */
  private async shrinkReservation(
    run: WorkflowRunEntity,
    reserved: number,
    stepCost: number,
    debited: number,
  ): Promise<number> {
    await this.reservations.settle(run.workspace_id, run.correlation_id, debited > 0 ? 'consumed' : 'released')
    const left = Math.max(0, reserved - stepCost)
    if (left > 0) {
      await this.reservations.reserve({
        workspaceId: run.workspace_id,
        userId: run.user_id,
        kind: 'enrichment',
        amount: left,
        reference: run.correlation_id,
      })
    }
    return left
  }

  /**
   * L'espace du demandeur, son rôle, et les réglages d'approbation qui s'y
   * appliquent. Les colonnes de réglage sont nullables : un espace qui n'a rien
   * choisi suit le défaut produit, et le suivra encore si ce défaut change.
   */
  /**
   * La demande EN ATTENTE de l'espace actif de l'appelant, pour un geste de
   * circuit (#2864 / #2856). Introuvable hors de l'espace ; tranchée ou expirée,
   * elle ne se délègue ni ne se reporte plus.
   */
  private async pendingApprovalFor(
    approvalId: string,
    userId: string,
  ): Promise<{ approval: ApprovalRequestEntity; workspaceId: string; role: WorkspaceRole }> {
    const { workspaceId, role } = await this.resolveWorkspace(userId)
    const approval = await this.approvals.findOne({ where: { id: approvalId, workspace_id: workspaceId } })
    if (!approval) throw new NotFoundException('Demande introuvable.')
    if (approval.state !== 'pending') throw new BadRequestException(`Demande déjà « ${approval.state} ».`)
    if (approval.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Demande expirée — relancez le workflow.')
    }
    return { approval, workspaceId, role }
  }

  /**
   * #2864 — CONFIER une demande d'approbation à un collègue du MÊME espace.
   *
   * L'appartenance se lit sur l'espace DE LA DEMANDE (jamais sur l'espace actif
   * du destinataire) : un membre d'un autre espace est refusé, même nommé par
   * son identifiant. `null` retire la délégation. La réclamation est
   * conditionnelle (`state: 'pending'`) : une demande tranchée entre-temps ne se
   * délègue pas en silence.
   */
  async assignApprovalRequest(input: {
    approvalId: string
    principal: ActionPrincipal
    assigneeId: string | null
  }): Promise<ApprovalRequestEntity> {
    const { approval, workspaceId, role } = await this.pendingApprovalFor(input.approvalId, input.principal.userId)
    if (input.assigneeId === null) {
      const verdict = canSnooze({
        actorId: input.principal.userId,
        actorRole: role,
        requesterId: approval.requested_by,
        currentAssigneeId: approval.assigned_to ?? null,
      })
      if (!verdict.allowed) throw new ForbiddenException(verdict.reason)
    } else {
      const membership = await this.workspaceContext.getMembership(input.assigneeId, workspaceId)
      const verdict = canAssign({
        requiredLevel: approval.required_level,
        assignerId: input.principal.userId,
        assignerRole: role,
        requesterId: approval.requested_by,
        currentAssigneeId: approval.assigned_to ?? null,
        assigneeId: input.assigneeId,
        assigneeRole: membership?.role ?? null,
      })
      if (!verdict.allowed) throw new ForbiddenException(verdict.reason)
    }
    const claimed = await this.approvals.update(
      { id: approval.id, workspace_id: workspaceId, state: 'pending' },
      { assigned_to: input.assigneeId },
    )
    if (!claimed.affected) throw new BadRequestException('Demande tranchée entre-temps.')
    return { ...approval, assigned_to: input.assigneeId }
  }

  /**
   * #2856 — REPORTER une demande d'approbation (une écriture CRM/ERP en attente).
   *
   * Même patron que le report d'une carte (`CopilotCardService.snooze`), au
   * grain de la DEMANDE : rien n'est décidé, la demande reste `pending` et
   * passera par la porte à son réveil. Le report ne dépasse jamais
   * l'expiration (même règle que le CHECK SQL) ; `null` la réveille.
   */
  async snoozeApprovalRequest(input: {
    approvalId: string
    principal: ActionPrincipal
    until: Date | null
  }): Promise<ApprovalRequestEntity> {
    const { approval, workspaceId, role } = await this.pendingApprovalFor(input.approvalId, input.principal.userId)
    const verdict = canSnooze({
      actorId: input.principal.userId,
      actorRole: role,
      requesterId: approval.requested_by,
      currentAssigneeId: approval.assigned_to ?? null,
    })
    if (!verdict.allowed) throw new ForbiddenException(verdict.reason)
    if (input.until !== null) {
      if (input.until.getTime() <= Date.now()) throw new BadRequestException('La date de report doit être future.')
      if (input.until.getTime() > approval.expires_at.getTime()) {
        throw new BadRequestException('Cette demande expire avant la date choisie : reportez-la moins loin.')
      }
    }
    const claimed = await this.approvals.update(
      { id: approval.id, workspace_id: workspaceId, state: 'pending' },
      { snoozed_until: input.until },
    )
    if (!claimed.affected) throw new BadRequestException('Demande tranchée entre-temps.')
    return { ...approval, snoozed_until: input.until }
  }

  /**
   * #2857 (#2201.31) — « Demander une explication » à Laura sur une carte de
   * validation. Une LECTURE, comme `talentIdentityExplain` (copilot-bridge) :
   * elle rend les MÊMES faits que la carte affichée dans « À valider »
   * (`summary` figé à la demande, `required_level`, `reason`), jamais un motif
   * recalculé ou deviné pour l'occasion (jamais de donnée fictive). `null`
   * plutôt qu'une exception : une demande introuvable ou hors de l'espace de
   * l'appelant n'a rien à expliquer, ce n'est pas une erreur du geste.
   */
  async explainApprovalRequest(input: { approvalId: string; userId: string }): Promise<ApprovalRequestEntity | null> {
    const { workspaceId } = await this.resolveWorkspace(input.userId)
    return this.approvals.findOne({ where: { id: input.approvalId, workspace_id: workspaceId } })
  }

  private async resolveWorkspace(userId: string): Promise<{
    workspaceId: string
    role: WorkspaceRole
    workspace: {
      approval_default_level?: string | null
      approval_bulk_threshold?: number | null
      approval_spend_threshold?: number | null
    }
  }> {
    const resolved = await this.workspaceContext.resolveActiveWorkspace(userId)
    const workspace = await this.workspaces.findOne({
      where: { id: resolved.workspaceId },
      select: ['approval_default_level', 'approval_bulk_threshold', 'approval_spend_threshold'],
    })
    return { workspaceId: resolved.workspaceId, role: resolved.role, workspace: workspace ?? {} }
  }
}

/**
 * #1952.29 — l'entête de l'accusé DIT LE STATUT, il ne le maquille pas.
 *
 * Un « ✅ » sur un run qui n'a rien fait est exactement le défaut que
 * `blocked` et `unknown` ont été ajoutés au contrat pour fermer : `done` disait
 * « terminé » à la place de « rien n'est parti » et de « on ne sait pas ».
 * L'accusé sortant répète cette distinction, parce qu'il se lit LOIN de l'app,
 * dans un canal d'équipe, sans la carte à côté.
 */
function longJobDonePrefix(status: WorkflowRunStatus): string {
  if (status === 'done') return '\u2705 Laura a termin\u00e9'
  if (status === 'partial') return '\u26a0\ufe0f Laura a termin\u00e9 en partie'
  // Un timeout n'est pas un \u00e9chec : `unknown` dit qu'on ne sait pas si l'action
  // est partie, et surtout que rien ne sera rejou\u00e9 tout seul.
  if (status === 'unknown') return '\u2753 Laura ne sait pas si l\u2019action est partie'
  if (status === 'blocked') return '\u26a0\ufe0f Laura n\u2019a rien pu lancer'
  return '\u26a0\ufe0f Laura n\u2019a pas pu terminer'
}

/**
 * Tri topologique des pas. Un cycle n'est pas une erreur fatale ici : les pas
 * restants sont renvoyés dans leur ordre déclaré, et leurs dépendances non
 * satisfaites les feront sauter à l'exécution. Faire tomber tout un run sur une
 * définition mal formée serait la pire des réponses au moment le plus tardif ;
 * la définition, elle, est validée en test.
 */
export function orderByDependency(steps: readonly WorkflowStep[]): WorkflowStep[] {
  const remaining = [...steps]
  const ordered: WorkflowStep[] = []
  const placed = new Set<string>()
  while (remaining.length > 0) {
    const index = remaining.findIndex(step => step.dependsOn.every(key => placed.has(key)))
    if (index === -1) {
      ordered.push(...remaining)
      break
    }
    const [next] = remaining.splice(index, 1)
    ordered.push(next)
    placed.add(next.key)
  }
  return ordered
}

/**
 * D7 — l'étape EN COURS d'un run qui tourne : le premier pas, dans l'ordre des
 * dépendances, qui n'a pas encore d'issue écrite — ou celui qui attend en file.
 * `null` quand le run ne tourne pas. Pure : l'écran la dérive du run persisté,
 * aucune colonne de plus.
 */
export function currentStepKeyOf(
  definition: WorkflowDefinition,
  run: { status: string; steps: readonly WorkflowRunStep[] },
): string | null {
  if (run.status !== 'running') return null
  const queued = run.steps.find(step => step.outcome === 'queued')
  if (queued) return queued.key
  const written = new Set(run.steps.map(step => step.key))
  return orderByDependency(definition.steps).find(step => !written.has(step.key))?.key ?? null
}

/** Un run qui n'a plus de « prochaine » — il est arrivé quelque part. */
const TERMINAL_RUN_STATUSES = new Set(['done', 'partial', 'failed', 'cancelled'])

/**
 * #2200.21 — LA PROCHAINE ACTION sur une carte « À valider ».
 *
 * `currentStepKeyOf` ne répond qu'une fois le run `running` : une carte qui
 * ATTEND une décision (`awaiting_approval`, `blocked`) n'a encore écrit AUCUN
 * pas, et `currentStepKeyOf` y rendait `null` — pas parce qu'il n'y a rien à
 * venir, mais parce que la question posée n'était pas la bonne. Celle-ci est
 * différente : quel est le PREMIER pas, dans l'ordre des dépendances, qui n'a
 * pas encore d'issue — quel que soit le statut, tant qu'il n'est pas terminal.
 *
 * Pure, comme `currentStepKeyOf` : dérivée du run persisté, aucune colonne de
 * plus.
 */
export function nextStepKeyOf(
  definition: WorkflowDefinition,
  run: { status: string; steps: readonly WorkflowRunStep[] },
): string | null {
  if (TERMINAL_RUN_STATUSES.has(run.status)) return null
  const written = new Set(run.steps.map(step => step.key))
  return orderByDependency(definition.steps).find(step => !written.has(step.key))?.key ?? null
}

/**
 * #2865 — le pas par lequel une RELANCE reprendrait : le premier, dans l'ordre
 * des dépendances, qui n'a pas d'issue `done`. `null` dans deux cas, chacun
 * une raison de refuser le geste : tout a déjà réussi (rien à relancer), ou ce
 * pas a fini `unknown` (doctrine — un timeout n'est pas un échec, et rejouer
 * un envoi peut-être déjà parti est pire que de ne rien faire).
 *
 * Pure, comme {@link currentStepKeyOf} et {@link nextStepKeyOf} : dérivée du
 * run persisté, jamais du statut recalculé — c'est la MÊME lecture que
 * `WorkflowRunnerService.retryRun` (GA-26, une seule place qui décide).
 */
export function retryResumeStepKeyOf(
  definition: WorkflowDefinition,
  run: { steps: readonly WorkflowRunStep[] },
): string | null {
  const priorByKey = new Map(run.steps.map(step => [step.key, step]))
  const ordered = orderByDependency(definition.steps)
  const resume = ordered.find(step => priorByKey.get(step.key)?.outcome !== 'done')
  if (!resume) return null
  return priorByKey.get(resume.key)?.outcome === 'unknown' ? null : resume.key
}

/**
 * #2865 — le run OFFRE-T-IL une relance ? La MÊME question, côté LECTURE :
 * `WorkflowRunnerService.retryRun` la pose pour AGIR, l'écran (`canRetry`,
 * `action-os.controller.ts`) la pose pour dessiner le bouton — une seule
 * fonction pure décide des deux, jamais un statut recopié à l'écran (GA-26).
 */
export function workflowRunCanRetry(
  definition: WorkflowDefinition,
  run: { status: WorkflowRunStatus; steps: readonly WorkflowRunStep[] },
): boolean {
  return RETRYABLE_RUN_STATUSES.has(run.status) && retryResumeStepKeyOf(definition, run) !== null
}

/** Un pas qui n'a pas eu lieu : zéro tentative, zéro crédit, une raison. */
function emptyResult(step: WorkflowStep, outcome: ActionOutcome, reason: string): WorkflowRunStep {
  return {
    key: step.key,
    intentType: step.intentType,
    // #2201.43 — même capacité que le pas qui n'a pas pu s'exécuter.
    capability: step.capability,
    outcome,
    attempts: 0,
    externalRef: null,
    creditsSpent: 0,
    reason,
    startedAt: null,
    finishedAt: null,
  }
}

/** Traduit l'issue d'un dispatch en issue de pas. Les deux vocabulaires
 *  coïncident déjà ; la fonction existe pour que l'un puisse évoluer sans l'autre. */
export function toOutcome(status: string): ActionOutcome {
  switch (status) {
    case 'done':
      return 'done'
    // Une requête acceptée n'est pas une action vérifiée. La replier en `done`
    // déclarait la réussite ET débitait le crédit (`creditsSpent` est indexé sur
    // `done`) sur une simple promesse.
    case 'queued':
      return 'queued'
    case 'skipped':
      return 'skipped'
    case 'partial':
      return 'partial'
    case 'cancelled':
      return 'cancelled'
    case 'unknown':
      return 'unknown'
    // D9 — la porte d'écriture CRM a RETENU la demande (origine `system`) :
    // ni un échec, ni une réussite, une attente.
    case 'awaiting_approval':
      return 'awaiting_approval'
    default:
      return 'failed'
  }
}

/**
 * Le statut du run à partir de ses pas.
 *
 * `partial` est le cas important : un run où l'email est parti mais où la note
 * CRM a échoué n'est ni réussi ni raté. Le dire « failed » masquerait un envoi
 * réel (et inciterait à le rejouer) ; le dire « done » masquerait le travail
 * qu'il reste à faire.
 */
export function runStatusFrom(steps: readonly WorkflowRunStep[]): WorkflowRunEntity['status'] {
  // Aucun pas : le planificateur n'a rien laissé passer. Ce n'est pas une
  // réussite, et le dire « fait » masquait précisément le cas où aucune
  // capacité n'était connectée.
  if (steps.length === 0) return 'blocked'

  const count = (outcome: ActionOutcome): number => steps.filter(s => s.outcome === outcome).length
  // D6 (#1931 L2) — un pas EN FILE n'est pas terminé : le run non plus. Un
  // enrichissement mis en file tombait dans « partiel » (rien de `done`, rien de
  // `failed`, pas tout `skipped`), et l'écran annonçait un résultat pendant que
  // la recherche tournait encore.
  if (count('queued') > 0) return 'running'
  // D9 — une écriture retenue par la porte CRM attend quelqu'un.
  if (count('awaiting_approval') > 0 && count('failed') === 0 && count('unknown') === 0) {
    return 'awaiting_approval'
  }

  const done = count('done')
  const failed = count('failed')
  const unknown = count('unknown')

  // Rien n'est parti, rien n'a échoué : tout a été sauté. Le geste suivant est
  // de regarder pourquoi — chaque pas porte sa raison — pas de conclure que
  // c'était fait.
  if (done === 0 && failed === 0 && unknown === 0) {
    return steps.every(s => s.outcome === 'skipped') ? 'blocked' : 'partial'
  }

  // Une partie est passée : ni réussi ni raté, quelle que soit la nature de
  // l'autre partie.
  if (done > 0 && (failed > 0 || unknown > 0)) return 'partial'

  // Rien n'a réussi. Reste à ne pas confondre les deux façons de ne pas
  // réussir : un échec se rejoue, un `unknown` se vérifie.
  if (done === 0 && failed === 0) return 'unknown'
  if (done === 0 && unknown === 0) return 'failed'
  if (done === 0) return 'partial'

  // Ici : que des `done` et des `skipped`.
  return done < steps.length ? 'partial' : 'done'
}
