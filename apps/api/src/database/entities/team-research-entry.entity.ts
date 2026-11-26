import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Une recherche Découvrir conservée pour l'équipe (Théo D team-recherches.N1).
 * Voir la migration `1796575071694-TeamResearchEntries`.
 */
@Entity({ name: 'team_research_entries' })
@Index('team_research_entries_user_key_idx', ['workspace_id', 'user_id', 'filters_key'], { unique: true })
@Index('team_research_entries_workspace_updated_idx', ['workspace_id', 'updated_at'])
export class TeamResearchEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  title: string

  @Column('text', { nullable: true })
  scope_label: string | null

  @Column('jsonb')
  filters: Record<string, unknown>

  /** Empreinte stable des filtres : une relance du même périmètre remonte la ligne. */
  @Column('text')
  filters_key: string

  /** Comptes du résultat ; `NULL` = non mesuré, jamais 0. */
  @Column('integer', { nullable: true })
  result_count: number | null

  /** Les comptes DÉJÀ dans l'espace parmi le résultat (pour compter les actions ouvertes). */
  @Column('uuid', { array: true, default: '{}' })
  account_ids: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
