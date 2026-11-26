import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import {
  NEED_AUTO_MATCH_ROUTINE_KEY,
  needAutoMatchArrivalStatus,
  type NeedAutoMatch,
  type NeedAutoMatchStatus,
} from '@bellum/contracts'
import { NeedAutoMatchEntity } from '../../../database/entities/need-auto-match.entity'
import type { ProjectNeedEntity } from '../../../database/entities/project-need.entity'
import { BULK_MATCHING_QUEUE } from './bulk-matching.queue'
import {
  AUTO_NEED_MATCH_JOB,
  AUTO_NEED_MATCH_JOB_OPTIONS,
  AUTO_NEED_MATCH_TIMEOUT_MS,
  autoNeedMatchJobId,
  type AutoNeedMatchJobData,
} from './auto-need-matching.queue'
import { MatchingService } from './matching.service'

/** Ce que l'arrivée d'un besoin transporte — la ligne insérée, rien de plus. */
export type ArrivedNeed = Pick<
  ProjectNeedEntity,
  'id' | 'workspace_id' | 'owner_id' | 'skills' | 'seniority' | 'location' | 'remote' | 'start_on'
>

const TIMED_OUT = Symbol('auto-need-match-timeout')

/**
 * #2916 / #2399.2 — « MATCHER UN BESOIN ENTRANT », ÉCRIT AUTOMATIQUEMENT.
 *
 * DÉCISION LOUIS 11/10/2026 (`c93_matching_auto_besoin_entrant`) : quand la
 * routine `incoming_need_matching` est activée par un membre de l'espace,
 * chaque besoin qui ENTRE voit un `MatchRun` écrit sans geste humain.
 * ⚠️ Renversement daté de « les routines préparent, aucune n'écrit », pour
 * CETTE automatisation seulement — et rien ne SORT : aucun e-mail, aucun
 * message, aucune shortlist, aucun positionnement.
 *
 * Trois gestes :
 *  - `onNeedCreated` — appelé par `NeedArrivalSubscriber` APRÈS le commit de
 *    l'insertion (toutes les portes : saisie, import, compte-rendu, appel
 *    d'offres, Laura). Décide (`needAutoMatchArrivalStatus`), RÉSERVE la ligne
 *    du besoin, met en file. Ne lève jamais : une automatisation en panne ne
 *    fait pas échouer la création d'un besoin.
 *  - `process` — le travail du job : `MatchingService.matchNeed`, le MÊME
 *    chemin que le bouton « Lancer le matching », jamais un second moteur.
 *  - `latestFor` — ce que la fiche besoin lit.
 *
 * Coût : zéro appel modèle, zéro crédit (classement déterministe) ; plafond
 * quotidien par espace (`AUTO_NEED_MATCH_DAILY_CAP`, contrat).
 */
@Injectable()
export class AutoNeedMatchingService {
  private readonly logger = new Logger(AutoNeedMatchingService.name)

  constructor(
    @InjectRepository(NeedAutoMatchEntity) private readonly autoMatches: Repository<NeedAutoMatchEntity>,
    @InjectQueue(BULK_MATCHING_QUEUE) private readonly queue: Queue<AutoNeedMatchJobData>,
    private readonly matching: MatchingService,
  ) {}

  async onNeedCreated(need: ArrivedNeed, now: Date = new Date()): Promise<NeedAutoMatchStatus | null> {
    const workspaceId = need.workspace_id
    if (!workspaceId) return null
    try {
      const userId = await this.activatorFor(workspaceId, need.owner_id)
      if (!userId) return null

      // `skills ?? []` : une insertion qui n'a pas posé la colonne (l'import de
      // fichier) laisse le défaut SQL — l'entité en mémoire peut ne pas le porter.
      const status = needAutoMatchArrivalStatus(
        { ...need, skills: need.skills ?? [] },
        await this.launchedToday(workspaceId, now),
      )
      // La RÉSERVATION fait l'idempotence : seul celui qui insère met en file.
      const inserted = await this.autoMatches.manager.query<{ need_id: string }[]>(
        `INSERT INTO need_auto_matches (need_id, workspace_id, user_id, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (need_id) DO NOTHING
         RETURNING need_id`,
        [need.id, workspaceId, userId, status],
      )
      if (inserted.length === 0) return null
      if (status !== 'queued') return status

      try {
        await this.queue.add(
          AUTO_NEED_MATCH_JOB,
          { needId: need.id, workspaceId, userId },
          { ...AUTO_NEED_MATCH_JOB_OPTIONS, jobId: autoNeedMatchJobId(need.id) },
        )
        return 'queued'
      } catch (error) {
        this.logger.warn(`Matching automatique non mis en file pour ${need.id} : ${(error as Error).message}`)
        await this.settle(need.id, workspaceId, 'failed', null, 'queued')
        return 'failed'
      }
    } catch (error) {
      this.logger.warn(`Matching automatique ignoré pour ${need.id} : ${(error as Error).message}`)
      return null
    }
  }

