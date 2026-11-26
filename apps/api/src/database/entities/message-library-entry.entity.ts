import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import type {
  ContentVisibility,
  MessageLibraryClaim,
  MessageLibraryFactConfirmation,
  MessageLibraryMode,
  MessageLibraryStep,
  MessageLibraryStatus,
  OutreachChannel,
  OutreachPersona,
  OutreachScenarioId,
} from '@bellum/contracts'

/**
 * #3427 — une entrée de la bibliothèque versionnée d'exemples commerciaux.
 * Le cycle de lecture (`evaluateReadiness`, `selectApprovedTemplate`,
 * `renderVerbatim`) vit dans `@bellum/contracts` — jamais redeviné ici.
 *
 * Migration : `1796409491877-MessageLibraryEntries`.
 */
@Entity({ name: 'message_library_entries' })
export class MessageLibraryEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  created_by: string | null

  @Column('text')
  title: string

  @Column('text')
  body: string

  @Column('text')
  origin: string

  @Column('text')
  source_document: string

  @Column('integer', { default: 1 })
  version: number

  @Column('timestamptz')
  entry_date: Date

  @Column('text')
  channel: OutreachChannel

  @Column('text')
  scenario_id: OutreachScenarioId

  @Column('text')
  persona: OutreachPersona

  @Column('text')
  decision_role: string

  @Column('text')
  stage: string

  @Column('text')
  route: string

  /** #3437/#3438/#3440 — migration `1796426537419-MessageLibraryStep`. */
  @Column('text', { nullable: true })
  step: MessageLibraryStep | null

  @Column('text')
  objective: string

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  expected_variables: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  mandatory_facts: string[]

  /** #3439.1 — migration `1796415137291-MessageLibraryFactConfirmations`. */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  fact_confirmations: MessageLibraryFactConfirmation[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  claims: MessageLibraryClaim[]

  @Column('text', { default: 'a_revoir' })
  status: MessageLibraryStatus

  @Column('text')
  mode: MessageLibraryMode

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  usage_constraints: string[]

  /** #4158.30 — partagé avec l'équipe (défaut, comportement d'avant) ou personnel (son seul auteur). */
  @Column('text', { default: 'team' })
  visibility: ContentVisibility

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
