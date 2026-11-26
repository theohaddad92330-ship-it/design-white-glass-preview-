import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * #2455 — Contexte de travail enregistré (LAU-FINAL-168). Variante de profil
 * (marché, offre, secteurs…) que l'utilisateur active SANS jamais modifier son
 * profil principal (`profiles`/`esn_profiles`). Voir migration `WorkContexts`.
 */
@Entity({ name: 'work_contexts' })
@Index('work_contexts_owner_idx', ['workspace_id', 'owner_user_id', 'status'])
export class WorkContextEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  owner_user_id: string

  @Column('text')
  name: string

  /** personal | bu | group — le multi-BU (#2455.7). */
  @Column('text', { default: 'personal' })
  visibility: 'personal' | 'bu' | 'group'

  @Column('uuid', { nullable: true })
  business_unit_id: string | null

  @Column('text', { nullable: true })
  objective: string | null

  @Column('text', { nullable: true })
  offer: string | null

  @Column('text', { nullable: true })
  expertise: string | null

  @Column('jsonb', { default: () => "'[]'" })
  technologies: string[]

  @Column('jsonb', { default: () => "'[]'" })
  sectors: string[]

  @Column('jsonb', { default: () => "'[]'" })
  territories: string[]

  @Column('jsonb', { default: () => "'[]'" })
  company_types: string[]

  @Column('jsonb', { default: () => "'[]'" })
  sizes: string[]

  @Column('text', { nullable: true })
  delivery_model: string | null

  @Column('jsonb', { default: () => "'[]'" })
  exclusions: string[]

  /** `references` est un mot réservé SQL — colonne `reference_list`. */
  @Column('jsonb', { default: () => "'[]'" })
  reference_list: string[]

  @Column('text', { nullable: true })
  capacity: string | null

  @Column('jsonb', { default: () => "'[]'" })
  data_layers: string[]

  /** temporaire | enregistre | partage | archive (#2455.3 — les quatre types). */
  @Column('text', { default: 'enregistre' })
  status: 'temporaire' | 'enregistre' | 'partage' | 'archive'

  @Column('int', { default: 1 })
  version: number

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
