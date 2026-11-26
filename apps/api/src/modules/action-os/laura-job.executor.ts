import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, type Repository } from 'typeorm'
import {
  LAURA_JOB_CAPABILITIES,
  LAURA_JOB_LIMITS,
  lauraJobAwaitingStepOf,
  lauraJobAwaitsApproval,
  lauraJobBriefSchema,
  lauraJobDropUnreachable,
  lauraJobRemainingCredits,
  lauraJobNextStepOf,
  lauraJobStateAfterStep,
  lauraJobStepCredits,
  lauraJobStepCriteriaMissing,
  lauraJobWithProducedIdentities,
  type ActionDispatchResult,
  type ActionIntent,
  type LauraJobBrief,
  type LauraJobCapability,
  type LauraJobStep,
  type LauraJobStepNote,
  type WorkflowRunStatus,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { LAURA_JOB_COMPLETED_EVENT } from '../integrations/integration-providers'
import { chatNotificationLink } from '../ia-proxy/chat-notification-link'
import { CreditReservationService } from './credit-reservation.service'
import { JOB_RETURN_NOTIFIER, type JobReturnNotifier } from './job-return-notifier.port'
import {
  LAURA_JOB_CAPABILITY_PORTS,
  LAURA_JOB_DISPATCHER,
  LAURA_JOB_DRAFTS,
  LAURA_JOB_ENQUEUER,
  type LauraJobCapabilityPorts,
  type LauraJobDispatcher,
  type LauraJobDrafts,
  type LauraJobEnqueuer,
  type LauraJobQueueData,
} from './laura-job.port'
import { LONG_JOB_NOTIFIER, type LongJobNotifier } from './long-job-notifier.port'

/** Ce qu'une étape a donné, une fois toutes ses cibles traitées. */
type StepOutcome = {
  status: 'done' | 'failed' | 'blocked' | 'unknown'
  note: LauraJobStepNote | null
  creditsSpent: number | null
  summary: string | null
  errors: string[]
  created: Array<{ kind: string; id: string; label: string }>
  /** #3860.2 — les identités produites, versées dans le périmètre pour la suite. */
  produced?: LauraJobStep['produced']
}

/** #3860.1 — une étape qui a LANCÉ des runs asynchrones : elle attend, le job se gare. */
type StepLaunched = { status: 'running'; awaiting: LauraJobStep['awaiting']; errors: string[] }

/** #3860.1 — le délai entre deux passages d'un job qui attend ses analyses. */
const ASYNC_POLL_DELAY_MS = 60_000

/** Les états où le job a fini de travailler (l'accusé part, la réservation se libère). */
const TERMINAL: ReadonlySet<WorkflowRunStatus> = new Set(['done', 'partial', 'failed', 'blocked', 'unknown'])

/**
 * #2276 tranche 2 — L'EXÉCUTION PAR ÉTAPES du job composite de Laura, dans le
 * worker de la file `laura-job` (`laura-job.worker.ts`).
 *
 * Ce qu'elle tient :
 *  - elle ne réimplémente AUCUNE capacité : chaque cible passe par le routeur
 *    d'actions, qui vérifie le droit, le mandat, l'idempotence, et rapporte le
 *    débit OBSERVÉ (I4) — jamais l'estimation recopiée ;
 *  - elle ne dépasse jamais le coût confirmé : une étape traite au plus `units`
 *    cibles, le nombre que la carte annonçait ;
 *  - la fiche s'écrit AU FIL de l'exécution (preuve par étape, résultats,
 *    erreurs, objets créés) et le statut est relu avant chaque étape : une
 *    annulation arrête le job entre deux étapes ;
 *  - la porte : une étape qui exige une validation arrête le job AVANT elle
 *    (`awaiting_approval`) tant qu'une personne ne l'a pas validée ;
 *  - un timeout n'est pas un échec : une issue inconnue (ou une exception) rend
 *    l'étape et le job `unknown`, et plus rien ne part tout seul ;
 *  - Laura n'envoie jamais : aucune capacité d'un job ne mène à `send_email`.
 */
@Injectable()
export class LauraJobExecutor {
  private readonly logger = new Logger(LauraJobExecutor.name)

  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    private readonly reservations: CreditReservationService,
    @Inject(LAURA_JOB_DISPATCHER)
    private readonly dispatcher: LauraJobDispatcher,
    @Optional()
    @Inject(LAURA_JOB_DRAFTS)
    private readonly drafts?: LauraJobDrafts,
    @Optional()
    @Inject(LONG_JOB_NOTIFIER)
    private readonly notifier?: LongJobNotifier,
    @Optional()
    @Inject(JOB_RETURN_NOTIFIER)
    private readonly jobReturnNotifier?: JobReturnNotifier,
    // #3860.1 — les capacités hors routeur (analyse, mémoire marché, matching, territoire).
    @Optional()
    @Inject(LAURA_JOB_CAPABILITY_PORTS)
    private readonly capabilities?: LauraJobCapabilityPorts,
    @Optional()
    @Inject(LAURA_JOB_ENQUEUER)
    private readonly enqueuer?: LauraJobEnqueuer,
  ) {}

  async run(data: LauraJobQueueData): Promise<void> {
    // Réclamer le job : `planned` → `running`, scopé à l'espace ET à la personne.
    // Deux workers (retry, double mise en file) : un seul gagne.
    const scope = { id: data.jobId, workspace_id: data.workspaceId, user_id: data.userId }
    const claimed = await this.runs.update({ ...scope, status: 'planned' }, { status: 'running' })
    if (!claimed.affected) return
    let run = await this.runs.findOne({ where: scope })
    if (!run) return
    if (!run.started_at) await this.runs.update(scope, { started_at: new Date() })

    for (;;) {
      // Relue avant chaque étape : une annulation arrête le job ici.
      run = await this.runs.findOne({ where: scope })
      if (!run || run.status !== 'running') return
      const brief = lauraJobBriefSchema.parse(run.job)

      // #3860.1 — une étape attend ses analyses asynchrones : on relève, sans rien relancer.
      const waiting = lauraJobAwaitingStepOf(brief)
      if (waiting) {
        const collected = await this.collect(run, waiting)
        if (collected === 'still_running') {
          if (await this.park(run, data)) return
          await this.finish(run, waiting, timeoutOutcome())
          break
        }
        if (!(await this.finish(run, waiting, collected))) break
        continue
      }

      if (lauraJobAwaitsApproval(brief)) break
      const step = lauraJobNextStepOf(brief)
      if (!step) break

      const startedAt = new Date().toISOString()
      await this.writeStep(run, brief, step.key, { status: 'running', startedAt, note: null })
      const outcome = await this.execute(run, brief, { ...step, startedAt }, data)
      if (outcome.status === 'running') {
        // #3860.1 — les runs sont partis : l'étape les ATTEND, le job se gare.
        const latest = lauraJobBriefSchema.parse(((await this.runs.findOne({ where: scope })) ?? run).job)
        await this.writeStep(run, latest, step.key, { awaiting: outcome.awaiting })
        if (outcome.errors.length > 0) await this.appendErrors(run, step.key, outcome.errors)
        if (await this.park(run, data)) return
        await this.finish(run, { ...step, startedAt }, timeoutOutcome())
        break
      }
      if (!(await this.finish(run, { ...step, startedAt }, outcome))) break
    }

    await this.settle(data)
  }

  /**
   * La fin d'une étape : sa preuve, ses résultats, ses erreurs, ses objets créés,
   * et — #3860.2 — les identités qu'elle a produites, versées dans le périmètre.
   * Rend `false` quand le passage doit s'arrêter (issue inconnue).
   */
  private async finish(run: WorkflowRunEntity, step: LauraJobStep, outcome: StepOutcome): Promise<boolean> {
    const scope = { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id }
    {
      run = (await this.runs.findOne({ where: scope })) ?? run
      const current = lauraJobBriefSchema.parse(run.job)
      const at = new Date().toISOString()
      // #2852.21/.23 — le coût RÉSERVÉ pour cette étape (même grille que
      // `rehold` juste plus bas, une seule lecture — GA-26). `creditsRefunded`
      // reste `null` sur `unknown` : un timeout n'est pas un échec, on ne sait
      // pas encore ce qui a été consommé, donc pas encore ce qui est rendu —
      // même silence que `finishedAt` juste en dessous.
      const stepCost = lauraJobStepCredits(step)
      const next: LauraJobBrief = {
        ...current,
        steps: current.steps.map(candidate =>
          candidate.key === step.key
            ? {
                ...candidate,
                status: outcome.status,
                note: outcome.note,
                creditsSpent: outcome.creditsSpent,
                creditsReserved: stepCost > 0 ? stepCost : null,
                creditsRefunded:
                  stepCost > 0 && outcome.status !== 'unknown'
                    ? Math.max(stepCost - (outcome.creditsSpent ?? 0), 0)
                    : null,
                finishedAt: outcome.status === 'unknown' ? null : at,
                awaiting: [],
                ...(outcome.produced ? { produced: outcome.produced } : {}),
              }
            : candidate,
        ),
        intermediateResults: outcome.summary
          ? [...current.intermediateResults, { stepKey: step.key, summary: outcome.summary, at }].slice(-50)
          : current.intermediateResults,
        errors: [
          ...current.errors,
          ...outcome.errors.map(message => ({ stepKey: step.key, message: message.slice(0, 500), at })),
        ].slice(-50),
        createdObjects: [...current.createdObjects, ...outcome.created].slice(0, 200),
      }
      const fed = outcome.produced ? lauraJobWithProducedIdentities(next, outcome.produced) : next
      const spent = run.spent_credits + (outcome.creditsSpent ?? 0)
      await this.runs.update(scope, { job: fed, spent_credits: spent })
      await this.rehold(run, fed, outcome.creditsSpent ?? 0, stepCost)
      if (outcome.status === 'unknown') {
        this.logger.warn('Étape de job en état inconnu — exécution interrompue', {
          tags: { 'laura_job.id': run.id, 'laura_job.step': step.key },
        })
        return false
      }
      return true
    }
  }

  /**
   * #3860.1 — garer un job qui attend : `running` → `planned`, puis un passage
   * remis en file avec un délai. Sans file (spec historique), rien ne peut
   * attendre : `false`, l'appelant rend l'étape `unknown` (jamais `failed`).
   */
  private async park(run: WorkflowRunEntity, data: LauraJobQueueData): Promise<boolean> {
    if (!this.enqueuer) return false
    const scope = { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id }
    const parked = await this.runs.update({ ...scope, status: 'running' }, { status: 'planned' })
    if (!parked.affected) return true // annulé entre-temps : plus rien à attendre
    await this.enqueuer.enqueue(data, { delayMs: ASYNC_POLL_DELAY_MS })
    return true
  }

  /**
   * #3860.1 / #3860.2 — relever les analyses qu'une étape attend. Toutes
   * terminées : l'issue de l'étape, avec les CONTACTS visibles des comptes
   * analysés (les cibles des étapes suivantes). Une encore en vol (ou
   * illisible) : `still_running`, sauf passé l'attente maximale — `unknown`.
   */
  private async collect(run: WorkflowRunEntity, step: LauraJobStep): Promise<StepOutcome | 'still_running'> {
    const ports = this.capabilities
    if (!ports) return timeoutOutcome()
    const states = await Promise.all(
      step.awaiting.map(async entry => ({
        entry,
        state: await ports
          .analysisState({
            userId: run.user_id,
            accountId: entry.accountId,
            runRef: entry.runRef,
            launchedAt: new Date(entry.launchedAt),
          })
          .catch(() => 'unknown' as const),
      })),
    )
    if (states.some(({ state }) => state === 'running' || state === 'unknown')) {
      const oldest = Math.min(...step.awaiting.map(entry => Date.parse(entry.launchedAt)))
      const waited = (Date.now() - oldest) / 1000
      return waited > LAURA_JOB_LIMITS.maxAsyncWaitSeconds ? timeoutOutcome() : 'still_running'
    }
    const analysed = states.filter(({ state }) => state === 'done').map(({ entry }) => entry.accountId)
    const summary = `${analysed.length}/${states.length}`
    if (analysed.length === 0) {
      const cancelled = states.every(({ state }) => state === 'cancelled')
      return {
        ...blockedOutcome(cancelled ? 'refused' : 'capability_failed'),
        status: cancelled ? 'blocked' : 'failed',
      }
    }
    const found = await this.contacts.find({
      where: { account_id: In(analysed), workspace_id: run.workspace_id, hidden: false, deleted_at: IsNull() },
    })
    const contactIds = found.map(contact => contact.id).slice(0, LAURA_JOB_LIMITS.maxContacts)
    return {
      status: 'done',
      note: null,
      // Le débit d'une analyse est celui de SON pipeline (créneau d'analyse), pas observé ici : non mesuré.
      creditsSpent: null,
      summary,
      errors: [],
      created: [],
      produced: { accountIds: analysed, contactIds },
    }
  }

  private async appendErrors(run: WorkflowRunEntity, stepKey: string, messages: string[]): Promise<void> {
    const scope = { id: run.id, workspace_id: run.workspace_id, user_id: run.user_id }
    const latest = await this.runs.findOne({ where: scope })
    if (!latest) return
    const brief = lauraJobBriefSchema.parse(latest.job)
    const at = new Date().toISOString()
    const errors = [...brief.errors, ...messages.map(message => ({ stepKey, message: message.slice(0, 500), at }))]
    await this.runs.update(scope, { job: { ...brief, errors: errors.slice(-50) } })
  }

  /**
   * Le worker est mort (ou le job BullMQ a calé) en pleine étape : on ne sait
   * pas ce qui est parti. L'étape en cours devient `unknown`, et le job aussi —
   * jamais `failed`, et rien ne se rejoue tout seul.
   */
  async markUnknown(data: LauraJobQueueData): Promise<void> {
    const scope = { id: data.jobId, workspace_id: data.workspaceId, user_id: data.userId }
    const run = await this.runs.findOne({ where: scope })
    if (!run || run.status !== 'running') return
    const brief = lauraJobBriefSchema.parse(run.job)
    const job: LauraJobBrief = {
      ...brief,
      steps: brief.steps.map(step =>
        step.status === 'running' ? { ...step, status: 'unknown', note: 'timeout' } : step,
      ),
    }
    const status = brief.steps.some(step => step.status === 'running') ? 'unknown' : lauraJobStateAfterStep(job)
    await this.runs.update({ ...scope, status: 'running' }, { job, status, finished_at: new Date() })
    await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
    // #2276.61 — un worker mort est aussi une fin : la cloche dit « ne sait pas », jamais le silence.
    await this.announce(run, status)
  }

  /** La fin d'un passage : l'état se déduit des étapes, la réservation restante se libère. */
  private async settle(data: LauraJobQueueData): Promise<void> {
    const scope = { id: data.jobId, workspace_id: data.workspaceId, user_id: data.userId }
    const run = await this.runs.findOne({ where: scope })
    if (!run || run.status !== 'running') return
    let brief = lauraJobBriefSchema.parse(run.job)
    let status: WorkflowRunStatus = lauraJobStateAfterStep(brief)
    if (TERMINAL.has(status) && status !== 'unknown') {
      // Ce qui ne peut plus partir est SAUTÉ (une dépendance n'a pas abouti) — pas raté.
      brief = lauraJobDropUnreachable(brief)
      status = lauraJobStateAfterStep(brief)
    }
    const finished = TERMINAL.has(status)
    await this.runs.update(
      { ...scope, status: 'running' },
      { job: brief, status, finished_at: finished ? new Date() : null },
    )
    if (finished) {
      await this.reservations.settle(run.workspace_id, run.correlation_id, 'released')
      await this.announce(run, status)
    }
  }

  /**
   * I3 — le pas coûteux vient de finir : sa part est soldée (consommée si un
   * débit a été observé, libérée sinon), et seul le RESTE des étapes à faire est
   * re-réservé. Le solde annoncé ne compte jamais un crédit débité ET réservé.
   */
  private async rehold(run: WorkflowRunEntity, brief: LauraJobBrief, debited: number, stepCost: number) {
    if (stepCost <= 0) return
    await this.reservations.settle(run.workspace_id, run.correlation_id, debited > 0 ? 'consumed' : 'released')
    const left = lauraJobRemainingCredits(brief)
    if (left > 0) {
      await this.reservations.reserve({
        workspaceId: run.workspace_id,
        userId: run.user_id,
        kind: 'enrichment',
        amount: left,
        reference: run.correlation_id,
      })
    }
  }

  private async writeStep(
    run: WorkflowRunEntity,
    brief: LauraJobBrief,
    key: string,
    patch: Partial<LauraJobStep>,
  ): Promise<void> {
    const job = { ...brief, steps: brief.steps.map(step => (step.key === key ? { ...step, ...patch } : step)) }
    await this.runs.update({ id: run.id, workspace_id: run.workspace_id, user_id: run.user_id }, { job })
  }

  /** Une étape = une capacité appliquée à ses cibles, chacune par le routeur. */
  private async execute(
    run: WorkflowRunEntity,
    brief: LauraJobBrief,
    step: LauraJobStep & { startedAt: string },
    data: LauraJobQueueData,
  ): Promise<StepOutcome | StepLaunched> {
    if (step.capability === 'read_workspace') return this.readWorkspace(run, brief)
    // #3860.1 — une capacité qui exige un filtre ne part jamais sans lui.
    if (lauraJobStepCriteriaMissing(step)) return blockedOutcome('missing_criteria')
    const owned = await this.ownedCapability(run, brief, step)
    if (owned) return owned
    // #2276.51 — « exécutable dans un job » se lit au contrat, comme la prévisualisation l'a dit.
    const intentFor = LAURA_JOB_CAPABILITIES[step.capability].executableInJob ? INTENT_OF[step.capability] : undefined
    if (!intentFor) return blockedOutcome('not_executable_in_job')
    // Jamais plus de cibles que le nombre annoncé — c'est ce que le coût confirmé couvre.
    const targets = brief.scope.contactIds.slice(0, step.units)
    if (targets.length === 0) return blockedOutcome('no_target_in_scope')

    const principal = { userId: data.userId, email: data.email, origin: 'user' as const }
    const stamp = new Date(step.startedAt).getTime()
    const results: ActionDispatchResult[] = []
    const created: StepOutcome['created'] = []
    for (const contactId of targets) {
      let result: ActionDispatchResult
      const intent = intentFor(contactId, step)
      try {
        // Une clé par cible ET par passage : un retry de la file ne rejoue rien,
        // une reprise (nouveau `startedAt`) relance ce qui n'avait pas abouti.
        result = await this.dispatcher.dispatch(
          { ...intent, idempotencyKey: `job:${run.id}:${step.key}:${contactId}:${stamp}`.slice(0, 200) },
          principal,
        )
      } catch (error) {
        // Une exception ne dit pas que rien n'est parti : inconnu, jamais échec.
        this.logger.warn(`Étape de job interrompue par une exception : ${(error as Error).message}`)
        result = { type: intent.type, status: 'unknown', reason: 'Issue inconnue.' }
      }
      if (result.status === 'done' && result.artifact?.kind === 'message_draft') {
        const kept = await this.keepDraft(run, contactId, result.artifact)
        if (kept) created.push({ kind: 'outreach_message', id: kept, label: result.artifact.subject ?? step.label })
        else result = { ...result, status: 'failed', reason: 'Le brouillon n’a pas pu être gardé.' }
      }
      if (result.status === 'done' && result.externalRef && step.capability === 'crm_write') {
        created.push({ kind: 'crm_note', id: result.externalRef.slice(0, 300), label: step.label })
      }
      results.push(result)
      if (result.status === 'unknown') break
    }
    return summarize(results, targets.length, created)
  }

  /**
   * #3860.1 — les capacités qui ne passent pas par le routeur d'actions (elles
   * ne visent pas un contact) : chacune par le service qui la possède. `null` =
   * capacité du routeur, traitée par la boucle par contact.
   */
  private async ownedCapability(
    run: WorkflowRunEntity,
    brief: LauraJobBrief,
    step: LauraJobStep,
  ): Promise<StepOutcome | StepLaunched | null> {
    const entry = LAURA_JOB_CAPABILITIES[step.capability]
    const handled =
      entry.targetsAccounts || step.capability === 'search_market_memory' || step.capability === 'need_matching'
    if (!handled && step.capability !== 'territory_snapshot') return null
    const ports = this.capabilities
    if (!ports) return blockedOutcome('not_executable_in_job')
    const criteria = step.criteria ?? {}
    try {
      if (entry.targetsAccounts) return await this.launchAnalyses(run, brief, step, ports)
      if (step.capability === 'search_market_memory') {
        const { technology, location, region, department } = criteria
        const read = await ports.searchMarketMemory({
          workspaceId: run.workspace_id,
          criteria: { technology, location, region, department },
        })
        return read ? doneOutcome(String(read.count)) : failedOutcome('Les observations du marché n’ont pas répondu.')
      }
      if (step.capability === 'need_matching') {
        const read = await ports.matchNeed({
          workspaceId: run.workspace_id,
          userId: run.user_id,
          needId: criteria.needId as string,
        })
        return read ? doneOutcome(String(read.recommended)) : failedOutcome('Besoin introuvable dans cet espace.')
      }
      const photo = await ports.latestTerritorySnapshot(criteria.department as string)
      if (!photo) {
        return {
          ...blockedOutcome('no_target_in_scope'),
          errors: ['Aucune photo hebdomadaire de ce département.'],
        }
      }
      // « non mesuré » n'est jamais 0 (GA-18).
      return doneOutcome(`${photo.takenOn} · ${photo.offers ?? '—'}`)
    } catch (error) {
      this.logger.warn(`Capacité de job en erreur : ${(error as Error).message}`)
      return failedOutcome('La source n’a pas répondu.')
    }
  }

  /** #3860.1 — une analyse par compte du périmètre (au plus `units`), lancée puis ATTENDUE. */
  private async launchAnalyses(
    run: WorkflowRunEntity,
    brief: LauraJobBrief,
    step: LauraJobStep,
    ports: LauraJobCapabilityPorts,
  ): Promise<StepOutcome | StepLaunched> {
    const targets = brief.scope.accountIds.slice(0, step.units)
    if (targets.length === 0) return blockedOutcome('no_target_in_scope')
    const awaiting: LauraJobStep['awaiting'] = []
    const errors: string[] = []
    for (const accountId of targets) {
      const launchedAt = new Date().toISOString()
      const started = await ports.startAnalysis({
        userId: run.user_id,
        workspaceId: run.workspace_id,
        accountId,
        refresh: step.capability === 'account_refresh',
      })
      if ('runRef' in started) awaiting.push({ accountId, runRef: started.runRef.slice(0, 300), launchedAt })
      else errors.push(started.refused)
    }
    if (awaiting.length === 0) return { ...blockedOutcome('refused'), errors }
    return { status: 'running', awaiting, errors }
  }

  /**
   * Lire l'espace : une VRAIE lecture, gratuite — les cibles du périmètre qui
   * sont ENCORE dans l'espace (un compte supprimé depuis la proposition n'est
   * pas compté). Le résumé est un décompte « comptes + contacts ».
   */
  private async readWorkspace(run: WorkflowRunEntity, brief: LauraJobBrief): Promise<StepOutcome> {
    const [accounts, contacts] = await Promise.all([
      brief.scope.accountIds.length > 0
        ? this.accounts.find({ where: { id: In(brief.scope.accountIds), workspace_id: run.workspace_id } })
        : Promise.resolve([]),
      brief.scope.contactIds.length > 0
        ? this.contacts.find({ where: { id: In(brief.scope.contactIds), workspace_id: run.workspace_id } })
        : Promise.resolve([]),
    ])
    return {
      status: 'done',
      note: null,
      creditsSpent: null,
      summary: `${accounts.length} + ${contacts.length}`,
      errors: [],
      created: [],
    }
  }

  private async keepDraft(
    run: WorkflowRunEntity,
    contactId: string,
    artifact: { channel: 'email' | 'linkedin' | 'phone'; subject: string | null; body: string },
  ): Promise<string | null> {
    if (!this.drafts) return null
    try {
      return await this.drafts.keep({
        userId: run.user_id,
        workspaceId: run.workspace_id,
        contactId,
        channel: artifact.channel,
        subject: artifact.subject,
        body: artifact.body,
      })
    } catch (error) {
      this.logger.warn(`Brouillon de job non gardé : ${(error as Error).message}`)
      return null
    }
  }

  /**
   * #2276.61 — la fin s'annonce : D'ABORD dans la cloche de l'app (la seule voie que toute personne a), PUIS aux
   * canaux que l'espace a branchés (même accusé que les runs).
   *
   * Recette prod 31/10 : « panneau ouvert 2-3 min après "Terminé", aucune ligne ». Trois trous, tous fermés ici :
   * la cloche n'était écrite que SI le job avait un fil d'origine ; un worker mort (`markUnknown`) n'annonçait
   * rien ; et un échec de la cloche était avalé sans trace (`.catch(() => undefined)`). Désormais l'échec se lit
   * dans le journal, et il ne fait jamais échouer le job (l'état est déjà posé).
   *
   * Pour LUI SEUL : `run.user_id`, celui qui a lancé le job — jamais un autre membre de l'espace.
   */
  private async announce(run: WorkflowRunEntity, status: WorkflowRunStatus): Promise<void> {
    const brief = lauraJobBriefSchema.safeParse(run.job)
    const label = brief.success ? brief.data.intent : run.definition_key
    const title = `${DONE_PREFIX[status] ?? 'Laura a terminé'} — ${label}`
    // #2276.62 — le résultat revient dans LA conversation qui a demandé le job (jamais un fil deviné) ; sans fil
    // d'origine, le lien actuel `/chat` : la fin est dite quand même, rien n'est inventé.
    if (this.jobReturnNotifier) {
      try {
        await this.jobReturnNotifier.notify(run.user_id, {
          // `title:` littéral : la garde `notification-titles-no-sensitive-data` lit ce site (aucune donnée sensible).
          title: `${DONE_PREFIX[status] ?? 'Laura a terminé'} — ${label}`,
          link: run.conversation_id
            ? chatNotificationLink({ conversationId: run.conversation_id, accountId: run.account_id ?? null })
            : '/chat',
        })
      } catch (error) {
        this.logger.warn(`Cloche du job ${run.id} non écrite : ${(error as Error).message}`)
      }
    }
    if (this.notifier) {
      void this.notifier
        .notifyUser(run.user_id, {
          type: LAURA_JOB_COMPLETED_EVENT,
          text: title,
          data: { runId: run.id, status, conversationId: run.conversation_id, link: '/chat' },
        })
        .catch((error: unknown) => {
          this.logger.warn(`Accusé du job ${run.id} non envoyé : ${(error as Error).message}`)
        })
    }
  }
}

