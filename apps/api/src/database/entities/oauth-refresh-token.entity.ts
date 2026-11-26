import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * A rotating OAuth refresh token. Only the SHA-256 hash is stored. Rotation
 * lineage is tracked by `family_id` (stamped at first issuance) with
 * `parent_id`/`replaced_by_id` links: presenting an already-rotated token is
 * treated as theft and revokes the ENTIRE family (`revoked_at`). `used_at`
 * marks a token that has been rotated away.
 */
@Entity({ name: 'oauth_refresh_tokens' })
export class OAuthRefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index('oauth_refresh_tokens_hash_uidx', { unique: true })
  @Column('text')
  token_hash: string

  @Index('oauth_refresh_tokens_family_idx')
  @Column('uuid')
  family_id: string

  @Column('uuid', { nullable: true })
  parent_id: string | null

  @Column('uuid', { nullable: true })
  replaced_by_id: string | null

  @Column('text')
  client_id: string

  @Index('oauth_refresh_tokens_user_idx')
  @Column('uuid')
  user_id: string

  @Column('text')
  scope: string

  @Column('text', { nullable: true })
  resource: string | null

  @Column('timestamptz')
  expires_at: Date

  /** Set when this token is rotated away (consumed). */
  @Column('timestamptz', { nullable: true })
  used_at: Date | null

  /** Set when the token (or its whole family) is revoked. */
  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
