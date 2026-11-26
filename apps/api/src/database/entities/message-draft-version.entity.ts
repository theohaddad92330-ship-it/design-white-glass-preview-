import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * La trace du brouillon, dans le temps (#3695.4/.6, #3696). Ligne d'audit —
 * jamais corrigée : une nouvelle variante ou une correction manuelle ajoute sa
 * propre ligne (même doctrine que `IntroductionAuthorizationEntity`).
 */
@Entity({ name: 'message_draft_versions' })
@Index(['contact_id', 'workspace_id', 'channel', 'created_at'])
export class MessageDraftVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  contact_id: string

  @Column('text')
  channel: string

  @Column('text', { nullable: true })
  subject: string | null

  @Column('text')
  body: string

  /** #3696.3 — la correction manuelle du commercial sur CETTE ligne. */
  @Column('text', { nullable: true })
  edited_subject: string | null

  @Column('text', { nullable: true })
  edited_body: string | null

  /** #3695.4 — le modèle approuvé inséré tel quel : sa source et sa version. */
  @Column('text', { nullable: true })
  used_template_source: string | null

  @Column('integer', { nullable: true })
  used_template_version: number | null

  /** #3695.4 — le style de message résolu et appliqué par le serveur. */
  @Column('uuid', { nullable: true })
  used_style_id: string | null

  /** #3695.5 — texte identique à la version précédente : jamais annoncé « adapté ». */
  @Column('boolean', { default: false })
  unchanged: boolean

  @Column('text', { nullable: true })
  angle: string | null

  @Column('uuid', { nullable: true })
  recorded_by: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
