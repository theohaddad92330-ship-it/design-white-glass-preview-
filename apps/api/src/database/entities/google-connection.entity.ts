import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** Only Google today; kept as a column so a future Microsoft 365 link can share
 *  the table (mirror of {@link CrmConnectionEntity}'s multi-provider shape). */
type GoogleProvider = 'google'

/**
 * A user's OAuth link to Google Workspace (Calendar / Gmail / Drive). Access and
 * refresh tokens are stored AES-256-GCM encrypted (reuses the CRM token crypto),
 * never in clear — a leaked DB dump must not hand out live mailbox credentials.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #4546 — PLUSIEURS BOÎTES PAR COMMERCIAL (décision Louis 25/10/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'ancien docblock disait que le lien était partagé par l'équipe et que
 * `(user_id, provider)` limitait à une connexion. Ce N'EST PLUS VRAI :
 *
 * - Les connexions sont PERSONNELLES : le commercial seul voit ses boîtes.
 * - L'index unique est `(user_id, provider, external_account_id)` : plusieurs
 *   boîtes par fournisseur, identifiées par leur adresse.
 * - `scope_type` distingue les connexions HÉRITÉES (`inherited_shared` — posées
 *   avant le 25/10, gardent leur comportement) des NOUVELLES (`personal`).
 *
 * Deliberately a MIRROR of {@link MicrosoftConnectionEntity}.
 */
@Entity({ name: 'google_connections' })
@Index('google_connections_multi_mailbox_uidx', ['user_id', 'provider', 'external_account_id'], { unique: true })
export class GoogleConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable to match crm_connections while the
  // user_id → workspace_id roll-out settles; every write path here stamps it.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  @Column('text')
  provider: GoogleProvider

  /** Google account id / email when known. Left NULL: the default scopes
   *  (calendar.events + gmail.send + drive.readonly) don't grant profile read. */
  @Column('text', { nullable: true })
  external_account_id: string | null

  /** Human label shown in the UI. NULL by default (no profile scope). */
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

  /** Dernier échec de rafraîchissement du jeton — voir la même colonne sur
   *  `crm_connections` : c'est lui, et non `expires_at`, qui signale une
   *  reconnexion nécessaire. Remis à NULL au premier rafraîchissement réussi. */
  @Column('timestamptz', { nullable: true })
  refresh_failed_at: Date | null

  /** Space-separated scopes actually granted by the user. */
  @Column('text', { nullable: true })
  scope: string | null

  /**
   * #4546 — Portée de la connexion : `personal` (nouvelles, le commercial seul
   * voit) ou `inherited_shared` (posées avant le 25/10/2026, gardent leur
   * comportement historique). Posé par la migration, jamais modifié après.
   */
  @Column('text', { nullable: true })
  scope_type: 'personal' | 'inherited_shared' | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
