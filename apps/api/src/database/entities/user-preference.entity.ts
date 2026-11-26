import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Durable, free-form copilot preferences for one user ("long memory", Théo P2) —
 * e.g. preferred tone, language, default target sectors, do/don't rules. One row
 * per user (`user_id` unique); the shape is a JSONB bag so new preference keys
 * ship without a migration. RLS scopes rows to their owner (`auth.uid() =
 * user_id`). Personal, so not workspace-scoped.
 */
@Entity({ name: 'user_preferences' })
export class UserPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid', { unique: true })
  user_id: string

  @Column('jsonb', { default: {} })
  preferences: Record<string, unknown>

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
