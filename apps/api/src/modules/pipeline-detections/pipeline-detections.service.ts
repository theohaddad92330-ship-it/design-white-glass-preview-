import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { firstReturnedRow } from '../../database/returned-rows'
import {
  PIPELINE_DETECTION_TO_REVIEW_SQL,
  PIPELINE_INTEREST_CALL_OUTCOMES,
  type PipelineDetection,
  type PipelineDetectionKind,
} from '@bellum/contracts'

/**
 * #4016 L6 — LE PIPE « DÉTECTÉ, À REVOIR ».
 *
 * ⚠️⚠️ RENVERSEMENT DATÉ (Louis 11/10/2026) de #2320.22, #2377.8 et #2320.3 :
 * Bellum écrit SEUL, dans le pipe, le passage qu'un signal fort rend probable.
 *
 *  · intérêt → opportunité : un appel dont l'issue dit un intérêt
 *    (`PIPELINE_INTEREST_CALL_OUTCOMES`), sur un compte où aucune affaire n'a
 *    été ouverte depuis ;
 *  · shortlist → positionnement : un profil d'une shortlist PARTAGÉE, rattachée
 *    à une affaire, qui n'est pas encore positionné dessus ;
 *  · entretien → mission : un entretien POSITIF dont le positionnement n'a
 *    aucune mission.
 *
 * Ce service n'écrit QUE dans `pipeline_detections`, et seulement des lignes
 * `detected` (le statut prend son défaut SQL, jamais écrit ici par le
 * balayage). Il n'ouvre aucune affaire, ne positionne personne, ne crée aucune
 * mission : ces gestes restent ceux d'un humain, appelés depuis un CONTRÔLEUR
 * (`pipeline-detections.controller.ts`, gardes `project-creation-is-a-human-
 * gesture`, `chaine-commerciale-interne-pas-de-transition-automatique`). Il
 * n'écrit rien dans le CRM du client.
 *
 * Une ligne écartée ne revient pas : l'unicité `(workspace_id, kind,
 * source_key)` tient aussi après la décision.
 */

/** Fenêtre de lecture : un signal plus vieux n'a plus rien à faire dans le pipe. */
const LOOKBACK_DAYS = 30
/** Lignes à revoir rendues par l'écran — au-delà, personne ne lit. */
const LIST_LIMIT = 50

/** Par passage : lignes écrites, ou `null` si la lecture a échoué (non mesuré, jamais 0). */
type PipelineSweepResult = Record<PipelineDetectionKind, number | null>

type DetectionRow = {
  id: string
  kind: PipelineDetection['kind']
  status: PipelineDetection['status']
  account_id: string
  account_name: string | null
  label: string
  source_id: string
  source_call_id?: string | null
  project_id: string | null
  need_id: string | null
  consultant_id: string | null
  submission_id: string | null
  created_object_id: string | null
  detected_at: Date | string
  decided_at: Date | string | null
}

/** Ce que le contrôleur relit avant de confirmer — `needId` en plus de la vue. */
export type PipelineDetectionRecord = PipelineDetection & { needId: string | null }

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString()

function toWire(row: DetectionRow): PipelineDetectionRecord {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    accountId: row.account_id,
    accountName: row.account_name?.trim() || null,
    label: row.label,
    sourceId: row.source_id,
    sourceCallId: row.source_call_id ?? null, // UPDATE … RETURNING ne joint pas l’appel : null, jamais undefined
    projectId: row.project_id,
    needId: row.need_id,
    consultantId: row.consultant_id,
    submissionId: row.submission_id,
    createdObjectId: row.created_object_id,
    detectedAt: iso(row.detected_at),
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
  }
}

const SELECT_DETECTION = `
  SELECT d.id, d.kind, d.status, d.account_id, a.company_name AS account_name, d.label,
         d.source_id, d.project_id, d.need_id, d.consultant_id, d.submission_id,
         d.created_object_id, d.detected_at, d.decided_at, call_act.id AS source_call_id
    FROM pipeline_detections d
    LEFT JOIN accounts a ON a.id = d.account_id
    -- #4016.L6.a — l'appel source, seulement pour le passage « intérêt » (sa source EST un appel)
    -- et seulement s'il existe encore dans l'espace : sinon NULL, donc aucun lien.
    LEFT JOIN activities call_act
           ON d.kind = 'interest_to_opportunity'
          AND call_act.id = d.source_id
          AND call_act.kind = 'call'
          AND call_act.workspace_id = d.workspace_id`

