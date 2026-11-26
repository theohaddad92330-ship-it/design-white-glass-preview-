import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type { MemoryItemScope, MessageStyleTemplateChannel, MessageStyleTemplateStatus } from '@bellum/contracts'

/**
 * #2369.9 — l'objet Template : objectif/canal/persona/statut/interdits/
 * version/owner. Le cycle de vie (#2369.10) est gardé par
 * `checkMessageStyleTemplateTransition` (`@bellum/contracts`), jamais
 * redevine ici.
 *
 * #2369.6 (LOT j1 26/09) — `scope`/`business_unit_id`/`conversation_id`
 * réutilisent EXACTEMENT la forme de `memory_pinned_facts` (GA-26) :
 * migration `1796321481500-MessageStyleTemplateScope`.
 */
@Entity({ name: 'message_style_templates' })
export class MessageStyleTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** L'owner du template. */
  @Column('uuid')
  user_id: string

  @Column('text')
  objective: string

  @Column('text')
  channel: MessageStyleTemplateChannel

  @Column('text')
  persona: string

  @Column('text', { default: 'draft' })
  status: MessageStyleTemplateStatus

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  forbidden: string[]

  @Column('integer', { default: 1 })
  version: number

  /** #2369.6 — la portée : `user`/`workspace`/`business_unit`/`conversation`. */
  @Column('text', { default: 'workspace' })
  scope: MemoryItemScope

  /** #2369.6 — le périmètre visé, quand `scope = 'business_unit'` (« équipe »). */
  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  /** #2369.6 — le fil visé, quand `scope = 'conversation'` (« campagne »). */
  @Column('text', { nullable: true })
  conversation_id: string | null

  /** #2947 (#2204.60) — migration `1796437900910-MessageStyleTemplatePitchToneSignature`. */
  @Column('text', { nullable: true })
  pitch: string | null

  /** #2947 (#2204.61) — le ton déclaré. */
  @Column('text', { nullable: true })
  tone: string | null

  /** #2947 (#2204.63) — la signature, recopiée telle quelle. */
  @Column('text', { nullable: true })
  signature: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
