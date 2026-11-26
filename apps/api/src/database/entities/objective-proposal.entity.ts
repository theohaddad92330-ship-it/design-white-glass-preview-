import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Théo D team-business.N2 — une cible PROPOSÉE à un membre par la direction.
 * Voir la migration `1796575106329-ObjectiveProposals`. Les cibles reprennent
 * celles de `member_objectives` (NULL = axe non proposé).
 */
@Entity({ name: 'objective_proposals' })
export class ObjectiveProposalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Le membre à qui la cible est proposée — seul lui répond. */
  @Index()
  @Column('uuid')
  user_id: string

  @Column('uuid')
  proposed_by: string

  /** 1er du mois visé (`YYYY-MM-01`). */
  @Column('date')
  period_month: string

  @Column('int', { nullable: true })
  target_meetings: number | null

  @Column('int', { nullable: true })
  target_accounts: number | null

  @Column('numeric', { nullable: true })
  target_revenue: string | null

  @Column('int', { nullable: true })
  target_qualified_needs: number | null

  @Column('int', { nullable: true })
  target_placements: number | null

  @Column('numeric', { nullable: true })
  target_margin_percent: string | null

  @Column('int', { nullable: true })
  target_consultants_on_mission: number | null

  @Column('text', { nullable: true })
  reason: string | null

  /** `proposed` | `accepted` | `refused` (contrainte SQL). */
  @Column('text', { default: 'proposed' })
  status: 'proposed' | 'accepted' | 'refused'

  @Column({ type: 'timestamptz', nullable: true })
  responded_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
