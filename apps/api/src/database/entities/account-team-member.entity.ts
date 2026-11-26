import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #4158.25 — un co-équipier de compte, en plus du responsable
 * (`accounts.assigned_to`). AJOUT SEUL : retirer pose `removed_at`.
 * Élargit le cloisonné aux co-équipiers (#4996) : il sert aussi au filtre
 * « mes comptes » et aux notifications.
 */
@Entity({ name: 'account_team_members' })
export class AccountTeamMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Index()
  @Column('uuid')
  account_id: string

  @Column('uuid')
  user_id: string

  @Column('uuid')
  added_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @Column('timestamptz', { nullable: true })
  removed_at: Date | null

  @Column('uuid', { nullable: true })
  removed_by: string | null
}
