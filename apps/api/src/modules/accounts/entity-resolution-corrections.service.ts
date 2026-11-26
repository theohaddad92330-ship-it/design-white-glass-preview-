import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { EntityResolutionCorrection, EntityResolutionCorrectionRequest } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { EntityResolutionCorrectionEntity } from '../../database/entities/entity-resolution-correction.entity'

/** Collision d'unicité PostgreSQL : deux gestes simultanés ont visé le même numéro. */
const UNIQUE_VIOLATION = '23505'
const MAX_ATTEMPTS = 3

function toContract(row: Omit<EntityResolutionCorrectionEntity, 'id'>): EntityResolutionCorrection {
  return {
    version: row.version,
    decision: row.decision,
    target_name: row.targetName,
    target_siren: row.targetSiren,
    note: row.note,
    decided_at: row.decidedAt.toISOString(),
  }
}

/**
 * #2284.67-.69 — la correction d'identité VERSIONNÉE par l'espace.
 *
 * Une ligne par geste : `insert`, jamais `update` ni `delete` — la plus haute
 * version gagne (`applyEntityResolutionCorrections`), les précédentes restent
 * l'historique. Rien n'est écrit ailleurs : ni `raw_analysis` (le calcul reste le
 * calcul), ni un référentiel partagé (les espaces sont des concurrents).
 */
@Injectable()
export class EntityResolutionCorrectionsService {
  constructor(
    @InjectRepository(EntityResolutionCorrectionEntity)
    private readonly corrections: Repository<EntityResolutionCorrectionEntity>,
  ) {}

  async list(workspaceId: string, accountId: string): Promise<EntityResolutionCorrection[]> {
    const rows = await this.corrections.find({ where: { workspaceId, accountId }, order: { version: 'ASC' } })
    return rows.map(toContract)
  }

  async record(input: {
    readonly workspaceId: string
    readonly accountId: string
    readonly decidedBy: string
    readonly request: EntityResolutionCorrectionRequest
  }): Promise<EntityResolutionCorrection> {
    const { request } = input
    const note = request.note?.trim() ? request.note.trim() : null
    for (let attempt = 1; ; attempt += 1) {
      const latest = await this.corrections.findOne({
        where: { workspaceId: input.workspaceId, accountId: input.accountId },
        order: { version: 'DESC' },
      })
      const row: Omit<EntityResolutionCorrectionEntity, 'id'> = {
        workspaceId: input.workspaceId,
        accountId: input.accountId,
        version: (latest?.version ?? 0) + 1,
        decision: request.decision,
        targetName: request.target_name.trim(),
        targetSiren: request.target_siren ?? null,
        note,
        decidedBy: input.decidedBy,
        decidedAt: new Date(),
      }
      try {
        await this.corrections.insert(row)
        return toContract(row)
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code
        if (code !== UNIQUE_VIOLATION || attempt >= MAX_ATTEMPTS) throw error
      }
    }
  }
}
