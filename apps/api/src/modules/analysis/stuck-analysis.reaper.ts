import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { type JobType, type Queue } from 'bullmq'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ANALYSIS_INTERRUPTED_MESSAGE } from '../accounts/accounts.service'
import { CreditsService } from '../credits/credits.service'
import { AnalysisRunsService } from './analysis-runs.service'
import { JOB_TIMEOUT_MS } from './analysis.constants'

/** How often the reaper sweeps for stuck rows. Far coarser than the outbox
 *  drainer (2s) — a stuck account is a rare tail event, and the staleness cutoff
 *  is measured in minutes, so a per-minute sweep is more than timely enough. */
const REAP_INTERVAL_MS = 60_000

/** Never flip more than this many rows per sweep — a hard cap so a pathological
 *  backlog (e.g. a mass worker outage) can't turn one tick into a giant write. */
const BATCH_SIZE = 100

/** BullMQ job states that count as "still has a live job" — a row backed by any
 *  of these is genuinely in flight and must NOT be reaped. Mirrors
 *  ``ACTIVE_JOB_STATES`` in analysis.service.ts (+ ``paused``, which is still a
 *  live job that could resume). */
const LIVE_JOB_STATES: JobType[] = ['active', 'waiting', 'waiting-children', 'delayed', 'prioritized', 'paused']

/**
 * Durable safety net for the "analyse en cours" ghost (Théo bug): an account can
 * only leave DB ``status='analyzing'`` through a worker-driven terminal event
 * (``onFailed`` → markErrored, plan persistence, ``cancelByUser`` → markCancelled).
 * If the worker never fires that event — Redis evicted the job, or Railway
 * redeployed the worker mid-run — the row stays ``analyzing`` FOREVER, keeps
 * surfacing as a live analysis in the UI, and can be neither followed nor
 * cancelled. There was no reaper.
 *
 * #2478 — ``onFailed`` now DELIBERATELY joins that same "never fired a verdict"
 * set on an ``unknown`` outcome (a request left without a response — see
 * ``classifyAnalysisFailureOutcome``): it logs and returns without touching
 * ``status``, precisely so THIS reaper is the one that resolves the account —
 * from what actually landed in ``raw_analysis``, never from a guess made the
 * instant BullMQ gave up.
 *

 * This service sweeps every {@link REAP_INTERVAL_MS} and flips any account that is
 *  1. still ``status='analyzing'``,
 *  2. older than {@link JOB_TIMEOUT_MS} on ``updated_at`` (the trigger bumps it on
 *     every write, so a live run keeps it fresh), AND
 *  3. backed by NO live BullMQ job,
 * to ``status='error'`` with a clear, localizable "analyse interrompue, relancez"
 * message. The account's latest ``analysis_runs`` row is mirrored to ``error`` too.
 *
 * Mirrors {@link OutboxDrainer}: an ``@Interval`` tick with a re-entrancy guard,
 * and a public {@link reap} for tests / manual triggers.
 *
 * **SANS VERROU :** chaque écriture est une TRANSITION GARDÉE —
 * ``update({ id, status: 'analyzing' }, terminal)``, dont ``result.affected``
 * départage les répliques : la seconde ne trouve plus de ligne `analyzing` et
 * s'arrête là. C'est ce qui rend le REMBOURSEMENT exactement-une-fois, qui est
 * la seule écriture non convergente du balayage — un crédit rendu deux fois est
 * un crédit offert. La garde est donc dans la clause `WHERE`, pas dans Redis, et
 * elle tient aussi contre le worker et contre la réparation à la lecture, que
 * jamais aucun verrou de cron n'aurait couverts. Un verrou singleton retarderait
 * en plus la sortie des dossiers fantômes d'un tick entier sur les répliques
 * perdantes, pour ne rien protéger de plus. Held by GA-76.
 */
@Injectable()
export class StuckAnalysisReaper {
  private readonly logger = new Logger(StuckAnalysisReaper.name)
  /** Re-entrancy guard: the Interval can fire again while a slow sweep (large DB /
   *  Redis latency) is still running; we no-op and let the next tick resume. */
  private inFlight = false

  constructor(
    @InjectQueue('analysis') private readonly queue: Queue,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly runs: AnalysisRunsService,
    private readonly credits: CreditsService,
  ) {}

