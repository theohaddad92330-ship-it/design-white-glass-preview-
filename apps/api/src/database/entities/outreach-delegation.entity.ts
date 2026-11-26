import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { DelegationScope } from '@bellum/contracts'

/** #3702.9 — le mandat d'envoi délégué (c89). Table `outreach_delegations`. */
@Entity({ name: 'outreach_delegations' })
export class OutreachDelegationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  /** #4016 L5 — l'usage couvert (`DELEGATION_SCOPES`, contrainte `outreach_delegations_scope_check`). */
  @Column('text', { default: 'campaign' })
  scope: DelegationScope

  /** #4016 L5 — le mandat que celui-ci renouvelle (re-signé), s'il en renouvelle un. */
  @Column('uuid', { nullable: true })
  renewed_from: string | null

  @Column('text')
  campaign_label: string

  @Column('jsonb')
  contact_ids: string[]

  @Column('jsonb')
  channels: string[]

  @Column('text')
  sender_mailbox_id: string

  /** Version relue par message : `{ id, version }[]`. */
  @Column('jsonb')
  messages: { id: string; version: number }[]

  /** `null` pour une portée d'espace (#4016 L5) : le contenu s'y fige message par message. */
  @Column('text', { nullable: true })
  content_hash: string | null

  @Column('integer')
  window_start_hour: number

  @Column('integer')
  window_end_hour: number

  @Column('timestamptz')
  starts_at: Date

  @Column('timestamptz')
  expires_at: Date

  @Column('integer')
  max_messages: number

  @Column('integer', { default: 0 })
  sent_count: number

  /**
   * #4737 — la borne PAR JOUR d'un mandat `linkedin_send` (1 à 25, contrainte `outreach_delegations_daily_limit_check`).
   * `null` pour toute autre portée : la borne de l'e-mail est le plafond total `max_messages`.
   */
  @Column('integer', { nullable: true })
  daily_limit: number | null

  @Column('jsonb')
  validated_by: string[]

  @Column('timestamptz')
  validated_at: Date

  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  @Column('timestamptz', { nullable: true })
  paused_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
