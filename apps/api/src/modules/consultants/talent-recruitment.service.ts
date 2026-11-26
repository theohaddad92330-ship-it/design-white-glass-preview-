import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  groupRecruitmentBoard,
  recruitmentStageOf,
  type ChangeRecruitmentStage,
  type RecruitmentCard,
  type RecruitmentColumn,
  type RecruitmentHistoryEntry,
} from '@bellum/contracts'
import { TalentRecruitmentEventEntity } from '../../database/entities/talent-recruitment-event.entity'

type BoardRow = {
  id: string
  full_name: string | null
  title: string | null
  location: string | null
  engagement_kind: string | null
  stage: string | null
  stage_since: Date | string | null
  reason: string | null
  planned_at: Date | string | null
}

type HistoryRow = {
  id: string
  stage: string
  reason: string | null
  planned_at: Date | string | null
  changed_by_name: string | null
  created_at: Date | string
}

/** Au-delà, un kanban n'est plus un kanban : le vivier se lit dans sa liste. */
const BOARD_LIMIT = 500

const iso = (value: Date | string | null): string | null => (value === null ? null : new Date(value).toISOString())

/**
 * Théo C talents-recrutement — le recrutement d'une PERSONNE, indépendant de ses présentations (N3).
 *
 * ⚠️ Ce service n'écrit QUE dans `talent_recruitment_events` et ne lit ni `submissions` ni `mission_assignments`
 * (gardé par `talent-recruitment-independence.spec.ts`). Il n'a aucun chemin qui efface une personne : « Écartée » est
 * une étape, pas une suppression. Le motif est consigné, jamais lu pour classer.
 */
@Injectable()
export class TalentRecruitmentService {
  constructor(
    @InjectRepository(TalentRecruitmentEventEntity)
    private readonly events: Repository<TalentRecruitmentEventEntity>,
  ) {}

  private query<T>(sql: string, params: unknown[] = []): Promise<T> {
    return this.events.manager.query<T>(sql, params)
  }

  /**
   * Les personnes en recrutement : les profils « candidat » de l'espace, plus toute personne qu'un humain a déjà
   * rangée. Une personne jamais rangée n'a pas d'étape (`stage` nul) — elle se lit « À qualifier ».
   */
  async board(workspaceId: string): Promise<RecruitmentCard[]> {
    const rows = await this.query<BoardRow[]>(
      `SELECT c.id, c.full_name, c.title, c.zones[1] AS location, c.engagement_kind,
              e.stage, e.created_at AS stage_since, e.reason, e.planned_at
         FROM consultants c
         LEFT JOIN LATERAL (
           SELECT e.stage, e.reason, e.planned_at, e.created_at
             FROM talent_recruitment_events e
            WHERE e.talent_id = c.id AND e.workspace_id = c.workspace_id
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT 1
         ) e ON true
        WHERE c.workspace_id = $1 AND c.archived_at IS NULL AND (c.kind = 'candidate' OR e.stage IS NOT NULL)
        ORDER BY COALESCE(e.created_at, c.created_at) DESC
        LIMIT ${BOARD_LIMIT}`,
      [workspaceId],
    )
    return (rows ?? []).map(row => ({
      talentId: row.id,
      fullName: row.full_name ?? null,
      title: row.title ?? null,
      location: row.location ?? null,
      // « inconnu » n'est pas une relation : on ne l'affiche pas comme telle.
      relation: row.engagement_kind && row.engagement_kind !== 'inconnu' ? row.engagement_kind : null,
      stage: recruitmentStageOf(row.stage),
      stageSince: iso(row.stage_since ?? null),
      reason: row.reason ?? null,
      plannedAt: iso(row.planned_at ?? null),
    }))
  }

  async boardColumns(workspaceId: string): Promise<RecruitmentColumn[]> {
    return groupRecruitmentBoard(await this.board(workspaceId))
  }

  /** Change l'étape : AJOUTE une ligne au journal. Rien n'est réécrit, rien n'est supprimé. */
  async change(
    workspaceId: string,
    userId: string,
    talentId: string,
    input: ChangeRecruitmentStage,
  ): Promise<{ id: string; createdAt: string }> {
    const known = await this.query<{ id: string }[]>(
      `SELECT id FROM consultants WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
      [talentId, workspaceId],
    )
    if (!known?.[0]) throw new NotFoundException('Talent not found')
    const inserted = await this.query<{ id: string; created_at: Date | string }[]>(
      `INSERT INTO talent_recruitment_events (workspace_id, talent_id, stage, reason, planned_at, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`,
      [workspaceId, talentId, input.stage, input.reason ?? null, input.plannedAt ?? null, userId],
    )
    const row = inserted[0]
    return { id: row?.id ?? '', createdAt: iso(row?.created_at ?? new Date()) ?? '' }
  }

  /** Le journal d'une personne, du plus récent au plus ancien. */
  async history(workspaceId: string, talentId: string): Promise<RecruitmentHistoryEntry[]> {
    const rows = await this.query<HistoryRow[]>(
      `SELECT e.id, e.stage, e.reason, e.planned_at, NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), '') AS changed_by_name, e.created_at
         FROM talent_recruitment_events e
         LEFT JOIN profiles p ON p.user_id = e.changed_by
        WHERE e.workspace_id = $1 AND e.talent_id = $2
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 200`,
      [workspaceId, talentId],
    )
    return (rows ?? []).map(row => ({
      id: row.id,
      stage: recruitmentStageOf(row.stage),
      reason: row.reason ?? null,
      plannedAt: iso(row.planned_at ?? null),
      changedByName: row.changed_by_name ?? null,
      createdAt: iso(row.created_at) ?? '',
    }))
  }
}
