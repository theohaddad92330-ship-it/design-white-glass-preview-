import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** Self-serve integrations the user configures with their own credentials.
 *  Unlike the OAuth CRM link (`crm_connections`), these hold a single opaque
 *  endpoint the user pastes: a chat Incoming Webhook (Slack / Discord / Teams /
 *  Google Chat) or a generic HTTP webhook. The `provider` column is plain TEXT
 *  (no DB CHECK), so adding a value here needs no migration. */
export type IntegrationProvider = 'slack' | 'discord' | 'teams' | 'googlechat' | 'mattermost' | 'webhook'

/**
 * A user's self-configured outbound integration. One row per (user, provider).
 * The sensitive part — the webhook URL, which embeds a secret token for Slack —
 * is stored AES-256-GCM encrypted in `config_enc` (see crm-token.crypto, reused).
 * `label` is a non-sensitive display hint (the host), so the status list never
 * has to decrypt secrets just to render. RLS scopes rows to their owner.
 */
@Entity({ name: 'integrations' })
@Index('integrations_user_provider_uidx', ['user_id', 'provider'], { unique: true })
export class IntegrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  user_id: string

  @Column('text')
  provider: IntegrationProvider

  /** AES-256-GCM encrypted JSON config (e.g. `{"url":"https://…"}`). */
  @Column('text')
  config_enc: string

  /** Non-sensitive display label (usually the URL host). */
  @Column('text', { nullable: true })
  label: string | null

  /** Last REAL outbound use (test send or event fan-out that actually delivered).
   *  Unlike `updated_at` (config changes), this is the honest `last_sync` the
   *  Tool Registry surfaces. NULL until the first delivery — never invented. */
  @Column('timestamptz', { nullable: true })
  last_used_at: Date | null

  /** Event allow-list (e.g. `["buy_signal"]`). NULL = every event — the
   *  pre-existing behaviour, so legacy rows keep working unchanged. */
  @Column('jsonb', { nullable: true })
  events: string[] | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
