import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { MissionRisk } from '@bellum/contracts'

/**
 * #2411.11 (reste, épopée #2881) — LA RÉSOLUTION PERSISTÉE D'UN RISQUE DE
 * MISSION, par dossier (pas par personne — voir la migration
 * `MissionRiskResolutions` pour la raison de chaque colonne et la garde
 * « sans changement matériel »).
 */
@Entity({ name: 'mission_risk_resolutions' })
export class MissionRiskResolutionEntity {
  @PrimaryColumn('uuid')
  mission_id: string

  @PrimaryColumn('text')
  risk: MissionRisk

  @Column('uuid')
  workspace_id: string

  /** `NULL` = risque actif normalement (jamais résolu, ou ré-ouvert). */
  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null

  @Column({ type: 'uuid', nullable: true })
  resolved_by: string | null

  /** `missions.updated_at` capturé AU MOMENT du geste — la lecture compare les
   *  deux : la résolution n'est valide que si la mission n'a pas bougé depuis. */
  @Column({ type: 'timestamptz' })
  mission_updated_at_snapshot: Date

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
