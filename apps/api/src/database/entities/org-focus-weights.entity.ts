import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { OrgFocusWeights } from '@bellum/contracts'

/**
 * Le focus du plan d'action d'UN espace — l'ÉCART au défaut, jamais une copie
 * du défaut. Raison complète : migration `1791008000002-OrgFocusWeights`.
 */
@Entity({ name: 'org_focus_weights' })
export class OrgFocusWeightsEntity {
  /** L'espace EST la clé : un espace, un réglage, pas d'ambiguïté possible. */
  @PrimaryColumn('uuid')
  workspace_id: string

  /** Partiel — seuls les axes que l'espace a réglés. `{}` = tout par défaut. */
  @Column('jsonb', { default: () => "'{}'::jsonb" })
  weights: OrgFocusWeights

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
