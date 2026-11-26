import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import {
  taskStillOpenSql,
  type RecordTeamResearch,
  type TeamResearchItem,
  type TeamResearchKind,
  type TeamResearchResponse,
} from '@bellum/contracts'
import { filtersKeyOf } from './team-research-key'
import { TeamResearchEntryEntity } from '../../database/entities/team-research-entry.entity'

export { filtersKeyOf }

/** Fenêtre de l'historique d'équipe — celle de l'historique de Découvrir (30 jours). */
const WINDOW_DAYS = 30
const LIMIT = 50

type DiscoverRow = {
  id: string
  title: string
  scopeLabel: string | null
  filters: Record<string, unknown>
  resultCount: number | null
  openActions: number | string
  userId: string
  firstName: string | null
  lastName: string | null
  at: Date | string
}

type AnalysisRow = {
  id: string
  accountId: string
  title: string
  scopeLabel: string | null
  openActions: number | string
  nextAction: string | null
  userId: string
  firstName: string | null
  lastName: string | null
  at: Date | string
}

function authorName(first: string | null, last: string | null): string | null {
  const full = [first, last].filter(Boolean).join(' ').trim()
  return full || null
}

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : value)

/**
 * Équipe › Recherches (Théo D team-recherches.N1–N3) — les recherches conservées de TOUT l'espace.
 * Lecture ouverte à tout membre (Louis 22/10, Q3) ; jamais « qui a consulté quel compte » : seules
 * les recherches LANCÉES et les analyses LANCÉES, des faits métier.
 */
@Injectable()
export class TeamResearchService {
  constructor(
    @InjectRepository(TeamResearchEntryEntity)
    private readonly repo: Repository<TeamResearchEntryEntity>,
  ) {}

  async list(workspaceId: string, kind?: TeamResearchKind): Promise<TeamResearchResponse> {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000)

    const discover = kind === 'analysis' ? [] : await this.discoverItems(workspaceId, since)
    const analysis = kind === 'discover' ? [] : await this.analysisItems(workspaceId, since)

    const items = [...discover, ...analysis].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, LIMIT)
    return { items }
  }

  /** Une recherche Découvrir lancée : relancer le même périmètre remonte la ligne. */
  async record(workspaceId: string, userId: string, body: RecordTeamResearch): Promise<void> {
    await this.repo.upsert(
      {
        workspace_id: workspaceId,
        user_id: userId,
        title: body.title,
        scope_label: body.scope_label ?? null,
        filters: body.filters,
        filters_key: filtersKeyOf(body.filters),
        result_count: body.result_count ?? null,
        account_ids: body.account_ids ?? [],
        updated_at: new Date(),
      } as QueryDeepPartialEntity<TeamResearchEntryEntity>,
      ['workspace_id', 'user_id', 'filters_key'],
    )
  }

  private async discoverItems(workspaceId: string, since: Date): Promise<TeamResearchItem[]> {
    const rows = await this.repo.manager.query<DiscoverRow[]>(
      `SELECT e.id, e.title, e.scope_label AS "scopeLabel", e.filters, e.result_count AS "resultCount",
              e.user_id AS "userId", p.first_name AS "firstName", p.last_name AS "lastName",
              e.updated_at AS "at",
              (SELECT count(*) FROM tasks t
                WHERE t.workspace_id = e.workspace_id AND t.account_id = ANY(e.account_ids)
                  AND ${taskStillOpenSql('t')}) AS "openActions"
       FROM team_research_entries e
       LEFT JOIN profiles p ON p.user_id = e.user_id
       WHERE e.workspace_id = $1 AND e.updated_at >= $2
       ORDER BY e.updated_at DESC
       LIMIT ${LIMIT}`,
      [workspaceId, since],
    )
    return rows.map(row => ({
      id: row.id,
      kind: 'discover' as const,
      occurred_at: iso(row.at),
      title: row.title,
      scope_label: row.scopeLabel,
      account_count: row.resultCount,
      open_action_count: Number(row.openActions),
      next_action: null,
      author_user_id: row.userId,
      author_name: authorName(row.firstName, row.lastName),
      account_id: null,
      filters: row.filters,
    }))
  }

  private async analysisItems(workspaceId: string, since: Date): Promise<TeamResearchItem[]> {
    const rows = await this.repo.manager.query<AnalysisRow[]>(
      `SELECT r.id, r.account_id AS "accountId", a.company_name AS title, r.scope_mode AS "scopeLabel",
              r.user_id AS "userId", p.first_name AS "firstName", p.last_name AS "lastName",
              r.created_at AS "at",
              (SELECT count(*) FROM tasks t
                WHERE t.workspace_id = r.workspace_id AND t.account_id = r.account_id
                  AND ${taskStillOpenSql('t')}) AS "openActions",
              (SELECT t.title FROM tasks t
                WHERE t.workspace_id = r.workspace_id AND t.account_id = r.account_id
                  AND ${taskStillOpenSql('t')}
                ORDER BY t.due_on ASC LIMIT 1) AS "nextAction"
       FROM analysis_runs r
       JOIN accounts a ON a.id = r.account_id AND a.status <> 'deleted'
       LEFT JOIN profiles p ON p.user_id = r.user_id
       WHERE r.workspace_id = $1 AND r.created_at >= $2
       ORDER BY r.created_at DESC
       LIMIT ${LIMIT}`,
      [workspaceId, since],
    )
    return rows.map(row => ({
      id: row.id,
      kind: 'analysis' as const,
      occurred_at: iso(row.at),
      title: row.title,
      scope_label: row.scopeLabel,
      account_count: 1,
      open_action_count: Number(row.openActions),
      next_action: row.nextAction,
      author_user_id: row.userId,
      author_name: authorName(row.firstName, row.lastName),
      account_id: row.accountId,
      filters: null,
    }))
  }
}
