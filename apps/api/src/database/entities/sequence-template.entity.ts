import type { ContentVisibility } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3756 — un modèle de séquence de la bibliothèque d'un espace (une campagne
 * déjà écrite par l'ESN). Appliqué à un contact, il crée une séquence
 * MONO-contact (doctrine c74). Migration `1796433908857-SequenceTemplates`.
 */
@Entity({ name: 'sequence_templates' })
export class SequenceTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('text')
  name: string

  @Column('text', { nullable: true })
  sector: string | null

  @Column('text', { nullable: true })
  tier_label: 'A' | 'B' | 'C' | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  /** #4158.30 — l'auteur (`null` sur un modèle antérieur : il reste partagé, sans propriétaire inventé). */
  @Column('uuid', { nullable: true })
  created_by: string | null

  /** #4158.30 — dernière mise à jour (partage / reprise en personnel) ; `null` tant que rien n'a bougé. */
  @Column('timestamptz', { nullable: true })
  updated_at: Date | null

  /** #4158.30 — partagé avec l'équipe (défaut, comportement d'avant) ou personnel (son seul auteur). */
  @Column('text', { default: 'team' })
  visibility: ContentVisibility
}

@Entity({ name: 'sequence_template_steps' })
export class SequenceTemplateStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  template_id: string

  @Column('integer')
  position: number

  @Column('integer')
  delay_days: number

  @Column('text', { default: '' })
  subject: string

  @Column('text')
  body: string

  /** #4426.7 — `email` (une étape de la cadence) ou `call_script` (un script d'appel de la campagne). */
  @Column('text', { default: 'email' })
  kind: 'email' | 'call_script'
}
