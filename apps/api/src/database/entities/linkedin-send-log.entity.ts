import type { LinkedInSendStatus } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Le journal des gestes d'envoi sous mandat (#4737).
 *
 * `body` est le CORPS du message : stocké ici, jamais exposé (ni réponse d'API,
 * ni log, ni modèle). `proof_ref` n'existe que pour `sent` — l'envoi vérifié
 * par le fournisseur ; le « fait » déclaratif vit ailleurs
 * (`linkedin_interactions.message_sent`) et ne se confond pas avec lui.
 */
@Entity({ name: 'linkedin_send_log' })
export class LinkedInSendLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid', { nullable: true })
  mandate_id: string | null

  @Index()
  @Column('uuid')
  contact_id: string

  @Column('text')
  status: LinkedInSendStatus

  @Column('text', { nullable: true })
  reason: string | null

  @Column('text', { nullable: true })
  body: string | null

  @Column('text', { nullable: true })
  proof_ref: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
