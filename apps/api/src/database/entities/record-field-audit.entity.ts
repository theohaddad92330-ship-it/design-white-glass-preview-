import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'
import type { FieldSource } from '@bellum/contracts'

/**
 * Journal d'écriture des fiches — append-only.
 *
 * Rien ne le modifie ni ne le supprime : un journal qu'on peut réécrire ne
 * prouve rien. Les valeurs sont sérialisées en TEXTE pour que la ligne reste
 * lisible même si la colonne d'origine change de type plus tard.
 */
@Entity({ name: 'record_field_audit' })
@Index(['entity_type', 'entity_id', 'created_at'])
export class RecordFieldAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  entity_type: string

  @Column('uuid')
  entity_id: string

  @Column('text')
  field: string

  /** NULL = le champ était vide avant. */
  @Column('text', { nullable: true })
  old_value: string | null

  /** NULL = le champ a été vidé (seul un humain en a le droit). */
  @Column('text', { nullable: true })
  new_value: string | null

  @Column('text')
  source: FieldSource

  @Column('uuid', { nullable: true })
  actor_id: string | null

  /** #2327.21 — la RÈGLE qui a produit l'écriture ; `null` quand elle n'est pas nommée. */
  @Column('text', { nullable: true })
  rule: string | null

  /** #190.2 — la PORTÉE déclarée par l'écrivain (« équipe Data », « groupe ») ; `null` = non déclarée. */
  @Column('text', { nullable: true })
  scope: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