/** #3860.1 — passé l'attente maximale (ou sans file pour attendre) : on ne sait pas, jamais « échoué ». */
function timeoutOutcome(): StepOutcome {
  return { status: 'unknown', note: 'timeout', creditsSpent: null, summary: null, errors: [], created: [] }
}

function doneOutcome(summary: string): StepOutcome {
  return { status: 'done', note: null, creditsSpent: null, summary, errors: [], created: [] }
}

/** Même entête que l'accusé des runs : il DIT le statut, il ne le maquille pas. */
const DONE_PREFIX: Partial<Record<WorkflowRunStatus, string>> = {
  done: '✅ Laura a terminé',
  partial: '⚠️ Laura a terminé en partie',
  failed: '❌ Laura n’a pas pu terminer',
  blocked: '⛔ Rien n’est parti',
  unknown: '❓ Laura ne sait pas si l’action est partie',
}

/**
 * Ce qu'une capacité fait sur UNE cible, par le routeur. Absente = la capacité
 * ne s'exécute pas (encore) dans un job : l'étape est BLOQUÉE, rien ne part,
 * rien n'est débité (l'analyse de compte, le rafraîchissement, le rapprochement
 * de besoins et l'instantané de territoire ont leurs propres files).
 *
 * `crm_write` écrit le LIBELLÉ de l'étape — le texte exact que la carte montrait
 * et que la personne a validé (prévisualisation figée) ; il n'est atteint
 * qu'après cette validation ({@link lauraJobAwaitsApproval}).
 */
