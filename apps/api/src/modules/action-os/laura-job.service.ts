import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, type Repository } from 'typeorm'
import {
  LAURA_JOB_DEFINITION_KEY,
  lauraJobBriefSchema,
  lauraJobAwaitsApproval,
  lauraJobEstimatedCredits,
  lauraJobGesturesOf,
  lauraJobInitialStatus,
  lauraJobMeasuredDuration,
  lauraJobRearmForResume,
  lauraJobRemainingCredits,
  lauraJobProgressOf,
  lauraJobResumeOf,
  lauraJobStateOf,
  lauraJobSynthesisIdentities,
  lauraJobSynthesisOf,
  lauraJobToolsOf,
  lauraJobValidationsRequired,
  type LauraJobBrief,
  type LauraJobGesture,
  type LauraJobView,
  type WorkflowRunStatus,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { CreditReservationService } from './credit-reservation.service'
import { LAURA_JOB_BALANCE, LAURA_JOB_ENQUEUER, type LauraJobBalance, type LauraJobEnqueuer } from './laura-job.port'
import { WorkflowRunnerService } from './workflow-runner.service'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

type RunPrincipal = { userId: string; email?: string }

type ProposeJobOutcome = 'absent' | 'invalid' | 'demo' | 'persisted' | 'reused'

/** #2276.49 — combien de jobs finis servent de mesure à la durée d'un job neuf. */
const MEASURED_JOBS = 50

/** La clé d'idempotence d'un job : un job par tour de conversation. */
function jobIdempotencyKey(turnId: string): string {
  return `job:${turnId}`
}

function iso(value: Date | null | undefined): string | null {
  return value ? new Date(value).toISOString() : null
}

/**
 * #2276 — le job composite de Laura, côté API (`packages/contracts/src/schemas/laura-job.ts`).
 *
 * Tranche 1 : OUVRIR et LIRE un job — il naît en `to_confirm` (ou `draft`).
 * Tranche 2 : les GESTES de la personne — confirmer (réserve le coût maximum
 * chez le module crédits et met en file), valider une étape qui l'exige,
 * reprendre, annuler. L'exécution elle-même vit dans `LauraJobExecutor`.
 * Doctrine : Laura prépare, elle ne lance rien seule — chaque départ est un
 * clic, et chaque geste est scopé à l'espace ET à la personne qui possède le job.
 */
@Injectable()
export class LauraJobService {
  private readonly logger = new Logger(LauraJobService.name)

  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // Une CLASSE, pas une union : Nest injecte par le type émis (une union émet `Object`).
    private readonly workspaces: WorkflowRunnerService,
    // #2276 tranche 2 — le registre des crédits PROMIS (le seul écrivain de
    // `credit_reservations`), le solde de la facturation, et la file.
    private readonly reservations: CreditReservationService,
    @Inject(LAURA_JOB_BALANCE)
    private readonly balance: LauraJobBalance,
    @Inject(LAURA_JOB_ENQUEUER)
    private readonly queue: LauraJobEnqueuer,
  ) {}

  /**
   * #2276.62 — les jobs d'un fil, pour la relecture de la conversation : par clé
   * de fil quand il en a une, sinon par les tours de ses messages ; rien quand
   * on ne sait désigner ni l'un ni l'autre (jamais « tous les jobs de
   * l'espace »). Comme {@link view} : les jobs de CETTE personne seulement.
   */
  async listForThread(
    principal: RunPrincipal,
    filter: { conversationId: string | null; turnIds: readonly string[] },
  ): Promise<LauraJobView[]> {
    const { workspaceId } = await this.workspaces.workspaceOf(principal.userId)
    const scope = { workspace_id: workspaceId, user_id: principal.userId, definition_key: LAURA_JOB_DEFINITION_KEY }
    const where = filter.conversationId
      ? { ...scope, conversation_id: filter.conversationId }
      : filter.turnIds.length > 0
        ? { ...scope, turn_id: In([...filter.turnIds]) }
        : null
    if (!where) return []
    const rows = await this.runs.find({ where, order: { created_at: 'ASC' }, take: 50 })
    const views = rows.flatMap(row => {
      try {
        return [{ row, view: this.toView(row) }]
      } catch {
        // Une fiche illisible (forme d'avant un déploiement) ne se rend pas à moitié.
        return []
      }
    })
    return Promise.all(views.map(({ row, view }) => this.withSynthesis(row, view)))
  }

  /** Le job, s'il appartient à CETTE personne dans SON espace — sinon 404 (jamais « il existe ailleurs »). */
  async view(id: string, principal: RunPrincipal): Promise<LauraJobView> {
    const run = await this.owned(id, principal)
    return this.withSynthesis(run, this.toView(run))
  }

  /**
   * #3860.4 — DÉCISION LOUIS 09/10 : la synthèse, DERNIÈRE étape du job. Rien
   * n'est recalculé (`lauraJobSynthesisOf` lit `produced` des étapes) ; seuls
   * les NOMS sont relus, dans CET espace — une identité d'un autre espace ou
   * supprimée depuis ne fait aucune ligne. Aucun crédit n'est débité.
   */
  private async withSynthesis(run: WorkflowRunEntity, view: LauraJobView): Promise<LauraJobView> {
    const identities = lauraJobSynthesisIdentities(view.state, view.brief)
    if (!identities) return view
    const none = Promise.resolve([])
    const [accounts, contacts]: [AccountEntity[], ContactEntity[]] = await Promise.all([
      identities.accountIds.length > 0
        ? this.accounts.find({ where: { id: In(identities.accountIds), workspace_id: run.workspace_id } })
        : none,
      identities.contactIds.length > 0
        ? this.contacts.find({ where: { id: In(identities.contactIds), workspace_id: run.workspace_id } })
        : none,
    ])
    const names = {
      accounts: new Map(accounts.map(account => [account.id, account.company_name])),
      contacts: new Map(contacts.map(contact => [contact.id, contact.full_name])),
    }
    return { ...view, synthesis: lauraJobSynthesisOf(view.state, view.brief, names) }
  }

  /**
   * « Confirmer » — le clic EST la décision. Le coût MAXIMUM (la grille, jamais
   * le modèle) est réservé chez le registre des crédits promis : le solde
   * annoncé en tient compte tant que le job tourne, et rien n'est DÉBITÉ ici —
   * chaque capacité débite ce qu'elle a réellement consommé, et la réservation
   * se solde au fil des étapes (I3). Solde insuffisant : 402, rien ne part.
   */
  async confirm(id: string, principal: RunPrincipal): Promise<LauraJobView> {
    const run = await this.allowed(id, principal, 'confirm')
    const brief = lauraJobBriefSchema.parse(run.job)
    const maximum = lauraJobEstimatedCredits(brief)
    if (maximum > 0) {
      const remaining = await this.balance.remainingOf(principal.userId)
      if (remaining !== null && remaining < maximum) {
        throw new HttpException(SOFT_BRAKE_MESSAGE, HttpStatus.PAYMENT_REQUIRED)
      }
    }
    // Deux onglets, un seul départ : la transition est conditionnée à l'état lu.
    const moved = await this.transition(run, 'to_confirm', { status: 'planned' })
    if (maximum > 0) {
      await this.reservations.sweepExpired(run.workspace_id)
      await this.reservations.reserve({
        workspaceId: run.workspace_id,
        userId: run.user_id,
        kind: 'enrichment',
        amount: maximum,
        reference: run.correlation_id,
      })
    }
    await this.start(moved, principal)
    return this.toView(moved)
  }

  /**
   * Doctrine — la porte : valider l'étape QUI ATTEND, et elle seule. La
   * validation porte le nom de la personne (jamais le modèle), puis le job
   * repart ; le reste du coût maximum est re-réservé (une attente peut dépasser
   * la durée de vie d'une réservation).
   */
  async approve(id: string, principal: RunPrincipal, stepKey: string): Promise<LauraJobView> {
    const run = await this.allowed(id, principal, 'approve')
    const brief = lauraJobBriefSchema.parse(run.job)
    const waiting = lauraJobAwaitsApproval(brief)
    if (!waiting || waiting.key !== stepKey) throw new ConflictException('Cette étape n’attend pas de validation.')
    const at = new Date().toISOString()
    const job: LauraJobBrief = {
      ...brief,
      steps: brief.steps.map(step =>
        step.key === stepKey ? { ...step, approvedBy: principal.userId, approvedAt: at } : step,
      ),
    }
    const moved = await this.transition(run, 'awaiting_approval', { status: 'planned', job })
    await this.holdRemaining(moved, job)
    await this.start(moved, principal)
    return this.toView(moved)
  }

  /**
   * #2276.18 / #2276.53 — reprendre un job `partial`/`failed` : ce qui est fait
   * reste fait (jamais rejoué), le reste repart. Jamais sur `unknown`
   * ({@link lauraJobGesturesOf}) : une étape peut-être partie ne se relance pas.
   */
  async resume(id: string, principal: RunPrincipal): Promise<LauraJobView> {
    const run = await this.allowed(id, principal, 'resume')
    const job = lauraJobRearmForResume(lauraJobBriefSchema.parse(run.job))
    const moved = await this.transition(run, run.status, { status: 'planned', job, finished_at: null })
    await this.holdRemaining(moved, job)
    await this.start(moved, principal)
    return this.toView(moved)
  }

  /** #2276.57 — annuler : le job s'arrête avant l'étape suivante ; ce qui est promis est libéré. */
  async cancel(id: string, principal: RunPrincipal): Promise<LauraJobView> {
    const run = await this.allowed(id, principal, 'cancel')
    const moved = await this.transition(run, run.status, { status: 'cancelled', finished_at: new Date() })
    await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
    return this.withSynthesis(moved, this.toView(moved))
  }

  private async owned(id: string, principal: RunPrincipal): Promise<WorkflowRunEntity> {
    const { workspaceId } = await this.workspaces.workspaceOf(principal.userId)
    const run = await this.runs.findOne({
      where: { id, workspace_id: workspaceId, user_id: principal.userId, definition_key: LAURA_JOB_DEFINITION_KEY },
    })
    if (!run) throw new NotFoundException('Travail introuvable.')
    return run
  }

  /** Le geste est-il permis dans l'état LU ? — la même lecture que les boutons de la carte (GA-26). */
  private async allowed(id: string, principal: RunPrincipal, gesture: LauraJobGesture): Promise<WorkflowRunEntity> {
    const run = await this.owned(id, principal)
    const brief = lauraJobBriefSchema.parse(run.job)
    if (!lauraJobGesturesOf(lauraJobStateOf(run.status), brief).includes(gesture)) {
      throw new ConflictException('Ce geste n’est pas permis dans l’état actuel du travail.')
    }
    return run
  }

  /** Une transition conditionnée à l'état lu : un second geste concurrent ne passe pas. */
  private async transition(
    run: WorkflowRunEntity,
    from: WorkflowRunStatus,
    patch: Partial<Pick<WorkflowRunEntity, 'status' | 'job' | 'finished_at'>>,
  ): Promise<WorkflowRunEntity> {
    const moved = await this.runs.update(
      { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id, status: from },
      patch,
    )
    if (!moved.affected) throw new ConflictException('Ce travail vient de changer d’état.')
    return { ...run, ...patch } as WorkflowRunEntity
  }

  /** Re-réserver le coût maximum de ce qui reste à faire (idempotent par référence). */
  private async holdRemaining(run: WorkflowRunEntity, brief: LauraJobBrief): Promise<void> {
    const left = lauraJobRemainingCredits(brief)
    if (left <= 0) return
    await this.reservations.reserve({
      workspaceId: run.workspace_id,
      userId: run.user_id,
      kind: 'enrichment',
      amount: left,
      reference: run.correlation_id,
    })
  }

  /** Mettre en file ; si la file refuse, rien n'est parti : le job échoue sans rien débiter, la réservation est libérée. */
  private async start(run: WorkflowRunEntity, principal: RunPrincipal): Promise<void> {
    try {
      await this.queue.enqueue({
        jobId: run.id,
        workspaceId: run.workspace_id,
        userId: run.user_id,
        email: principal.email ?? '',
      })
    } catch (error) {
      await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
      await this.runs.update(
        { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id, status: 'planned' },
        { status: 'failed', finished_at: new Date() },
      )
      throw error
    }
  }

  /**
   * #2276.1 / #2276.2 — la fiche que Laura a posée dans CE tour
   * (`context.laura_job` de l'événement `done`), devenue un job persistant.
   *
   * Ce qui arrive est une SORTIE DE MODÈLE : validée par `lauraJobBriefSchema`
   * (dépendances comprises), une forme invalide n'ouvre rien. Le modèle ne peut
   * déclarer ni un travail fait, ni un résultat, ni un objet créé — ces champs
   * repartent à zéro. Les cibles hors de l'espace sortent du périmètre.
   */
  async proposeFromTurn(input: {
    principal: RunPrincipal
    conversationId: string | null
    turnId: string
    raw: unknown
  }): Promise<{ outcome: ProposeJobOutcome; job: LauraJobView | null }> {
    if (input.raw === undefined || input.raw === null) return { outcome: 'absent', job: null }
    const parsed = lauraJobBriefSchema.safeParse(input.raw)
    if (!parsed.success) return { outcome: 'invalid', job: null }

    const { workspaceId, isDemo } = await this.workspaces.workspaceOf(input.principal.userId)
    // Même règle que les cartes (I6) : une salle de démonstration ne persiste rien.
    if (isDemo) return { outcome: 'demo', job: null }

    const key = jobIdempotencyKey(input.turnId)
    const existing = await this.runs.findOne({ where: { workspace_id: workspaceId, idempotency_key: key } })
    if (existing) return { outcome: 'reused', job: this.toView(existing) }

    const brief = await this.withMeasuredDuration(
      await this.scopedToWorkspace(this.fresh(parsed.data), workspaceId),
      workspaceId,
    )
    const seed = this.runs.create({
      workspace_id: workspaceId,
      user_id: input.principal.userId,
      definition_key: LAURA_JOB_DEFINITION_KEY,
      definition_version: 1,
      trigger: LAURA_JOB_DEFINITION_KEY,
      status: lauraJobInitialStatus(brief),
      // Un job porte UNE cible quand il n'en a qu'une ; plusieurs vivent dans la fiche.
      account_id: brief.scope.accountIds.length === 1 ? brief.scope.accountIds[0] : null,
      contact_id: brief.scope.contactIds.length === 1 ? brief.scope.contactIds[0] : null,
      correlation_id: `job_${input.turnId}`.slice(0, 64),
      idempotency_key: key,
      steps: [],
      estimated_credits: lauraJobEstimatedCredits(brief),
      spent_credits: 0,
      started_at: null,
      finished_at: null,
      conversation_id: input.conversationId,
      turn_id: input.turnId,
      job: brief,
    })
    try {
      const saved = await this.runs.save(seed)
      await this.supersedeInThread(saved)
      return { outcome: 'persisted', job: this.toView(saved) }
    } catch (error) {
      const conflict = await this.runs.findOne({ where: { workspace_id: workspaceId, idempotency_key: key } })
      if (conflict) return { outcome: 'reused', job: this.toView(conflict) }
      throw error
    }
  }

  /**
   * #2276.31 — une NOUVELLE demande dans le même fil remplace les jobs encore « À confirmer » (ou Brouillon) :
   * ils passent `superseded` (« Obsolète »). Seul le non-lancé est touché — un job confirmé, en cours ou fini
   * n'est jamais rendu obsolète — et la transition est conditionnée à l'état lu (un clic « Confirmer »
   * concurrent gagne). Les cartes du copilote ont leur propre écrivain (`copilot-card.service`, trigger distinct).
   */
  private async supersedeInThread(fresh: WorkflowRunEntity): Promise<void> {
    if (!fresh.conversation_id) return
    const earlier = await this.runs.find({
      where: {
        workspace_id: fresh.workspace_id,
        user_id: fresh.user_id,
        trigger: LAURA_JOB_DEFINITION_KEY,
        conversation_id: fresh.conversation_id,
        status: In(['to_confirm', 'draft']),
      },
    })
    for (const run of earlier) {
      if (run.id === fresh.id || run.turn_id === fresh.turn_id) continue
      await this.runs.update(
        { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id, status: run.status },
        { status: 'superseded', finished_at: new Date() },
      )
    }
  }

  /** Ce que l'écran lit — toutes les dérivations viennent du contrat (GA-26). */
  toView(run: WorkflowRunEntity): LauraJobView {
    const brief = lauraJobBriefSchema.parse(run.job)
    const state = lauraJobStateOf(run.status)
    return {
      id: run.id,
      state,
      brief,
      tools: lauraJobToolsOf(brief),
      validationsRequired: lauraJobValidationsRequired(brief).map(step => ({ key: step.key, label: step.label })),
      progress: lauraJobProgressOf(brief),
      resume: lauraJobResumeOf(state, brief),
      ownerId: run.user_id,
      conversationId: run.conversation_id,
      turnId: run.turn_id,
      estimatedCredits: run.estimated_credits,
      spentCredits: run.spent_credits,
      startedAt: iso(run.started_at),
      finishedAt: iso(run.finished_at),
      createdAt: iso(run.created_at) ?? new Date(0).toISOString(),
      // #3860.4 — posée par `withSynthesis` (les noms se relisent) ; jamais ici.
      synthesis: null,
    }
  }

  /** Le modèle propose un PLAN : rien n'est fait, rien n'est produit, rien n'a échoué. */
  private fresh(brief: LauraJobBrief): LauraJobBrief {
    return {
      ...brief,
      // Ni travail fait, ni preuve, ni VALIDATION : une validation est un geste humain.
      steps: brief.steps.map(step => ({
        ...step,
        status: 'todo',
        startedAt: null,
        finishedAt: null,
        creditsSpent: null,
        note: null,
        approvedBy: null,
        approvedAt: null,
        // #3860.1 / #3860.2 — l'attente et les identités produites sont la preuve de l'exécuteur.
        awaiting: [],
        produced: { accountIds: [], contactIds: [] },
      })),
      intermediateResults: [],
      errors: [],
      createdObjects: [],
      // #2276.49 — une durée n'est jamais celle que le modèle écrit : elle se
      // MESURE (`withMeasuredDuration`), ou elle reste absente.
      estimatedDurationSeconds: null,
      estimatedDurationBasis: null,
    }
  }

  /**
   * #2276.49 — la durée prévue, estimée sur les étapes RÉELLEMENT exécutées des
   * derniers jobs finis de CET espace (preuve par étape, #2276.59). Aucune mesure
   * pour une des capacités : la durée reste absente, jamais devinée.
   */
  private async withMeasuredDuration(brief: LauraJobBrief, workspaceId: string): Promise<LauraJobBrief> {
    const past = await this.runs.find({
      where: {
        workspace_id: workspaceId,
        definition_key: LAURA_JOB_DEFINITION_KEY,
        status: In(['done', 'partial', 'failed']),
      },
      order: { finished_at: 'DESC' },
      take: MEASURED_JOBS,
    })
    const history = past.flatMap(run => {
      const parsed = lauraJobBriefSchema.safeParse(run.job)
      return parsed.success ? parsed.data.steps : []
    })
    const measured = lauraJobMeasuredDuration(brief.steps, history)
    return measured
      ? { ...brief, estimatedDurationSeconds: measured.seconds, estimatedDurationBasis: measured.basis }
      : brief
  }

  /** Seules les cibles DE L'ESPACE restent — jamais un identifiant d'ailleurs relayé. */
  private async scopedToWorkspace(brief: LauraJobBrief, workspaceId: string): Promise<LauraJobBrief> {
    const [accounts, contacts] = await Promise.all([
      brief.scope.accountIds.length > 0
        ? this.accounts.find({ where: { id: In(brief.scope.accountIds), workspace_id: workspaceId }, select: ['id'] })
        : Promise.resolve([]),
      brief.scope.contactIds.length > 0
        ? this.contacts.find({ where: { id: In(brief.scope.contactIds), workspace_id: workspaceId }, select: ['id'] })
        : Promise.resolve([]),
    ])
    const accountIds = new Set(accounts.map(row => row.id))
    const contactIds = new Set(contacts.map(row => row.id))
    const dropped = brief.scope.accountIds.length - accountIds.size + (brief.scope.contactIds.length - contactIds.size)
    if (dropped > 0) {
      // Des NOMBRES seulement — ni nom, ni identifiant.
      this.logger.warn('Cibles hors espace retirées du périmètre d’un job', { contexts: { job: { dropped } } })
    }
    return {
      ...brief,
      scope: {
        ...brief.scope,
        accountIds: brief.scope.accountIds.filter(id => accountIds.has(id)),
        contactIds: brief.scope.contactIds.filter(id => contactIds.has(id)),
      },
    }
  }
}
