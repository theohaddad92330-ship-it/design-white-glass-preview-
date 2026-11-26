import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/**
 * One append-only product-analytics event (self-hosted, no third-party SaaS).
 * Written best-effort at the business edges by {@link ProductAnalyticsService} —
 * a failure to record must never break the flow that emitted it. Read back only
 * by the internal `/analytics/overview` rollups.
 *
 * API-owned (no RLS): the only reads are the operator overview behind the
 * internal-secret guard. Columns stay bare `uuid` (no hard FK) so an event
 * survives the deletion of the user/workspace it references.
 */
@Entity({ name: 'product_events' })
@Index('product_events_name_occurred_idx', ['event_name', 'occurred_at'])
@Index('product_events_workspace_occurred_idx', ['workspace_id', 'occurred_at'])
// #1681.4 — le seul index qui sert la lecture comportementale : compter des
// SESSIONS DISTINCTES par événement suppose de pouvoir lire `session_id` sans
// balayer toute la table.
@Index('product_events_session_occurred_idx', ['session_id', 'occurred_at'])
export class ProductEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** Stable event name, e.g. `analysis_started` (see `ProductEventName`). */
  @Column('text')
  event_name: string

  /**
   * The acting user for an AUDIT event (`member_removed`,
   * `portfolio_handed_over`…) — never null for that flow, `track()` refuses to
   * write without it.
   *
   * #1681.4 — nullable since this migration for the BEHAVIORAL flow
   * (`screen_viewed`, `filter_applied`…): those rows carry NO personal
   * identifier at all, by doctrine (`c64_analytique_produit`, rule 4). The two
   * flows share this table but never this column: an audit row always has a
   * `user_id`, a behavioral row never does — `trackBehavioral()` writes `null`
   * unconditionally, it never reads a user off the request.
   */
  @Column('uuid', { nullable: true })
  user_id: string | null

  /** Team scope, when resolvable. Nullable: some events (billing webhook,
   *  onboarding) have no workspace context and must still be recorded.
   *  #1681.4 — always `null` on a BEHAVIORAL row: doctrine rule 5 forbids
   *  reconstituting "at this named client, this screen is abandoned" from this
   *  table, and the simplest way to keep that structurally true is to never
   *  write the workspace on that flow in the first place. */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** Non-sensitive event dimensions (scope_mode, cost_eur, destination…). Scrubbed
   *  of obviously-sensitive keys before insert; never PII beyond `user_id`. On a
   *  BEHAVIORAL row (#1681.4), the keys are further restricted to an ALLOW-list
   *  per event name (`sanitizeBehavioralProperties`) — never a field's value, a
   *  filter's value, or a search query. */
  @Column('jsonb', { default: {} })
  properties: Record<string, unknown>

  /**
   * #1681.4 — was free-form and had ZERO writer and ZERO reader (doctrine gap,
   * `c64_analytique_produit`). It is now the ROTATED SESSION HASH of a
   * behavioral event (`hashBehavioralSession()`, `@bellum/contracts`) — never a
   * raw seed, never a user id. `null` on an audit row, which correlates by
   * `user_id` instead. */
  @Column('text', { nullable: true })
  session_id: string | null

  @Column('timestamptz', { default: () => 'now()' })
  occurred_at: Date
}