const INTENT_OF: Partial<Record<LauraJobCapability, (contactId: string, step: LauraJobStep) => ActionIntent>> = {
  contact_enrichment: contactId => ({ type: 'enrich_contact', contactId }),
  message_generation: contactId => ({ type: 'generate_message', contactId, channel: 'email' }),
  crm_write: (contactId, step) => ({ type: 'create_crm_note', contactId, note: step.label }),
}

function blockedOutcome(note: LauraJobStepNote): StepOutcome {
  return { status: 'blocked', note, creditsSpent: null, summary: null, errors: [], created: [] }
}

function failedOutcome(message: string): StepOutcome {
  return {
    status: 'failed',
    note: 'capability_failed',
    creditsSpent: null,
    summary: null,
    errors: [message],
    created: [],
  }
}

function summarize(results: ActionDispatchResult[], targets: number, created: StepOutcome['created']): StepOutcome {
  const count = (status: string) => results.filter(result => result.status === status).length
  const done = count('done')
  const refused = count('skipped') + count('cancelled')
  // I4 — le débit OBSERVÉ ; aucun rapport de débit = null, jamais 0 inventé.
  const reported = results.filter(result => result.creditsDebited !== undefined)
  const creditsSpent =
    reported.length > 0 ? reported.reduce((sum, result) => sum + (result.creditsDebited ?? 0), 0) : null
  const errors = results
    .filter(result => result.status !== 'done' && result.reason)
    .map(result => result.reason as string)
  const summary = `${done}/${targets}`
  if (results.some(result => result.status === 'unknown')) {
    return { status: 'unknown', note: 'timeout', creditsSpent, summary, errors, created }
  }
  if (done > 0) return { status: 'done', note: null, creditsSpent, summary, errors, created }
  if (refused === results.length)
    return { status: 'blocked', note: 'refused', creditsSpent, summary: null, errors, created }
  return { status: 'failed', note: 'capability_failed', creditsSpent, summary: null, errors, created }
}
