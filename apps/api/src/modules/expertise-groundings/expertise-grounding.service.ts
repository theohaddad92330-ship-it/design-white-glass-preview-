import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  buildExpertiseCredibilityAudit,
  EXPERTISE_GROUNDING_SOURCE_TYPES,
  expertiseGroundingWriteViolation,
  projectExpertiseGroundings,
  type CreateExpertiseGroundingInput,
  type ExpertiseGrounding,
  type ExpertiseGroundingSourceOption,
  type ExpertiseGroundingSourceType,
  type ExpertiseGroundingsResponse,
  type UpdateExpertiseGroundingInput,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'

interface GroundingRow {
  id: string
  expertise_key: string
  kind: string
  state: string
  state_source: string
  source_type: string | null
  source_id: string | null
  label: string | null
  confidentiality: string | null
  archived_at: string | Date | null
  created_at: string | Date
  updated_at: string | Date
}

/** Les réponses plates relues : les domaines déclarés et les cinq colonnes de fondement. */
export type GroundingAnswers = Record<string, unknown> & { expertise_areas?: unknown }

const COLUMNS = `id, expertise_key, kind, state, state_source, source_type, source_id, label,
  confidentiality, archived_at, created_at, updated_at`

/**
 * Le libellé de chaque objet source, relu dans SA table et borné à l'espace.
 * `rag_documents` = la bibliothèque de documents de l'espace (#2039.12).
 */
const SOURCE_TABLES: Record<ExpertiseGroundingSourceType, { table: string; label: string; order: string }> = {
  account: { table: 'accounts', label: 'company_name', order: 'created_at DESC' },
  consultant: { table: 'consultants', label: 'full_name', order: 'created_at DESC' },
  mission: { table: 'missions', label: 'label', order: 'created_at DESC' },
  document: { table: 'rag_documents', label: 'title', order: 'created_at DESC' },
}

/** Combien d'objets de chaque type l'écran propose au rattachement. */
const SOURCE_OPTIONS_LIMIT = 50

function iso(value: string | Date | null): string | null {
  return value === null ? null : new Date(value).toISOString()
}

