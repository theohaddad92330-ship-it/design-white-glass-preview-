import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** One term of a group's reading grid (see AccountVocabulary1783400000000). */
@Entity({ name: 'account_vocabulary' })
@Index(['account_id', 'term_key'], { unique: true })
export class AccountVocabularyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight (see agent_docs/multi-user-workspaces.md): the Phase-1
  // migration backfilled it 1:1 from each row's owner workspace, and it flips to
  // NOT NULL only once every write path stamps it. `user_id` stays as the
  // created-by attribution; `workspace_id` becomes the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Index()
  @Column('uuid')
  account_id: string

  @Column('text')
  term: string

  /** Accent/case-normalised term — the dedup/merge key. */
  @Column('text')
  term_key: string

  @Column('text')
  kind: string

  @Column('text', { nullable: true })
  meaning: string | null

  @Column('text', { nullable: true })
  commercial_why: string | null

  @Column('jsonb', { default: () => "'[]'" })
  aliases: string[]

  @Column('text', { nullable: true })
  related_entity: string | null

  @Column('text', { nullable: true })
  truth_status: string | null

  @Column('jsonb', { default: () => "'[]'" })
  source_refs: string[]

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
