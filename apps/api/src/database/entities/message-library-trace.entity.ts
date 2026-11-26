import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * #3446.10 — la trace PERSISTANTE de chaque production de Laura issue de la
 * bibliothèque : modèle + version, exemples injectés, règles appliquées,
 * variables, preuves manquantes, contrôles (écartés) et décision finale.
 * Journal en ajout seul : on archive, on ne supprime pas. Aucun CORPS de
 * message n'y est stocké — des identifiants et des raisons, jamais le texte.
 *
 * Migration : `1796419034517-MessageLibraryTraces`.
 */
@Entity({ name: 'message_library_traces' })
export class MessageLibraryTraceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  @Column('uuid', { nullable: true })
  user_id: string | null

  /** `verbatim` (modèle approuvé) ou `inspiration` (exemples de comportement). */
  @Column('text')
  kind: 'verbatim' | 'inspiration'

  @Column('uuid', { nullable: true })
  entry_id: string | null

  @Column('integer', { nullable: true })
  entry_version: number | null

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  criteria: Record<string, string>

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  injected_example_ids: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  rules: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  variables: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  proofs_missing: string[]

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  checks: { id: string; reason: string }[]

  @Column('text')
  decision: 'template_selected' | 'no_template' | 'examples_injected' | 'no_example'

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