const SWEEPS: Readonly<Record<PipelineDetectionKind, { sql: string; params: (workspaceId: string) => unknown[] }>> = {
  interest_to_opportunity: {
    sql: `
      INSERT INTO pipeline_detections (workspace_id, kind, account_id, label, source_id, source_key)
      SELECT act.workspace_id, 'interest_to_opportunity', act.account_id,
             COALESCE(NULLIF(TRIM(act.subject), ''), a.company_name),
             act.id, act.id::text
        FROM activities act
        JOIN accounts a ON a.id = act.account_id AND a.workspace_id = $1
       WHERE act.workspace_id = $1
         AND act.kind = 'call'
         AND act.call_outcome = ANY($2::text[])
         AND act.account_id IS NOT NULL
         AND act.occurred_at > now() - interval '${LOOKBACK_DAYS} days'
         AND NOT EXISTS (
           SELECT 1 FROM opportunities o
            WHERE o.account_id = act.account_id
              AND o.first_detected_at >= act.occurred_at
         )
      ON CONFLICT (workspace_id, kind, source_key) DO NOTHING
      RETURNING id`,
    params: workspaceId => [workspaceId, [...PIPELINE_INTEREST_CALL_OUTCOMES]],
  },
  shortlist_to_submission: {
    sql: `
      INSERT INTO pipeline_detections (
        workspace_id, kind, account_id, label, source_id, source_key, project_id, need_id, consultant_id
      )
      SELECT sl.workspace_id, 'shortlist_to_submission', pn.account_id,
             COALESCE(NULLIF(TRIM(sl.need_role), ''), o.label),
             sl.id, sl.id::text || ':' || se.consultant_id::text, pn.project_id, pn.id, se.consultant_id
        FROM shortlists sl
        JOIN shortlist_entries se ON se.shortlist_id = sl.id AND se.consultant_id IS NOT NULL
        JOIN project_needs pn ON pn.id = sl.need_id AND pn.project_id IS NOT NULL
        LEFT JOIN opportunities o ON o.id = pn.project_id
       WHERE sl.workspace_id = $1
         AND sl.status = 'shared'
         AND sl.created_at > now() - interval '${LOOKBACK_DAYS} days'
         AND NOT EXISTS (
           SELECT 1 FROM submissions s
            WHERE s.project_id = pn.project_id
              AND s.consultant_id = se.consultant_id
         )
      ON CONFLICT (workspace_id, kind, source_key) DO NOTHING
      RETURNING id`,
    params: workspaceId => [workspaceId],
  },
  interview_to_mission: {
    sql: `
      INSERT INTO pipeline_detections (
        workspace_id, kind, account_id, label, source_id, source_key, project_id, need_id, consultant_id, submission_id
      )
      SELECT s.workspace_id, 'interview_to_mission', o.account_id, o.label,
             i.id, i.id::text, s.project_id, s.need_id, s.consultant_id, s.id
        FROM interviews i
        JOIN submissions s ON s.id = i.submission_id AND s.workspace_id = $1
        JOIN opportunities o ON o.id = s.project_id
       WHERE i.outcome = 'positive'
         AND i.scheduled_at > now() - interval '${LOOKBACK_DAYS} days'
         AND NOT EXISTS (SELECT 1 FROM missions m WHERE m.submission_id = s.id)
      ON CONFLICT (workspace_id, kind, source_key) DO NOTHING
      RETURNING id`,
    params: workspaceId => [workspaceId],
  },
}

@Injectable()
export class PipelineDetectionsService {
  private readonly logger = new Logger(PipelineDetectionsService.name)

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Balaie un espace. Les trois passages sont INDÉPENDANTS : une lecture en
   * échec rend `null` pour son passage, jamais 0, et n'emporte pas les autres.
   */
  async sweepWorkspace(workspaceId: string): Promise<PipelineSweepResult> {
    const result: PipelineSweepResult = {
      interest_to_opportunity: null,
      shortlist_to_submission: null,
      interview_to_mission: null,
    }
    for (const kind of Object.keys(SWEEPS) as PipelineDetectionKind[]) {
      const sweep = SWEEPS[kind]
      try {
        const rows = await this.dataSource.query<{ id: string }[]>(sweep.sql, sweep.params(workspaceId))
        result[kind] = rows.length
      } catch (error) {
        this.logger.error(`Pipe « détecté » (${kind}) en échec`, { error, workspaceId })
      }
    }
    return result
  }

  /** Les lignes ENCORE à revoir de l'espace, les plus récentes d'abord. */
  async listDetected(workspaceId: string): Promise<PipelineDetectionRecord[]> {
    const rows = await this.dataSource.query<DetectionRow[]>(
      `${SELECT_DETECTION}
        WHERE ${PIPELINE_DETECTION_TO_REVIEW_SQL}
        ORDER BY d.detected_at DESC
        LIMIT ${LIST_LIMIT}`,
      [workspaceId],
    )
    return rows.map(toWire)
  }

  /** Une ligne ENCORE à revoir de l'espace ; 404 sinon (jamais 403). */
  async getDetected(workspaceId: string, id: string): Promise<PipelineDetectionRecord> {
    const rows = await this.dataSource.query<DetectionRow[]>(
      `${SELECT_DETECTION} WHERE d.workspace_id = $1 AND d.id = $2 AND d.status = 'detected'`,
      [workspaceId, id],
    )
    const row = rows[0]
    if (!row) throw new NotFoundException('Cette ligne détectée est introuvable ou déjà tranchée.')
    return toWire(row)
  }

  /**
   * La décision d'un HUMAIN — `decided_by` n'est jamais nul. Ne touche qu'une
   * ligne encore `detected` de l'espace : une décision ne se réécrit pas.
   */
  async decide(
    workspaceId: string,
    id: string,
    userId: string,
    decision: { status: 'confirmed' | 'dismissed'; createdObjectId?: string | null },
  ): Promise<PipelineDetectionRecord> {
    // `UPDATE … RETURNING` rend `[lignes, nombre]` sous TypeORM : lu par `firstReturnedRow`.
    const result: unknown = await this.dataSource.query(
      `UPDATE pipeline_detections
          SET status = $4, decided_at = now(), decided_by = $3, created_object_id = $5
        WHERE workspace_id = $1 AND id = $2 AND status = 'detected'
        RETURNING id, kind, status, account_id, NULL::text AS account_name, label, source_id, project_id,
                  need_id, consultant_id, submission_id, created_object_id, detected_at, decided_at`,
      [workspaceId, id, userId, decision.status, decision.createdObjectId ?? null],
    )
    const row = firstReturnedRow<DetectionRow>(result)
    if (!row) throw new NotFoundException('Cette ligne détectée est introuvable ou déjà tranchée.')
    return toWire(row)
  }
}
