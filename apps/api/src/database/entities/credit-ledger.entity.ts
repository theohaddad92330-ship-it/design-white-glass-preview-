import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

/** Every mutation of the shared credit pool, as an append-only audit row.
 *  Kinds:
 *   - `consume_analysis` / `refund_analysis`   → analysis slots (delta ∓1)
 *   - `consume_enrichment` / `refund_enrichment` → enrichment credits (delta ∓1)
 *   - `grant_plan`                             → plan (re)provisioned (delta = +N)
 *   - `topup`                                  → one-shot purchase (delta = +N)
 *   - `ownership_transfer`                      → the pool changed holder (delta = 0, #4158.33)
 *  `delta` is the signed change to AVAILABLE credits (negative = consumed). */
export type CreditLedgerKind =
  | 'consume_analysis'
  | 'refund_analysis'
  | 'consume_enrichment'
  | 'refund_enrichment'
  | 'grant_plan'
  | 'topup'
  | 'ownership_transfer'

/** Which resource the entry touches — analyses and enrichments are two
 *  independent counters on the subscription row. */
export type CreditLedgerResource = 'analysis_slot' | 'enrichment_credit'

/**
 * Append-only ledger of every credit movement in a workspace's shared pool
 * (Théo §14 — « ledger crédits fiable » : the running `accounts_used` /
 * `enrichment_credits` counters on `subscriptions` are a balance, not a history,
 * so a burned-then-refunded slot or a disputed enrichment left no trace). Each
 * consume / refund / grant / top-up writes one immutable row here so billing is
 * auditable end to end. Writing a row is best-effort — a ledger failure never
 * blocks the billing hot path.
 */
@Entity({ name: 'credit_ledger' })
@Index('credit_ledger_owner_created_idx', ['owner_user_id', 'created_at'])
@Index('credit_ledger_refund_analysis_once_idx', ['refunds_ledger_id'], {
  unique: true,
  where: "kind = 'refund_analysis' AND refunds_ledger_id IS NOT NULL",
})
export class CreditLedgerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  /** The billing subject: the workspace OWNER whose pool moved. */
  @Column('uuid')
  owner_user_id: string

  /** Workspace the movement belongs to (null if it couldn't be resolved). */
  @Column('uuid', { nullable: true })
  workspace_id: string | null

  /** The member who triggered it — may differ from the owner in a team. */
  @Column('uuid', { nullable: true })
  actor_user_id: string | null

  @Column('text')
  kind: CreditLedgerKind

  @Column('text')
  resource: CreditLedgerResource

  /** Signed change to available credits: −1 consume, +1 refund, +N grant/top-up. */
  @Column('integer')
  delta: number

  /** Human-readable context (company name, plan key, Stripe event id…). */
  @Column('text', { nullable: true })
  reason: string | null

  /** The account this movement relates to, when applicable. */
  @Column('uuid', { nullable: true })
  account_id: string | null

  /** Pour un `refund_analysis` : l'id du débit `consume_analysis` qu'il solde.
   *  Un index unique partiel (#4123) refuse un second remboursement du même
   *  débit — c'est la base, pas une lecture suivie d'une écriture, qui tient
   *  « une seule fois ». NULL pour tout le reste et pour l'historique. */
  @Column('uuid', { nullable: true })
  refunds_ledger_id: string | null

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date
}
