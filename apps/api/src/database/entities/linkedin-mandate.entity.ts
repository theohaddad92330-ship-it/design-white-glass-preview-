import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le mandat d'envoi LinkedIn (#4737) : explicite, daté, borné, révocable.
 * Ce n'est ni un rôle ni une permission. Une révocation s'ARCHIVE
 * (`revoked_at`), elle ne supprime rien.
 */
@Entity({ name: 'linkedin_mandates' })
export class LinkedInMandateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Qui donne le mandat. */
  @Column('uuid')
  user_id: string

  @Column('timestamptz', { default: () => 'now()' })
  granted_at: Date

  @Column('timestamptz')
  valid_from: Date

  @Column('timestamptz')
  valid_until: Date

  @Column('int')
  daily_limit: number

  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