  @Interval(REAP_INTERVAL_MS)
  async tick(): Promise<void> {
    if (this.inFlight) return
    this.inFlight = true
    try {
      await this.reap()
    } catch (err) {
      this.logger.error('Stuck-analysis reaper tick failed', { error: err })
    } finally {
      this.inFlight = false
    }
  }

  /**
   * Résout chaque compte bloqué en ``analyzing`` (passé le plafond, sans job
   * vivant) — vers ``completed`` si son dossier est en réalité COMPLET, vers
   * ``error`` sinon. Public pour les tests + un déclenchement manuel. ``now`` est
   * injectable pour rendre la frontière de péremption déterministe en test.
   */
  async reap(now: number = Date.now()): Promise<{ reaped: number; reconciled: number }> {
    const cutoff = new Date(now - JOB_TIMEOUT_MS)

    const candidates = await this.accounts
      .createQueryBuilder('account')
      .where('account.status = :status', { status: 'analyzing' })
      .andWhere('account.updated_at < :cutoff', { cutoff })
      // Lot D01 (06/10/2026) — une salle de démonstration porte UN compte semé « en cours
      // d'analyse » (#3666) : aucun job ne tourne pour lui, le faucher le passerait en
      // erreur (et rembourserait un crédit que personne n'a débité) au bout de vingt minutes.
      .andWhere('NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.id = account.workspace_id AND w.is_demo = true)')
      .orderBy('account.updated_at', 'ASC')
      .take(BATCH_SIZE)
      .getMany()

    // Which of these accounts still have a live BullMQ job? A job the worker is
    // (or will be) processing must never be reaped — its terminal event is still
    // coming. Reading the queue once per sweep keeps this cheap.
    //
    // ⚠️ Lu à CHAQUE tick, même sans compte bloqué : le balayage des runs en
    // dépend, et il a sa propre population (03/11/2026, voir plus bas).
    const liveAccountIds = await this.liveAccountIds(now)

    let reaped = 0
    let reconciled = 0
    for (const account of candidates) {
      if (liveAccountIds.has(account.id)) continue

      // Le plan et le statut du compte sont écrits par deux chemins distincts,
      // donc ils peuvent diverger : un compte peut porter un dossier COMPLET tout
      // en étant resté `analyzing`. Le faucher détruirait un dossier valide — on
      // le réconcilie vers son vrai état.
      const complete = Boolean((account.raw_analysis as { plan?: unknown } | null)?.plan)
      const terminal = complete
        ? { status: 'completed' as const, error_message: null }
        : { status: 'error' as const, error_message: ANALYSIS_INTERRUPTED_MESSAGE }

      // Guard the write on ``status='analyzing'`` so we never clobber a row that a
      // worker flipped terminal in the gap between the SELECT and this UPDATE.
      const result = await this.accounts.update({ id: account.id, status: 'analyzing' }, terminal)
      if (!result.affected) continue

      // Mirror the terminal state onto the append-only run history (best-effort —
      // completeLatest swallows its own errors and never throws).
      await this.runs.completeLatest(account.id, { status: terminal.status })
      if (complete) {
        reconciled += 1
        this.logger.warn('Reconciled a complete dossier left stuck in analyzing', {
          accountId: account.id,
          updatedAt: account.updated_at,
        })
      } else {
        reaped += 1
        // Rendre le crédit d'analyse : ce run est mort sans rien produire.
        // Le worker rembourse déjà sur échec TERMINAL (`analysis.worker.ts`),
        // mais ce faucheur existe précisément pour les runs dont le worker n'a
        // JAMAIS émis son événement terminal (éviction Redis, redeploy en plein
        // run) — donc dans le seul cas que le worker ne couvre pas, personne ne
        // remboursait : l'utilisateur payait 1 crédit pour un dossier vide
        // (règle Théo §7 « rembourser si échec non utilisateur »).
        //
        // Exactement UNE fois par compte : le remboursement est conditionné à la
        // transition gardée `status='analyzing'` ci-dessus (``result.affected``),
        // que seul UN chemin peut gagner — worker, réparation à la lecture ou ce
        // balayage. Best-effort comme le reste du faucheur : un échec de
        // facturation ne doit pas empêcher de débloquer les dossiers fantômes.
        try {
          await this.credits.refundAnalysisSlot(account.user_id, {
            reason: `run interrompu (faucheur): ${account.company_name ?? account.id}`,
            accountId: account.id,
          })
        } catch (err) {
          this.logger.warn('Failed to refund analysis slot for a reaped run', {
            accountId: account.id,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        this.logger.warn('Reaped stuck analysis (no live job past job ceiling)', {
          accountId: account.id,
          updatedAt: account.updated_at,
        })
      }
    }

    if (reaped > 0 || reconciled > 0) {
      this.logger.log('Stuck-analysis reaper swept', { reaped, reconciled, candidates: candidates.length })
    }

    // LES RUNS, APRÈS LES COMPTES — et dans cet ordre (03/11/2026).
    //
    // Le fauchage ci-dessus a déjà fermé le DERNIER run de chaque compte qu'il a
    // résolu (`completeLatest`) ; ce balayage-ci ne ramasse donc que le résidu :
    // les runs que personne ne ferme jamais. C'est la population que l'alerte
    // `job_bloque` mesure, et elle n'avait aucun faucheur.
    //
    // Hors du `return` : son compte n'entre PAS dans `{reaped, reconciled}`, qui
    // décrivent des comptes. Un run fermé n'est pas un dossier débloqué, et aucun
    // crédit ne se rembourse ici — le remboursement est gardé par la transition
    // du COMPTE, une seule fois, plus haut.
    await this.reapRuns(cutoff, liveAccountIds)

    return { reaped, reconciled }
  }

  /** Ferme les runs restés `analyzing` au-delà du plafond que le fauchage par
   *  compte ne pouvait pas voir. Best-effort : jamais au prix du reste du tick. */
  private async reapRuns(cutoff: Date, liveAccountIds: Set<string>): Promise<void> {
    try {
      const { reconciled, failed } = await this.runs.reconcileStaleRuns(cutoff, [...liveAccountIds], BATCH_SIZE)
      if (reconciled > 0 || failed > 0) {
        this.logger.warn('Closed analysis runs left stuck in analyzing', { reconciled, failed })
      }
    } catch (err) {
      this.logger.warn('Stale-run sweep failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * The set of accountIds backed by a job that can still deliver a terminal event.
   *
   * "Has a job in a live state" is NOT the same question, and conflating the two
   * left the reaper blind to the exact failure it exists to catch. When the worker
   * PROCESS dies mid-job (Railway redeploy, OOM, container kill), nobody is left to
   * run BullMQ's stalled-check, so the job stays `active` in Redis forever. The
   * account then has a "live job" on every sweep, is skipped on every sweep, and
   * stays `analyzing` permanently — the one shape of worker death with no other
   * backstop was the one shape immune to the backstop.
   *
   * ``processedOn`` is when a worker picked the job up; it is unset while the job
   * is merely queued (waiting / delayed / prioritized), and those are genuinely
   * live — they simply haven't started. A job that HAS started and has outlived
   * {@link JOB_TIMEOUT_MS} cannot still be legitimately running: the worker bounds
   * itself with ``AbortSignal.timeout(JOB_TIMEOUT_MS)``, so either it fired its
   * terminal event already or the process that owed us one is gone.
   *
   * Erring toward "live" on missing evidence keeps the guarantee that matters: a
   * run in progress is never reaped out from under its worker.
   */
  private async liveAccountIds(now: number): Promise<Set<string>> {
    const jobs = await this.queue.getJobs(LIVE_JOB_STATES)
    const ids = new Set<string>()
    for (const job of jobs) {
      const accountId = job?.data?.accountId
      if (typeof accountId !== 'string' || !accountId) continue
      const startedAt = job.processedOn
      if (typeof startedAt === 'number' && Number.isFinite(startedAt) && now - startedAt > JOB_TIMEOUT_MS) {
        this.logger.warn('Ignoring an orphaned in-flight analysis job past the job ceiling', {
          accountId,
          jobId: job.id,
          startedAt: new Date(startedAt).toISOString(),
        })
        continue
      }
      ids.add(accountId)
    }
    return ids
  }
}
