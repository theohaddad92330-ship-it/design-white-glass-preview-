import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Théo M2 — envoi programmé — un brouillon VALIDÉ que le commercial a daté. Pointe la version validée et en garde
 * l'empreinte, jamais le corps. Statuts : `scheduledSendStatusSchema` (contrainte SQL posée avant ce code).
 */
@Entity({ name: 'scheduled_message_sends' })
@Index(['workspace_id', 'user_id', 'scheduled_at'])
export class ScheduledMessageSendEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** Le commercial qui a programmé — celui dont la boîte enverra. */
  @Column('uuid')
  user_id: string

  @Column('uuid')
  version_id: string

  @Column('uuid')
  validation_id: string

  @Column('uuid')
  contact_id: string

  /** L'empreinte VALIDÉE (sha-256 hex) — relue au départ. */
  @Column('text')
  content_hash: string

  @Column({ type: 'timestamptz' })
  scheduled_at: Date

  @Column('text')
  time_zone: string

  @Column('text', { default: 'scheduled' })
  status: string

  /** Posé AVANT d'appeler le transport : une tentative commencée ne se rejoue jamais. */
  @Column({ type: 'timestamptz', nullable: true })
  attempted_at: Date | null

  @Column({ type: 'timestamptz', nullable: true })
  sent_at: Date | null

  @Column('text', { nullable: true })
  failure_code: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
