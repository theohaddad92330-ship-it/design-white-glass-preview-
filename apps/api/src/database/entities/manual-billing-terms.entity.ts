import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** How often the negotiated amount is invoiced. */
export type ManualBillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_off'

/** Who the invoice is made out to. A beta client can be a company or a private
 *  individual — Julien Laszlo (01/09/2026) is billed personally while working
 *  at an ESN, and that fact used to live in a sentence in `notes`. */
export type ManualBillingBilledToKind = 'person' | 'company'

/**
 * Commercial terms of an invoice-billed (sales-led) workspace — what was sold,
 * recorded for the operator. One row per workspace.
 *
 * Deliberately NOT an invoicing engine: no PDF is produced, no reminder is
 * sent, no amount is reconciled. The invoices actually emitted live in
 * `manual_billing_invoices`, one row each; this table holds the CONTRACT.
 * Entitlement lives on `subscriptions` (plan + quotas + `billing_mode`).
 *
 * ⚠️ Still read by no GATE — nothing here suspends an account. What changed on
 * 02/09/2026 is that it is read by a WARNING: `commitment_months` and the
 * invoice ledger let the backoffice and the daily sweep say « three months are
 * over and nothing has been invoiced since ». That sentence used to live in
 * `notes`, where no code could ever find it.
 */
@Entity({ name: 'manual_billing_terms' })
export class ManualBillingTermsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Index({ unique: true })
  @Column('uuid')
  workspace_id: string

  /** Negotiated amount for one `period`, in cents (same convention as
   *  `plan_definitions.price_cents`). */
  @Column('integer', { default: 0 })
  amount_cents: number

  @Column('text', { default: 'EUR' })
  currency: string

  @Column('text', { default: 'yearly' })
  period: ManualBillingPeriod

  /** First day of the contract, `YYYY-MM-DD` (a `date`, not a timestamp — the
   *  contract start is a calendar fact, not an instant). */
  @Column('date')
  start_date: string

  /**
   * Length of the commitment, in months. `NULL` = no commitment was agreed —
   * NEVER `0`, which would read as « a contract that ends the day it starts ».
   * The end DATE is derived in one place (`commitmentEndOf`) and stored
   * nowhere: two columns that must stay consistent eventually stop being.
   */
  @Column('integer', { nullable: true })
  commitment_months: number | null

  /** Who the invoice is made out to, when it is not simply the ESN. */
  @Column('text', { nullable: true })
  billed_to_name: string | null

  @Column('text', { nullable: true })
  billed_to_kind: ManualBillingBilledToKind | null

  /** Where the invoice is sent, and the number to call about it. Both used to
   *  be a sentence in `notes`, so nothing could list them. */
  @Column('text', { nullable: true })
  billing_email: string | null

  @Column('text', { nullable: true })
  billing_phone: string | null

  /** Free text — a PO reference, the contract's own number, etc. The invoice
   *  numbers live on `manual_billing_invoices`, one per document. */
  @Column('text', { nullable: true })
  reference: string | null

  @Column('text', { nullable: true })
  notes: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
