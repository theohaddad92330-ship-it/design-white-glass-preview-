import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OutboxEntity } from '../../database/entities/outbox.entity'

/** Phases the worker can resume past — same set the persistence layer
 *  enqueues ``analysis.phase_completed`` events for. */
type ResumablePhase = 'research' | 'contacts' | 'classify'

const RESUMABLE_PHASES: readonly ResumablePhase[] = ['research', 'contacts', 'classify']

/**
 * Reads ``analysis.phase_completed`` events from the outbox to figure out
 * which phases of an analysis have already finished. This is the single
 * source of truth for the resume flow — events exist iff the matching
 * data write committed (atomically inside the persistence service's TX).
 *
 * Indexed by the partial expression index
 * ``outbox_analysis_phase_account_idx`` so the lookup is O(log N) even
 * with a large outbox table. See ``infra/supabase/migrations/<TS>_outbox_analysis_phase_account_idx.sql``.
 */
@Injectable()
export class AnalysisCheckpointReader {
  private readonly logger = new Logger(AnalysisCheckpointReader.name)

  constructor(
    @InjectRepository(OutboxEntity)
    private readonly outbox: Repository<OutboxEntity>,
  ) {}

  /** Returns the set of phases (research / contacts / classify) that already
   *  completed for this account **during this job**. ``plan`` is intentionally
   *  NOT resumable — Phase 4 success flips ``status = 'completed'`` and the
   *  resume endpoint rejects accounts in that state upfront.
   *
   *  The ``jobId`` bound is load-bearing, not a refinement. Scoped to the
   *  account alone, this returned every phase the account had EVER completed,
   *  so relaunching an already-analysed account computed ``resume: true``, the
   *  graph reopened its (durable, append-only) thread and skipped all four
   *  phases — a no-op run that persisted nothing while reporting success and
   *  leaving the account stuck in ``analyzing``. Bounded to the job, resume
   *  means what it says: THIS run was interrupted and is picking itself back
   *  up. BullMQ retries keep the same job id, so self-healing after a severed
   *  stream is unchanged; a brand-new analysis starts from zero.
   *
   *  Without a job id there is no safe bound, so nothing is resumed: re-running
   *  a phase costs credits, skipping one silently costs the whole dossier. */
  async loadCompletedPhases(accountId: string, jobId: string, since: Date | null): Promise<Set<ResumablePhase>> {
    const phases = await this.loadCompletedPhaseNames(accountId, jobId, since)

    const done = new Set<ResumablePhase>()
    for (const phase of phases) {
      if ((RESUMABLE_PHASES as readonly string[]).includes(phase)) {
        done.add(phase as ResumablePhase)
      }
    }
    if (done.size > 0) {
      this.logger.log('Resume checkpoint loaded from outbox', {
        accountId,
        jobId,
        alreadyDone: Array.from(done),
      })
    }
    return done
  }

  /**
   * Every phase this job has checkpointed, unfiltered — including ``plan``,
   * which {@link loadCompletedPhases} deliberately excludes because resuming
   * past it is unsafe.
   *
   * This is the **persisted answer to "where is this run?"**. A checkpoint row
   * exists iff that phase's data write committed (same TX as the outbox insert),
   * so it is evidence of work actually done, not a guess. ``getStatus`` reads it
   * to seed a client that joined late — the Socket.IO stream is an accelerator
   * for live updates, never the record of what happened.
   *
   * Job-scoped for the same reason resume is: without the ``jobId`` bound this
   * returns every phase the account EVER completed, so a fresh run on a
   * previously-analysed account would report itself already finished.
   */
  async loadCompletedPhaseNames(accountId: string, jobId: string, since: Date | null): Promise<string[]> {
    if (!jobId) return []
    // Sans frontière de run, aucun point de contrôle n'est attribuable : le
    // `jobId` est déterministe (même utilisateur + même entreprise = même
    // identifiant), donc à lui seul il ne distingue pas le run d'aujourd'hui de
    // celui du mois dernier. C'est ce trou qui faisait qu'une relance
    // s'affichait à 100 % dès la première seconde et sautait ses trois
    // premières phases. « Je ne sais pas » vaut ici « rien de fait » : rejouer
    // une phase coûte cher, en sauter une à tort coûte le dossier.
    if (!since) return []

    const rows = await this.outbox
      .createQueryBuilder('o')
      .select(`DISTINCT o.payload->>'phase'`, 'phase')
      .where(`o.event_type = :type`, { type: 'analysis.phase_completed' })
      .andWhere(`o.payload->>'accountId' = :accountId`, { accountId })
      .andWhere(`o.payload->>'jobId' = :jobId`, { jobId })
      // Bornée au run COURANT. Aucune marge de tolérance n'est appliquée :
      // « Actualiser » se clique parfois quelques secondes après la fin du run
      // précédent, si bien qu'une marge de complaisance ré-admettrait
      // exactement les points de contrôle qu'on exclut ici. L'erreur d'horloge
      // possible penche donc du côté sûr — au pire une phase est rejouée.
      .andWhere(`o.created_at >= :since`, { since })
      .getRawMany<{ phase: string }>()

    return rows.map(r => r.phase).filter((p): p is string => typeof p === 'string' && p.length > 0)
  }
}
