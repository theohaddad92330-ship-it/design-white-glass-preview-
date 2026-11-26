import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { OutreachMessageVersionKind } from '@bellum/contracts'

/**
 * #2366.10 — une version du texte d'un message d'outreach. APPEND-ONLY : une
 * modification insère la version suivante, elle ne réécrit jamais la
 * précédente (le message approuvé ou envoyé reste lisible tel quel).
 */
@Entity({ name: 'outreach_message_versions' })
export class OutreachMessageVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('uuid')
  user_id: string

  @Index()
  @Column('uuid')
  message_id: string

  @Column('integer')
  version: number

  @Column('text')
  kind: OutreachMessageVersionKind

  @Column('text', { nullable: true })
  subject: string | null

  @Column('text')
  body: string

  @Column('uuid', { nullable: true })
  author: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
