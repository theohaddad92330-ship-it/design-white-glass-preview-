import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  ApprovedTemplateChannel,
  ApprovedTemplateScenarioId,
  ApprovedTemplateStatus,
  OutreachPersona,
} from '@bellum/contracts'

/**
 * #3417 (retour bêta 30/09, fiche contact) — la bibliothèque versionnée des
 * scripts et messages approuvés. Table de RÉFÉRENCE (peuplée par migration/
 * seed), pas d'écriture applicative dans cette tranche — voir
 * `ApprovedMessageTemplateService` (aucun endpoint POST/PUT/DELETE).
 *
 * `exact_text` porte le texte SOURCE, conservé sans réécriture automatique
 * (#3417) : contrairement à `message_style_templates` (règles de TON), ce
 * n'est jamais réécrit par un modèle, seulement affiché tel quel ou avec ses
 * variables substituées (`renderApprovedTemplate`, `@bellum/contracts`).
 */
@Entity({ name: 'outreach_approved_templates' })
export class ApprovedMessageTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('text')
  scenario: ApprovedTemplateScenarioId

  @Column('text')
  channel: ApprovedTemplateChannel

  @Column('text', { nullable: true })
  persona: OutreachPersona | null

  @Column('integer')
  sequence_step: number

  @Column('integer')
  delay_days: number

  @Column('integer', { default: 1 })
  version: number

  @Column('text')
  source: string

  @Column('text')
  exact_text: string

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  variables: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  required_evidence: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  forbidden_claims: string[]

  @Column('text', { default: 'active' })
  status: ApprovedTemplateStatus

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