  /**
   * Le travail d'UN job. Une vraie erreur REMONTE (BullMQ réessaie) ; un délai
   * dépassé ne lève pas — `unknown`, la reprise s'arrête, et une issue tardive
   * remplace l'inconnu.
   */
  async process(
    data: AutoNeedMatchJobData,
    timeoutMs: number = AUTO_NEED_MATCH_TIMEOUT_MS,
  ): Promise<NeedAutoMatchStatus> {
    const { needId, workspaceId, userId } = data
    const [row] = await this.autoMatches.manager.query<{ status: NeedAutoMatchStatus; user_id: string }[]>(
      `SELECT status, user_id FROM need_auto_matches WHERE need_id = $1 AND workspace_id = $2`,
      [needId, workspaceId],
    )
    if (!row) return 'failed'
    // Déjà tranché (une tentative de plus, un job rejoué) : rien ne se réécrit.
    if (row.status !== 'queued') return row.status

    const running = this.matching.matchNeed(needId, workspaceId, userId, { canReadFinance: false })
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof TIMED_OUT>(resolve => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs)
    })
    let outcome: Awaited<typeof running> | typeof TIMED_OUT
    try {
      outcome = await Promise.race([running, deadline])
    } finally {
      clearTimeout(timer)
    }

    if (outcome === TIMED_OUT) {
      await this.settle(needId, workspaceId, 'unknown', null, 'queued')
      running
        .then(run => (run ? this.settle(needId, workspaceId, 'done', run.runId, 'unknown') : undefined))
        .catch(error => this.logger.warn(`Matching automatique tardif en échec : ${(error as Error).message}`))
      return 'unknown'
    }
    if (!outcome) {
      await this.settle(needId, workspaceId, 'failed', null, 'queued')
      return 'failed'
    }
    await this.settle(needId, workspaceId, 'done', outcome.runId, 'queued')
    return 'done'
  }

  /** Après la DERNIÈRE tentative en erreur (`BulkMatchingWorker.onFailed`). */
  async markFailed(data: AutoNeedMatchJobData): Promise<void> {
    await this.settle(data.needId, data.workspaceId, 'failed', null, 'queued')
  }

  /** Ce que la fiche besoin lit ; `null` = l'automatisation n'a jamais pris ce besoin. */
  async latestFor(needId: string, workspaceId: string): Promise<NeedAutoMatch | null> {
    const [row] = await this.autoMatches.manager.query<
      {
        status: NeedAutoMatchStatus
        run_id: string | null
        created_at: Date
        updated_at: Date
        evaluated_count: number | null
        recommended_count: string | null
        borderline_count: string | null
      }[]
    >(
      `SELECT a.status, a.run_id, a.created_at, a.updated_at, r.evaluated_count,
              CASE WHEN r.id IS NULL THEN NULL ELSE
                (SELECT count(*) FROM match_run_entries e WHERE e.run_id = r.id AND e.bucket = 'recommended') END
                AS recommended_count,
              CASE WHEN r.id IS NULL THEN NULL ELSE
                (SELECT count(*) FROM match_run_entries e WHERE e.run_id = r.id AND e.bucket = 'borderline') END
                AS borderline_count
         FROM need_auto_matches a
         LEFT JOIN match_runs r ON r.id = a.run_id AND r.workspace_id = a.workspace_id
        WHERE a.need_id = $1 AND a.workspace_id = $2`,
      [needId, workspaceId],
    )
    if (!row) return null
    const settled = row.status !== 'queued'
    return {
      status: row.status,
      runId: row.run_id,
      launchedAt: new Date(row.created_at).toISOString(),
      settledAt: settled ? new Date(row.updated_at).toISOString() : null,
      evaluatedCount: row.evaluated_count ?? null,
      recommendedCount: row.recommended_count == null ? null : Number(row.recommended_count),
      borderlineCount: row.borderline_count == null ? null : Number(row.borderline_count),
    }
  }

  /**
   * Le membre qui a ACTIVÉ la routine dans cet espace — `null` si personne.
   * Une ligne ABSENTE n'est pas « active » : la routine est désactivée par
   * défaut, seul un geste explicite l'allume. Le propriétaire du besoin est
   * préféré quand il l'a lui-même activée ; sinon, le premier qui l'a fait.
   */
  private async activatorFor(workspaceId: string, ownerId: string | null): Promise<string | null> {
    const rows = await this.autoMatches.manager.query<{ user_id: string }[]>(
      `SELECT rs.user_id
         FROM routine_subscriptions rs
         JOIN workspace_members wm ON wm.user_id = rs.user_id AND wm.workspace_id = $1
        WHERE rs.routine_key = $3 AND rs.status = 'active'
        ORDER BY COALESCE(rs.user_id = $2::uuid, false) DESC, rs.updated_at ASC
        LIMIT 1`,
      [workspaceId, ownerId, NEED_AUTO_MATCH_ROUTINE_KEY],
    )
    return rows[0]?.user_id ?? null
  }

  /** Les runs automatiques RÉELLEMENT lancés aujourd'hui (UTC) dans l'espace. */
  private async launchedToday(workspaceId: string, now: Date): Promise<number> {
    const [row] = await this.autoMatches.manager.query<{ count: string }[]>(
      `SELECT count(*) AS count FROM need_auto_matches
        WHERE workspace_id = $1
          AND created_at >= date_trunc('day', $2::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
          AND status NOT IN ('capped', 'no_criteria')`,
      [workspaceId, now.toISOString()],
    )
    return Number(row?.count ?? 0)
  }

  /** Écrit l'issue — SEULEMENT depuis l'état attendu, jamais par-dessus une autre. */
  private async settle(
    needId: string,
    workspaceId: string,
    status: NeedAutoMatchStatus,
    runId: string | null,
    onlyFrom: NeedAutoMatchStatus,
  ): Promise<void> {
    await this.autoMatches.manager.query(
      `UPDATE need_auto_matches
          SET status = $3, run_id = COALESCE($4::uuid, run_id), updated_at = now()
        WHERE need_id = $1 AND workspace_id = $2 AND status = $5`,
      [needId, workspaceId, status, runId, onlyFrom],
    )
  }
}
