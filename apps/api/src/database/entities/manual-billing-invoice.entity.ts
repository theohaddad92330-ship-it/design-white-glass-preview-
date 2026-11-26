import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

/** Whether the money for this invoice arrived. Reconciled by hand — nothing in
 *  the app watches a bank account. */
export type ManualInvoicePaymentStatus = 'unpaid' | 'paid'

/**
 * ONE invoice emitted for an invoice-billed client — the ledger that makes
 * « no invoice since the commitment ended » a fact instead of a feeling.
 *
 * Why this table exists. `manual_billing_terms` carried a SINGLE `reference`
 * and a SINGLE `payment_status`: it could say what was sold, never what has
 * been billed since. A client three months into a contract, invoiced once,
 * looked exactly like a client invoiced every month — the row is the same row.
 * With one line per invoice, the question « has anything been issued for
 * October? » has an answer that a screen and a sweep can both read.
 *
 * Still NOT an invoicing engine: no PDF is produced, no reminder is sent, no
 * amount is reconciled against a bank. `reference` is the number issued in the
 * accounting tool that actually emits the document — this table records that it
 * exists, and which period it covers.
 *
 * ⚠️ `paid_on` is nullable NEXT TO a `payment_status` that says `paid`, and
 * that is not a contradiction: the seventeen clients migrated from the old
 * single-line terms are known to be paid, and the day the money landed was
 * never recorded. A guessed date would be an invented fact; `NULL` is « on ne
 * sait pas ». The derivation reads the STATUS, never the date.
 */
@Entity({ name: 'manual_billing_invoices' })
@Index(['workspace_id', 'period_start'])
export class ManualBillingInvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  workspace_id: string

  /** The invoice number issued in the accounting tool. Unique per workspace —
   *  the same document recorded twice would make a period look covered twice
   *  and a missing one look filled. */
  @Column('text')
  reference: string

  @Column('integer', { default: 0 })
  amount_cents: number

  @Column('text', { default: 'EUR' })
  currency: string

  /** `YYYY-MM-DD` — first day of the period the invoice covers. */
  @Column('date')
  period_start: string

  /** `YYYY-MM-DD` — last day of the period the invoice covers. */
  @Column('date')
  period_end: string

  /** `YYYY-MM-DD` the document was emitted, when known. `null` on the rows
   *  migrated from the old terms, where it never was. */
  @Column('date', { nullable: true })
  issued_on: string | null

  @Column('text', { default: 'unpaid' })
  payment_status: ManualInvoicePaymentStatus

  /** `YYYY-MM-DD` the money landed, when known. Never derived from the status. */
  @Column('date', { nullable: true })
  paid_on: string | null

  @Column('text', { nullable: true })
  notes: string | null

  /**
   * Quand le client a CONTESTÉ cette facture. `null` = aucun litige déclaré.
   *
   * ⚠️ Le litige n'est PAS un statut de paiement (#1655). Une facture contestée
   * est aussi une facture impayée : les deux faits coexistent, et les mettre
   * dans `payment_status` les rendrait mutuellement exclusifs. Trois colonnes,
   * comme sur `invoice_readiness` côté produit client, et la même dérivation
   * partagée (`isDisputeOpen`).
   */
  @Column('timestamptz', { nullable: true })
  disputed_at: Date | null

  /** Ce que le client REPROCHE, dans les mots de celui qui l'a entendu — jamais
   *  un code, jamais une catégorie devinée. OBLIGATOIRE dès qu'un litige est
   *  déclaré (contrainte `manual_billing_invoices_dispute_reason_check`). */
  @Column('text', { nullable: true })
  dispute_reason: string | null

  /** Quand le litige a été LEVÉ. `null` pendant qu'il court. On ne remet jamais
   *  `disputed_at` à `null` : effacer ferait disparaître le fait, et c'est lui
   *  qui explique le retard de paiement. */
  @Column('timestamptz', { nullable: true })
  dispute_resolved_at: Date | null

  /**
   * Les relances CONSIGNÉES sur cette facture, de la plus ancienne à la plus
   * récente — règle 4 de #1655, « chaque relance est journalisée avec sa date et
   * son auteur ».
   *
   * ⚠️ Un TABLEAU et pas un compteur : le rang se dérive de sa longueur, si bien
   * qu'il n'y a rien à tenir cohérent. `[]` (et non `null`) parce que « aucune
   * relance » est un fait connu, pas une absence de mesure. Rien ici n'ENVOIE :
   * une ligne s'ajoute quand un humain déclare avoir envoyé le message préparé.
   */
  @Column('jsonb', { default: () => `'[]'::jsonb` })
  reminders: Array<{ at: string; by: string; tone: string; index: number }>

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date
}
