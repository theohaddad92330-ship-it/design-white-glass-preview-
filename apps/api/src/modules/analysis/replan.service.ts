import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { type Queue } from 'bullmq'
import type { BackgroundJobAccepted, BackgroundJobStatus, StrategyScope } from '@bellum/contracts'
import { failure, isFailure, success, type Result } from '@bellum/utils'
import { AnalysisOnDemandService, type OnDemandFailure } from './analysis-ondemand.service'
import { REPLAN_JOB_OPTIONS, REPLAN_QUEUE, replanJobId, type ReplanJobData, type ReplanJobResult } from './replan.queue'

/** États BullMQ qui signifient « pas encore commencé ». */
const QUEUED_STATES = new Set(['waiting', 'waiting-children', 'delayed', 'prioritized'])

/**
 * Re-planification en tâche de fond : mise en file + suivi (#1092).
 *
 * Ce qui reste SYNCHRONE, et doit le rester : les refus qu'on connaît sans rien
 * calculer (espace de démonstration, compte inconnu, analyse pas terminée).
 * L'utilisateur les apprend immédiatement. Seule la phase 4 — la partie qui dure
 * une à deux minutes, plus que ce que la passerelle tolère — part dans un job.
 *
 * Autonome au sens de la règle #7 : le retirer supprime la file et l'endpoint de
 * suivi ; `AnalysisOnDemandService.replan` continue de fonctionner tel quel.
 */
@Injectable()
export class ReplanService {
  private readonly logger = new Logger(ReplanService.name)

  constructor(
    @InjectQueue(REPLAN_QUEUE) private readonly queue: Queue<ReplanJobData>,
    private readonly onDemand: AnalysisOnDemandService,
  ) {}

  /**
   * Vérifie ce qui est vérifiable tout de suite, puis met en file.
   *
   * Un job par compte : si un calcul est déjà en vol pour ce dossier, on renvoie
   * CE job au lieu d'en lancer un second — deux phases 4 concurrentes
   * écriraient le même plan l'une par-dessus l'autre, et coûteraient deux appels
   * modèle pour une seule réponse utile.
   */
  async enqueue(
    accountId: string,
    userId: string,
    strategy?: StrategyScope,
  ): Promise<Result<BackgroundJobAccepted, OnDemandFailure>> {
    const preflight = await this.onDemand.preflightReplan(accountId, userId)
    if (isFailure(preflight)) return preflight

    const jobId = replanJobId(accountId)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active') return success({ job_id: jobId, state: 'running' })
      if (QUEUED_STATES.has(state)) return success({ job_id: jobId, state: 'queued' })
      // Terminé : la place est libérée pour cette tentative, sinon `add()`
      // renverrait silencieusement l'ancien résultat au clic suivant.
      await existing.remove()
    }

    await this.queue.add(
      'replan',
      { accountId, userId, ...(strategy ? { strategy } : {}) },
      { ...REPLAN_JOB_OPTIONS, jobId },
    )
    return success({ job_id: jobId, state: 'queued' })
  }

  /**
   * État du job de re-planification de ce compte.
   *
   * Un échec est rendu comme l'échec typé d'origine, pas comme un état : le
   * contrôleur le rejoue en statut HTTP, si bien que le client garde exactement
   * le chemin d'erreur qu'il avait quand l'appel était synchrone.
   */
  async status(
    accountId: string,
    userId: string,
  ): Promise<Result<BackgroundJobStatus<{ replanned: true }>, OnDemandFailure>> {
    // Portée stricte : on ne révèle pas l'état d'un calcul sur le dossier de
    // quelqu'un d'autre. `preflightReplan` refait la même vérification
    // d'appartenance que l'enqueue.
    const owned = await this.onDemand.preflightReplan(accountId, userId)
    if (isFailure(owned) && owned.problem.code === 'not_found') return owned

    const jobId = replanJobId(accountId)
    const job = await this.queue.getJob(jobId)
    // Aucune trace : le résultat a expiré (ou Redis a été vidé). On ne l'appelle
    // pas « échoué » — c'est NOTRE réponse qui manque, et le plan a peut-être
    // été enregistré. L'écran invite à regarder, jamais à relancer.
    if (!job) return success({ state: 'unknown', job_id: jobId })

    const state = await job.getState()
    if (state === 'active') return success({ state: 'running', job_id: jobId })
    if (QUEUED_STATES.has(state)) return success({ state: 'queued', job_id: jobId })

    if (state === 'completed') {
      const outcome = job.returnvalue as ReplanJobResult | undefined
      if (outcome?.ok === true) return success({ state: 'done', job_id: jobId, result: { replanned: true } })
      if (outcome?.ok === false) return failure(outcome.failure)
      this.logger.error('Replan job completed without a usable result', { accountId, jobId })
      return failure({ code: 'ia_failed', message: 'Impossible de re-générer la stratégie.' })
    }

    // `failed` = le worker a levé (panne d'infra). Le plan n'a PAS été écrit :
    // c'est bien un échec, et il se dit comme tel.
    this.logger.warn('Replan job failed', { accountId, jobId, state })
    return failure({ code: 'ia_failed', message: 'Impossible de re-générer la stratégie.' })
  }
}
