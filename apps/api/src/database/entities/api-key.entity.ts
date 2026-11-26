import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Workspace-owned API keys for the public read API (`/v1/*`).
 *
 * SECURITY — hash-only storage: the raw key (`blm_live_…`) is shown exactly
 * ONCE, in the creation response, and never persisted or logged. Only its
 * SHA-256 hex lands in `key_hash` (a 256-bit random secret needs no slow KDF —
 * same rationale as the OAuth refresh-token store). `prefix` keeps the first
 * few characters as a non-sensitive display hint so the owner can tell keys
 * apart in the settings screen.
 *
 * Revocation is a soft flag (`revoked_at`): the row is kept for audit, but the
 * guard only ever matches `revoked_at IS NULL`. API-owned table (read through
 * the service, never from the browser), so no RLS — mirrors `analysis_runs`
 * and the OAuth tables.
 */
@Entity({ name: 'api_keys' })
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index()
  @Column('uuid')
  workspace_id: string

  /** Human label chosen at creation (e.g. "Zapier prod"). */
  @Column('text')
  name: string

  /** SHA-256 hex of the full raw key. UNIQUE — the guard's lookup column. */
  @Index({ unique: true })
  @Column('text')
  key_hash: string

  /** Displayable, non-sensitive first characters (`blm_live_xxxx`). */
  @Column('text')
  prefix: string

  /** Granted scopes (`read:accounts`, `read:contacts`). */
  @Column('jsonb', { default: () => "'[]'::jsonb" })
  scopes: string[]

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  /** Created-by attribution (the workspace member who minted the key). */
  @Column('uuid')
  created_by: string

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
