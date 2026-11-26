import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * A user's OAuth link to Microsoft 365 (Outlook Mail + Calendar via Microsoft
 * Graph). Access and refresh tokens are stored AES-256-GCM encrypted (reuses the
 * CRM token crypto, see crm-token.crypto), never in clear.
 *
 * Dedicated table rather than `crm_connections`: this is an email/calendar link,
 * not a CRM object write-back, and keeping it isolated means dropping the
 * Microsoft module removes exactly one table and touches nothing else (rule #7).
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
 * Deliberately a MIRROR of {@link GoogleConnectionEntity}.
 */
@Entity({ name: 'microsoft_connections' })
@Index('microsoft_connections_multi_mailbox_uidx', ['user_id', 'provider', 'external_account_id'], { unique: true })
export class MicrosoftConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  // Team scope (multi-user Phase 2). Nullable while the user_id → workspace_id
  // roll-out is mid-flight; every write path here stamps it. `user_id` stays as
  // created-by attribution, `workspace_id` is the read scope.
  @Index()
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Always `'microsoft'` — see the class comment. */
  @Column('text')
  provider: string

  /** Microsoft Graph user id (`/me` → `id`) — stable per mailbox. */
  @Column('text', { nullable: true })
  external_account_id: string | null

  /** Human label shown in the UI (the connected mailbox: email or UPN). */
  @Column('text', { nullable: true })
  account_label: string | null

  /** AES-256-GCM encrypted access token. */
  @Column('text')
  access_token_enc: string

  /** AES-256-GCM encrypted refresh token (present when `offline_access` granted). */
  @Column('text', { nullable: true })
  refresh_token_enc: string | null

  @Column('timestamptz', { nullable: true })
  expires_at: Date | null

  /** Dernier échec de rafraîchissement du jeton — voir la même colonne sur
   *  `crm_connections`. Chez Microsoft le jeton de rafraîchissement se périme
   *  pour de vrai (mot de passe changé, consentement retiré) : c'est cet échec-là
   *  qui doit allumer « à reconnecter », pas l'heure du jeton d'accès. */
  @Column('timestamptz', { nullable: true })
  refresh_failed_at: Date | null

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
