import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * An OAuth 2.1 client registered via Dynamic Client Registration (RFC 7591).
 *
 * v1 issues PUBLIC clients only (`token_endpoint_auth_method = 'none'`, no
 * secret) — every MCP client is a public + PKCE client. `client_secret_hash`
 * is reserved for a future confidential-client mode and is always null today.
 */
@Entity({ name: 'oauth_clients' })
export class OAuthClientEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index('oauth_clients_client_id_uidx', { unique: true })
  @Column('text')
  client_id: string

  @Column('text', { nullable: true })
  client_name: string | null

  /** Exact-match set of allowed redirect URIs. */
  @Column('text', { array: true })
  redirect_uris: string[]

  @Column('text', { array: true, default: () => `ARRAY['authorization_code','refresh_token']::text[]` })
  grant_types: string[]

  @Column('text', { array: true, default: () => `ARRAY['code']::text[]` })
  response_types: string[]

  @Column('text', { default: 'none' })
  token_endpoint_auth_method: string

  @Column('text', { nullable: true })
  scope: string | null

  /** Reserved for confidential clients; always null in v1. */
  @Column('text', { nullable: true })
  client_secret_hash: string | null

  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
