import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

/**
 * A user's TOTP two-factor factor (RFC 6238). One row per user (`user_id` is the
 * primary key). The Base32 secret is stored AES-256-GCM encrypted (same helper
 * as the CRM tokens — see crm-token.crypto), never in clear. `enabled` stays
 * `false` between enrollment and the first successful code verification, so a
 * half-finished setup never gates login. RLS scopes rows to their owner.
 */
@Entity({ name: 'user_mfa' })
export class UserMfaEntity {
  @PrimaryColumn('uuid')
  user_id: string

  /** AES-256-GCM encrypted Base32 TOTP secret. */
  @Column('text')
  secret_encrypted: string

  @Column('boolean', { default: false })
  enabled: boolean

  /** Codes erronés consécutifs sur le challenge ; remis à 0 au premier succès. */
  @Column('integer', { name: 'mfa_failed_attempts', default: 0 })
  failed_attempts: number

  /** Fin du verrou anti-bourrage, `null` si non verrouillé (finding #4). */
  @Column('timestamptz', { name: 'mfa_locked_until', nullable: true })
  locked_until: Date | null

  /** Dernier code accepté, pour refuser sa ré-soumission dans sa fenêtre. */
  @Column('text', { name: 'mfa_last_code', nullable: true })
  last_code: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
