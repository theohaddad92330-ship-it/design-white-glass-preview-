import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * Public share link to an account dossier. The slug is part of the URL
 * (no token, no JWT in the path) — anyone holding the link can read the
 * dossier until `expires_at`. Rows persist so we can revoke or list past
 * shares per user.
 */
@Entity({ name: 'account_shares' })
export class AccountShareEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index({ unique: true })
  @Column('text')
  slug: string

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
  // created-by attribution; the slug remains the public read key (share links
  // are resolved by slug, not by scope).
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  // #2914 (#2128.11) — 'full' (dossier entier, comportement historique) ou
  // 'evaluation' (score + justification seuls). Voir AccountShareSection
  // (@bellum/contracts).
  @Column('text', { default: 'full' })
  section: string

  @Column('timestamptz')
  expires_at: Date

  @Column('timestamptz', { nullable: true })
  revoked_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
