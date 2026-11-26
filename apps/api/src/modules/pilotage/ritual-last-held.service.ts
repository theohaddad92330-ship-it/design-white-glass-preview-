import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { RitualKey, RitualLastHeld } from '@bellum/contracts'
import { WorkspaceRitualLastHeldEntity } from '../../database/entities/workspace-ritual-last-held.entity'

/**
 * #3298 (suite #3271.8) — la marque légère « ce rituel a été tenu ». Même
 * forme que `RitualPreferencesService` : aucune ligne = jamais tenu, jamais
 * une date fabriquée.
 */
@Injectable()
export class RitualLastHeldService {
  constructor(
    @InjectRepository(WorkspaceRitualLastHeldEntity)
    private readonly marks: Repository<WorkspaceRitualLastHeldEntity>,
  ) {}

  /** UNIQUEMENT les rituels marqués au moins une fois. Un rituel absent n'a
   *  jamais été tenu — jamais une date inventée depuis sa seule cadence. */
  async forWorkspace(workspaceId: string): Promise<RitualLastHeld[]> {
    const rows = await this.marks.find({ where: { workspace_id: workspaceId } })
    return rows.map(toLastHeld)
  }

  /**
   * Marquer un rituel comme tenu MAINTENANT. `ON CONFLICT … DO UPDATE`, même
   * raisonnement que la préférence de masquage : une marque est un FAIT, la
   * dernière tenue gagne — jamais un historique de séances.
   */
  async markHeld(workspaceId: string, ritualKey: RitualKey, userId: string): Promise<RitualLastHeld> {
    await this.marks.query(
      `INSERT INTO workspace_ritual_last_held (workspace_id, ritual_key, held_at, held_by)
       VALUES ($1, $2, now(), $3)
       ON CONFLICT (workspace_id, ritual_key)
       DO UPDATE SET held_at = now(), held_by = EXCLUDED.held_by, updated_at = now()`,
      [workspaceId, ritualKey, userId],
    )
    const row = await this.marks.findOne({ where: { workspace_id: workspaceId, ritual_key: ritualKey } })
    return row ? toLastHeld(row) : { ritualKey, heldAt: new Date().toISOString(), heldBy: userId }
  }
}

function toLastHeld(row: WorkspaceRitualLastHeldEntity | Record<string, unknown>): RitualLastHeld {
  const heldAt = row.held_at instanceof Date ? row.held_at.toISOString() : String(row.held_at)
  return { ritualKey: row.ritual_key as RitualKey, heldAt, heldBy: (row.held_by as string | null) ?? null }
}
