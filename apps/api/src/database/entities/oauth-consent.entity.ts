import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A remembered user→client authorization ("this app may access my Bellum
 * account for these scopes"). Lets the authorize endpoint skip re-consent when
 * the requested scope is already granted, and drives the /settings "connected
 * apps" list. Revoking it (`revoked_at`) is the user-facing kill switch: the
 * next introspection returns inactive. Unique per (user, client).
 */
@Entity({ name: 'oauth_consents' })
@Index('oauth_consents_user_client_uidx', ['user_id', 'client_id'], { unique: true })
export class OAuthConsentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  client_id: string

  /** The granted scope set (space-delimited). */
  @Column('text')
  scope: string

  @Column('text', { nullable: true })
  resource: string | null

  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
