import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { RitualKey, RitualPreference } from '@bellum/contracts'
import { WorkspaceRitualPreferenceEntity } from '../../database/entities/workspace-ritual-preference.entity'

/**
 * BEL-SC-242 (#3271.10, .12) — « laisser le workspace personnaliser » un
 * rituel, en le masquant, jamais en le réécrivant. Le catalogue lui-même
 * (`RITUAL_CATALOG`) reste en CODE ; ce service ne porte QUE le geste
 * « masqué / affiché » par (espace, rituel).
 *
 * Même forme que `FinanceTargetService` : aucune ligne = comportement de
 * DÉPART (ici, « rituel affiché »), jamais une valeur par défaut FABRIQUÉE.
 */
@Injectable()
export class RitualPreferencesService {
  constructor(
    @InjectRepository(WorkspaceRitualPreferenceEntity)
    private readonly preferences: Repository<WorkspaceRitualPreferenceEntity>,
  ) {}

  /** UNIQUEMENT les rituels sur lesquels l'espace a réglé quelque chose. Un
   *  rituel absent de ce tableau est affiché — jamais « désactivé par défaut ». */
  async forWorkspace(workspaceId: string): Promise<RitualPreference[]> {
    const rows = await this.preferences.find({ where: { workspace_id: workspaceId } })
    return rows.map(toPreference)
  }

  /**
   * Masquer — ou réafficher — un rituel. `disabled: false` reste une SAISIE :
   * la ligne n'est jamais supprimée (« on archive, on ne supprime pas »), elle
   * se remet à `false` comme n'importe quel autre changement de valeur.
   *
   * ⚠️ `ON CONFLICT … DO UPDATE`, même raisonnement que l'objectif de marge :
   * une préférence est une DÉCISION, la dernière gagne.
   */
  async set(workspaceId: string, ritualKey: RitualKey, disabled: boolean, userId: string): Promise<RitualPreference> {
    await this.preferences.query(
      `INSERT INTO workspace_ritual_preferences (workspace_id, ritual_key, disabled, updated_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, ritual_key)
       DO UPDATE SET disabled = EXCLUDED.disabled,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()`,
      [workspaceId, ritualKey, disabled, userId],
    )
    const row = await this.preferences.findOne({ where: { workspace_id: workspaceId, ritual_key: ritualKey } })
    return row ? toPreference(row) : { ritualKey, disabled }
  }
}

function toPreference(row: WorkspaceRitualPreferenceEntity | Record<string, unknown>): RitualPreference {
  return { ritualKey: row.ritual_key as RitualKey, disabled: Boolean(row.disabled) }
}
