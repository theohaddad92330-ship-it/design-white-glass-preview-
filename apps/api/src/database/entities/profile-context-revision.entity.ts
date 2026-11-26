import type { ProfileContext } from '@bellum/contracts'
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm'

/**
 * Immutable snapshot of a user's `profile_context` at a given revision.
 * Written on every regeneration so past versions can be retrieved and restored.
 */
@Entity({ name: 'profile_context_revisions' })
@Unique(['user_id', 'version'])
export class ProfileContextRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  user_id: string

  @Column('int')
  version: number

  /** JSONB shape version at snapshot time (mirrors `PROFILE_CONTEXT_SCHEMA_VERSION`). */
  @Column('int')
  schema_version: number

  @Column('jsonb')
  profile_context: ProfileContext

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