function toView(row: GroundingRow, labels: Map<string, string>): ExpertiseGrounding {
  return {
    id: row.id,
    expertiseKey: row.expertise_key,
    kind: row.kind as ExpertiseGrounding['kind'],
    state: row.state as ExpertiseGrounding['state'],
    stateSource: row.state_source as ExpertiseGrounding['stateSource'],
    sourceType: row.source_type as ExpertiseGrounding['sourceType'],
    sourceId: row.source_id,
    sourceLabel: row.source_id ? (labels.get(row.source_id) ?? null) : null,
    label: row.label,
    confidentiality: row.confidentiality as ExpertiseGrounding['confidentiality'],
    archivedAt: iso(row.archived_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

/**
 * Épopée #2880 (lot V33) — le seul écrivain de `expertise_groundings`, et le
 * seul lecteur qui croise ses lignes avec les réponses plates de l'onboarding.
 *
 * APPELANT : `ExpertiseGroundingController` (`/expertise-groundings`), lu par
 * la carte « Crédibilité par expertise » de l'audit commercial
 * (`AuditExpertiseCredibility.tsx`, `/settings/profile/audit`).
 *
 * Aucune entité TypeORM : SQL direct, chaque requête bornée par `workspace_id`
 * (même patron que `LegalContractService`).
 */
@Injectable()
export class ExpertiseGroundingService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * `answers` = les réponses d'onboarding fusionnées de l'espace, lues par le
   * contrôleur (`EsnProfileReader`) — GA-07 : un service ne va pas chercher le
   * service d'un autre module.
   */
  async list(workspaceId: string, answers: GroundingAnswers): Promise<ExpertiseGroundingsResponse> {
    const stored = returnedRows<GroundingRow>(
      await this.dataSource.query(
        `SELECT ${COLUMNS} FROM expertise_groundings WHERE workspace_id = $1 ORDER BY created_at ASC`,
        [workspaceId],
      ),
    )
    const labels = await this.sourceLabels(workspaceId, stored)
    const groundings = projectExpertiseGroundings(
      answers,
      stored.map(row => toView(row, labels)),
    )
    const areas = Array.isArray(answers.expertise_areas)
      ? answers.expertise_areas.filter((value): value is string => typeof value === 'string')
      : []
    return {
      groundings,
      audit: buildExpertiseCredibilityAudit(areas, groundings),
      sourceOptions: await this.sourceOptions(workspaceId),
    }
  }

  async create(workspaceId: string, userId: string, input: CreateExpertiseGroundingInput): Promise<void> {
    this.assertRules(input)
    await this.assertSourceInWorkspace(workspaceId, input.sourceType, input.sourceId)
    await this.dataSource.query(
      `INSERT INTO expertise_groundings
         (workspace_id, expertise_key, kind, state, source_type, source_id, label, confidentiality, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        workspaceId,
        input.expertiseKey,
        input.kind,
        input.state,
        input.sourceType,
        input.sourceId,
        input.label,
        input.confidentiality,
        userId,
      ],
    )
  }

  async update(workspaceId: string, id: string, input: UpdateExpertiseGroundingInput): Promise<void> {
    const row = await this.findRow(workspaceId, id)
    const merged = {
      kind: row.kind as ExpertiseGrounding['kind'],
      state: input.state ?? (row.state as ExpertiseGrounding['state']),
      sourceType: input.sourceType !== undefined ? input.sourceType : (row.source_type as ExpertiseGroundingSourceType),
      sourceId: input.sourceId !== undefined ? input.sourceId : row.source_id,
      label: input.label !== undefined ? input.label : row.label,
      confidentiality:
        input.confidentiality !== undefined
          ? input.confidentiality
          : (row.confidentiality as ExpertiseGrounding['confidentiality']),
    }
    this.assertRules(merged)
    if (merged.sourceId !== row.source_id || merged.sourceType !== row.source_type) {
      await this.assertSourceInWorkspace(workspaceId, merged.sourceType, merged.sourceId)
    }
    await this.dataSource.query(
      `UPDATE expertise_groundings
          SET state = $3, state_source = 'user', source_type = $4, source_id = $5, label = $6,
              confidentiality = $7, updated_at = now()
        WHERE id = $1 AND workspace_id = $2`,
      [id, workspaceId, merged.state, merged.sourceType, merged.sourceId, merged.label, merged.confidentiality],
    )
  }

  /** On archive, on ne supprime pas : la ligne sort de l'audit, elle reste en base. */
  async archive(workspaceId: string, id: string): Promise<void> {
    await this.findRow(workspaceId, id)
    await this.dataSource.query(
      `UPDATE expertise_groundings SET archived_at = now(), updated_at = now()
        WHERE id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
      [id, workspaceId],
    )
  }

  private assertRules(value: Parameters<typeof expertiseGroundingWriteViolation>[0]): void {
    const violation = expertiseGroundingWriteViolation(value)
    if (violation) throw new BadRequestException(violation)
  }

  private async findRow(workspaceId: string, id: string): Promise<GroundingRow> {
    const [row] = returnedRows<GroundingRow>(
      await this.dataSource.query(
        `SELECT ${COLUMNS} FROM expertise_groundings WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [id, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Fondement introuvable')
    return row
  }

  private async assertSourceInWorkspace(
    workspaceId: string,
    sourceType: ExpertiseGroundingSourceType | null,
    sourceId: string | null,
  ): Promise<void> {
    if (sourceType === null || sourceId === null) return
    const { table } = SOURCE_TABLES[sourceType]
    const [row] = returnedRows<{ id: string }>(
      await this.dataSource.query(`SELECT id FROM ${table} WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        sourceId,
        workspaceId,
      ]),
    )
    if (!row) throw new NotFoundException('Objet source introuvable dans cet espace')
  }

  private async sourceLabels(workspaceId: string, rows: readonly GroundingRow[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>()
    for (const type of EXPERTISE_GROUNDING_SOURCE_TYPES) {
      const ids = rows.filter(row => row.source_type === type && row.source_id).map(row => row.source_id as string)
      if (ids.length === 0) continue
      const { table, label } = SOURCE_TABLES[type]
      const found = returnedRows<{ id: string; label: string | null }>(
        await this.dataSource.query(
          `SELECT id, ${label} AS label FROM ${table} WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
          [workspaceId, ids],
        ),
      )
      for (const item of found) if (item.label) labels.set(item.id, item.label)
    }
    return labels
  }

  /** #2039.9/.12 — les objets de l'espace qu'on peut rattacher comme preuve. */
  private async sourceOptions(workspaceId: string): Promise<ExpertiseGroundingSourceOption[]> {
    const options: ExpertiseGroundingSourceOption[] = []
    for (const type of EXPERTISE_GROUNDING_SOURCE_TYPES) {
      const { table, label, order } = SOURCE_TABLES[type]
      const found = returnedRows<{ id: string; label: string | null }>(
        await this.dataSource.query(
          `SELECT id, ${label} AS label FROM ${table}
            WHERE workspace_id = $1 AND ${label} IS NOT NULL
            ORDER BY ${order} LIMIT ${SOURCE_OPTIONS_LIMIT}`,
          [workspaceId],
        ),
      )
      // Une absence ne fait aucune ligne : un objet sans libellé n'est pas proposé.
      for (const item of found) if (item.label) options.push({ type, id: item.id, label: item.label })
    }
    return options
  }
}
