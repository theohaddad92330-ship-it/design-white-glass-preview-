import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'attack_angles' })
export class AttackAngleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  account_id: string

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

  @Column('text', { nullable: true })
  title: string | null

  @Column('text', { nullable: true })
  description: string | null

  @Column('text', { nullable: true })
  entry_point: string | null

  @Column('boolean', { nullable: true })
  is_recommended: boolean | null

  @Column('integer', { nullable: true })
  rank: number | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
