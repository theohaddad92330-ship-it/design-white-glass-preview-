import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #2327 — ce qu'un humain a décidé d'une paire de fiches talent.
 *
 * On PROPOSE, on ne fusionne jamais (`c37_fusion_doublons`) : cette table ne
 * porte que des décisions qui n'effacent rien. Une décision annulée garde sa
 * ligne, datée (`undone_at`) — un journal qu'on réécrit ne prouve rien.
 */
@Entity({ name: 'talent_identity_decisions' })
@Index(['workspace_id', 'talent_id'])
@Index(['workspace_id', 'other_talent_id'])
export class TalentIdentityDecisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  talent_id: string

  /** L'autre fiche de la paire. Nullable en base : la fiche peut disparaître (RGPD). */
  @Column('uuid', { nullable: true })
  other_talent_id: string | null

  /** `TALENT_DUPLICATE_ACTIONS` — contrainte `talent_identity_decisions_action_check`. */
  @Column('text')
  action: string

  /** `TALENT_IDENTITY_STATES` — contrainte `talent_identity_decisions_state_check`. */
  @Column('text')
  state: string

  /** #2327.21 — la règle qui rapprochait la paire au moment de décider. */
  @Column('text', { nullable: true })
  reason: string | null

  @Column('uuid', { nullable: true })
  assignee_id: string | null

  @Column('uuid')
  decided_by: string

  /** Les documents COPIÉS par « mettre à jour » — archivés si la décision est annulée. */
  @Column('uuid', { array: true, default: () => "'{}'" })
  document_ids: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /** #2327.25 — l'annulation DATE la décision, elle ne l'efface pas. */
  @Column('timestamptz', { nullable: true })
  undone_at: Date | null

  @Column('uuid', { nullable: true })
  undone_by: string | null
}
