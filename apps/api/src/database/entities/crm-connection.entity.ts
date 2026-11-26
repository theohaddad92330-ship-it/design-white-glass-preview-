import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * ⚠️ Élargir cette union DEMANDE d'élargir d'abord la contrainte SQL de
 * `sync_links.provider` — c'est la règle GA-11 / GA-12 : une valeur qui voyage
 * du code vers la base voit sa contrainte élargie AVANT le code qui l'écrit.
 * Pour `odoo`, c'est la migration `1791570000000-OdooProvider` ; pour `zoho`, la migration
 * `1796541540046-CrmFournisseursZoho` (#4187).
 *
 * `crm_connections.provider` est un TEXT nu, sans CHECK : ce typage est la
 * seule barrière de ce côté-là.
 */
type CrmProvider = 'hubspot' | 'salesforce' | 'pipedrive' | 'attio' | 'odoo' | 'zoho'

/**
 * A team's OAuth link to an external CRM. Access and refresh tokens are stored
 * AES-256-GCM encrypted (see crm-token.crypto), never in clear.
 *
 * Multi-user Phase 2: reads/writes are scoped by `workspace_id` (the CRM link is
 * shared across the team); `user_id` is kept as created-by attribution. The
 * `(user_id, provider)` unique index stays as-is (not flipped in this phase) —
 * identical today since 1 user = 1 workspace. RLS is the Phase-6 backstop.
 */
@Entity({ name: 'crm_connections' })
@Index('crm_connections_user_provider_uidx', ['user_id', 'provider'], { unique: true })
export class CrmConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

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

  @Column('text')
  provider: CrmProvider

  /** External account/portal id at the provider (HubSpot hub_id, Salesforce org id). */
  @Column('text', { nullable: true })
  external_account_id: string | null

  /** Per-account REST base the provider binds tokens to: Salesforce instance_url
   *  (e.g. https://acme.my.salesforce.com) or Pipedrive api_domain
   *  (e.g. https://acme.pipedrive.com). NULL for HubSpot (its API host is fixed). */
  @Column('text', { nullable: true })
  instance_url: string | null

  /** Zoho (L.6) : le serveur de comptes de la région RÉELLE de l'organisation, lu au retour OAuth
   *  (`accounts-server`). Sert au jeton, au rafraîchissement et à la révocation. NULL = le défaut de la
   *  config (connexions d'avant) et tous les autres CRM. */
  @Column('text', { nullable: true })
  accounts_server: string | null

  /** Salesforce (#4431) : l'hôte de connexion PROPRE à l'organisation (`https://<société>.my.salesforce.com`,
   *  ou `test.salesforce.com` pour un sandbox), saisi sur la carte. Sert au jeton, au rafraîchissement et à la
   *  révocation. NULL = l'hôte global de la config (`SALESFORCE_LOGIN_URL`) et tous les autres CRM. */
  @Column('text', { nullable: true })
  login_url: string | null

  /** Human label shown in the UI (portal domain / name). */
  @Column('text', { nullable: true })
  account_label: string | null

  /** AES-256-GCM encrypted access token. */
  @Column('text')
  access_token_enc: string

  /** AES-256-GCM encrypted refresh token. */
  @Column('text', { nullable: true })
  refresh_token_enc: string | null

  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  /** Dernier échec de rafraîchissement du jeton — le SEUL fait qui prouve qu'une
   *  reconnexion est nécessaire. `expires_at` ne dit que l'âge du jeton d'accès,
   *  qui se renouvelle tout seul tant que le refresh token vaut. Remis à NULL au
   *  premier rafraîchissement réussi. */
  @Column('timestamptz', { nullable: true })
  refresh_failed_at: Date | null

  @Column('text', { nullable: true })
  scope: string | null

  /** Last REAL use of the link (contact export / activity log). Unlike
   *  `updated_at` (token refreshes, reconnects), this is the honest `last_sync`
   *  the Tool Registry surfaces. NULL until first use — never invented. */
  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
