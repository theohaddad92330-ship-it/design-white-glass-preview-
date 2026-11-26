import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/**
 * Per-user billing state: plan, Stripe IDs, account caps, enrichment credit
 * balance. Seeded on signup by `handle_new_user_credits`. Renamed from
 * `user_credits` by migration 1780000000001.
 */
@Entity({ name: 'subscriptions' })
export class SubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index({ unique: true })
  @Column('uuid')
  user_id: string

  @Column('text', { default: 'trial' })
  plan: string

  @Column('integer', { default: 40 })
  accounts_limit: number

  @Column('integer', { default: 0 })
  accounts_used: number

  /**
   * One-off analysis capacity bought as a top-up pack, on top of the plan's
   * `accounts_limit`. Spendable capacity for the cycle is
   * `accounts_limit + topup_analyses`.
   *
   * Separate from `accounts_limit` ON PURPOSE: a top-up is a one-shot purchase
   * ("crédits ponctuels sans changer d'abonnement") and the CGV say unused
   * credits do not roll over. Folding it into the plan cap made it permanent —
   * the monthly reset zeroes `accounts_used` but never restores
   * `accounts_limit`, so one pack raised the monthly quota forever. Keeping the
   * purchased extra in its own column is what lets the reset refill the plan
   * quota while expiring what was bought for that cycle.
   */
  @Column('integer', { default: 0 })
  topup_analyses: number

  @Column('integer', { default: 75 })
  enrichment_credits: number

  @Column('text', { nullable: true })
  stripe_customer_id: string | null

  @Column('text', { nullable: true })
  stripe_subscription_id: string | null

  /**
   * Who owns this row's billing state.
   *
   * - `stripe` (default, every pre-existing row): the self-serve subscription is
   *   the source of truth — checkout and the webhooks write plan + quotas.
   * - `manual`: an operator negotiated the contract in the backoffice and the
   *   client is invoiced offline. There is no Stripe customer or subscription,
   *   and none must ever be created for them.
   *
   * Explicit on purpose. `stripe_subscription_id IS NULL` cannot stand in for
   * this: NULL also means trial, abandoned checkout, or half-finished signup.
   * Every entitlement path that has to tell "invoice-billed customer" from
   * "never paid" reads THIS, never the absence of a Stripe id.
   */
  @Column('text', { default: 'stripe' })
  billing_mode: 'stripe' | 'manual'

  /** When the 7-day Pro trial ends. Set for `plan = 'trial'`, NULL for paid
   *  plans. A trial whose `trial_end` is in the past is locked (no analyses /
   *  enrichments) until the user picks a paid plan. */
  @Column('timestamptz', { nullable: true })
  trial_end: Date | null

  /** Start of the current monthly quota window (paid plans). The reset cron
   *  zeroes `accounts_used` and refills `enrichment_credits` to the plan quota
   *  once this is a month old, then advances it. */
  @Column('timestamptz', { default: () => 'now()' })
  period_start: Date

  /** Paid seats beyond those bundled in the plan, billed as a second Stripe
   *  line item. Seat allowance = plan seats + this. */
  @Column('integer', { default: 0 })
  extra_seats: number

  /**
   * Crédits reportés du cycle précédent (grille du 16/08 : « crédits non
   * utilisés reportables sur 30 jours »).
   *
   * Ils s'ajoutent au plafond du cycle tant que {@link rollover_expires_at} est
   * dans le futur — même mécanique que `topup_analyses`, si bien qu'aucune ligne
   * de consommation n'a à choisir dans quel ordre puiser. Passée l'échéance, la
   * capacité retombe d'elle-même : rien à purger, rien qui devienne négatif.
   */
  @Column('integer', { default: 0 })
  rollover_credits: number

  /** Fin de validité du report. NULL = aucun report en cours. */
  @Column('timestamptz', { nullable: true })
  rollover_expires_at: Date | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
