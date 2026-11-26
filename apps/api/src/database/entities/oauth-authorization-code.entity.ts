import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * A short-lived, single-use OAuth authorization code. Persisted (not in-memory)
 * so single-use consumption is atomic across Railway replicas. We store only
 * the SHA-256 hash of the code, never the code itself. Bound to the client,
 * user, redirect_uri, scope, resource and PKCE challenge so the token exchange
 * can enforce every one of them.
 */
@Entity({ name: 'oauth_authorization_codes' })
export class OAuthAuthorizationCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index('oauth_auth_codes_hash_uidx', { unique: true })
  @Column('text')
  code_hash: string

  @Column('text')
  client_id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  redirect_uri: string

  @Column('text')
  scope: string

  @Column('text', { nullable: true })
  resource: string | null

  @Column('text')
  code_challenge: string

  @Column('text')
  code_challenge_method: string

  @Column('timestamptz')
  expires_at: Date

  /** Set the moment the code is redeemed — enforces single use. */
  @Column('timestamptz', { nullable: true })
  used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
