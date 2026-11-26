import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { EntityManager, Repository } from 'typeorm'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { asDay } from '../../common/day'

/**
 * #2419.1 — l'objet PAYMENT, distinct de la facture.
 *
 * Tranché par Louis 22/09 soir (decisions §1) — reco appliquée : un paiement
 * n'a PAS de statut (c72 : le cycle d'encaissement reste aux quatre valeurs de
 * `collections.ts`). Il a un montant, une date de réception, une source
 * nommée (`manual` — c80), et une facture à laquelle il est rattaché, ou pas
 * encore (« à rapprocher »).
 *
 * Bellum ne rapproche aucun compte bancaire (D33) : tout paiement ici a été
 * CONSTATÉ et saisi par quelqu'un. Rien ne part vers un tiers, rien n'est
 * comptabilisé (« BellumAI SUIT le financier, il ne COMPTABILISE pas »).
 */
export interface InvoicePayment {
  id: string
  /** `null` = à rapprocher : aucun humain ne l'a encore rattaché à une facture. */
  invoiceReadinessId: string | null
  missionId: string | null
  missionLabel: string | null
  accountName: string | null
  periodMonth: string | null
  amountCents: number
  receivedOn: string
  payer: string | null
  reference: string | null
  source: 'manual'
  matchedAt: string | null
  customerCreditNote: string | null
  customerCreditNotedAt: string | null
}

interface InvoiceCandidate {
  invoiceReadinessId: string
  missionId: string
  missionLabel: string | null
  accountName: string | null
  periodMonth: string
  dueCents: number
}

interface UnmatchedPayment extends InvoicePayment {
  /** Les factures dont le reste dû égale ce paiement — PROPOSÉES, jamais rattachées seules. */
  candidates: InvoiceCandidate[]
  /** Plus d'une candidate : le rapprochement attend une validation humaine (#2419.3). */
  ambiguous: boolean
}

interface OverpaidInvoice {
  invoiceReadinessId: string
  missionId: string
  missionLabel: string | null
  accountName: string | null
  periodMonth: string
  invoicedAmountCents: number
  paidTotalCents: number
  paymentCount: number
  excessCents: number
}

/** Ce que `GET /delivery/payments` rend. */
export interface PaymentsView {
  unmatched: UnmatchedPayment[]
  overpaid: OverpaidInvoice[]
}

interface PaymentRow {
  id: string
  invoice_readiness_id: string | null
  mission_id: string | null
  mission_label: string | null
  account_name: string | null
  period_month: string | Date | null
  amount_cents: string | number
  received_on: string | Date
  payer: string | null
  reference: string | null
  source: string
  matched_at: string | Date | null
  customer_credit_note: string | null
  customer_credit_noted_at: string | Date | null
}

const iso = (value: string | Date | null): string | null => (value ? new Date(value).toISOString() : null)

function toPayment(row: PaymentRow): InvoicePayment {
  return {
    id: row.id,
    invoiceReadinessId: row.invoice_readiness_id,
    missionId: row.mission_id,
    missionLabel: row.mission_label,
    accountName: row.account_name,
    periodMonth: asDay(row.period_month),
    amountCents: Number(row.amount_cents),
    receivedOn: asDay(row.received_on) ?? String(row.received_on),
    payer: row.payer,
    reference: row.reference,
    source: 'manual',
    matchedAt: iso(row.matched_at),
    customerCreditNote: row.customer_credit_note,
    customerCreditNotedAt: iso(row.customer_credit_noted_at),
  }
}

const PAYMENT_COLUMNS = `p.id, p.invoice_readiness_id, ir.mission_id, m.label AS mission_label, a.company_name AS account_name,
  ir.period_month, p.amount_cents, p.received_on, p.payer, p.reference, p.source, p.matched_at,
  p.customer_credit_note, p.customer_credit_noted_at`

/**
 * L'encaissé d'une facture = la SOMME de ses paiements rattachés (#2419.1).
 *
 * Un paiement NOTÉ en crédit client (#2419.11) n'éteint plus cette facture :
 * il est dû au client, pas à elle. Une facture sans aucun paiement rattaché
 * garde ce qu'elle avait (`s.total IS NOT NULL`) — un encaissement « non
 * mesuré » ne devient pas zéro.
 */
async function resyncPaid(manager: EntityManager, workspaceId: string, invoiceReadinessId: string): Promise<void> {
  await manager.query(
    `UPDATE invoice_readiness ir
        SET paid_amount_cents = s.total, paid_at = s.last_received::timestamptz, updated_at = now()
       FROM (SELECT SUM(p.amount_cents) AS total, MAX(p.received_on) AS last_received
               FROM invoice_payments p
              WHERE p.workspace_id = $1 AND p.invoice_readiness_id = $2 AND p.customer_credit_noted_at IS NULL) s
      WHERE ir.workspace_id = $1 AND ir.id = $2 AND s.total IS NOT NULL`,
    [workspaceId, invoiceReadinessId],
  )
}

/**
 * Le paiement saisi par « marquer payé » sur une facture : il devient une
 * ligne rattachée, et l'encaissé de la facture se recalcule. Un DEUXIÈME
 * paiement s'AJOUTE au premier — c'est ce qui rend le double paiement visible
 * (#2419.5) au lieu d'écraser silencieusement le premier.
 */
export async function recordAttachedPayment(
  manager: EntityManager,
  input: {
    workspaceId: string
    userId: string | null
    invoiceReadinessId: string
    amountCents: number
    receivedOn: string
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO invoice_payments (workspace_id, invoice_readiness_id, amount_cents, received_on, source, recorded_by)
     VALUES ($1, $2, $3, $4::date, 'manual', $5)`,
    [input.workspaceId, input.invoiceReadinessId, input.amountCents, input.receivedOn, input.userId],
  )
  await resyncPaid(manager, input.workspaceId, input.invoiceReadinessId)
}

@Injectable()
export class InvoicePaymentsService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly readiness: Repository<InvoiceReadinessEntity>,
  ) {}

  /** #2419.1 — un paiement reçu SANS facture connue : il reste « à rapprocher ». */
  async recordUnmatched(
    workspaceId: string,
    userId: string,
    input: { amountCents: number; receivedOn: string; payer?: string; reference?: string },
  ): Promise<InvoicePayment> {
    const [row] = returnedRows<PaymentRow>(
      await this.readiness.manager.query(
        `INSERT INTO invoice_payments (workspace_id, invoice_readiness_id, amount_cents, received_on, payer, reference, source, recorded_by)
         VALUES ($1, NULL, $2, $3::date, $4, $5, 'manual', $6)
         RETURNING id, invoice_readiness_id, NULL::uuid AS mission_id, NULL::text AS mission_label, NULL::text AS account_name,
                   NULL::date AS period_month, amount_cents, received_on, payer, reference, source, matched_at,
                   customer_credit_note, customer_credit_noted_at`,
        [workspaceId, input.amountCents, input.receivedOn, input.payer ?? null, input.reference ?? null, userId],
      ),
    )
    if (!row) throw new ConflictException("Le paiement n'a pas pu être enregistré.")
    return toPayment(row)
  }

  /**
   * Ce que l'espace doit regarder : les paiements À RAPPROCHER avec leurs
   * factures candidates (#2419.3), et les factures PAYÉES EN TROP (#2419.5).
   */
  async list(workspaceId: string): Promise<PaymentsView> {
    const manager = this.readiness.manager
    const payments = returnedRows<PaymentRow>(
      await manager.query(
        `SELECT ${PAYMENT_COLUMNS}
           FROM invoice_payments p
           LEFT JOIN invoice_readiness ir ON ir.id = p.invoice_readiness_id
           LEFT JOIN missions m ON m.id = ir.mission_id
           LEFT JOIN accounts a ON a.id = m.account_id
          WHERE p.workspace_id = $1 AND p.invoice_readiness_id IS NULL
          ORDER BY p.received_on DESC
          LIMIT 200`,
        [workspaceId],
      ),
    )

    // #2419.3 — le rapprochement PROPOSÉ : une facture annoncée, non annulée,
    // dont le reste dû égale le montant reçu. Jamais rattachée ici — le geste
    // humain (`match`) le fait. Deux candidates ou plus = ambigu.
    const candidateRows = returnedRows<{
      candidate_for: string
      id: string
      mission_id: string
      mission_label: string | null
      account_name: string | null
      period_month: string | Date
      due_cents: string | number
    }>(
      payments.length === 0
        ? []
        : await manager.query(
            `SELECT u.id AS candidate_for, ir.id, ir.mission_id, m.label AS mission_label, a.company_name AS account_name,
                    ir.period_month, (ir.invoiced_amount_cents - COALESCE(ir.paid_amount_cents, 0)) AS due_cents
               FROM invoice_payments u
               JOIN invoice_readiness ir ON ir.workspace_id = u.workspace_id
               JOIN missions m ON m.id = ir.mission_id
               LEFT JOIN accounts a ON a.id = m.account_id
              WHERE u.workspace_id = $1 AND u.invoice_readiness_id IS NULL AND u.id = ANY($2::uuid[])
                AND ir.invoiced_at IS NOT NULL AND ir.invoice_cancelled_at IS NULL
                AND ir.invoiced_amount_cents IS NOT NULL
                AND ir.invoiced_amount_cents - COALESCE(ir.paid_amount_cents, 0) = u.amount_cents
              ORDER BY ir.period_month ASC`,
            [workspaceId, payments.map(p => p.id)],
          ),
    )

    const unmatched = payments.map(row => {
      const candidates = candidateRows
        .filter(c => c.candidate_for === row.id)
        .map(c => ({
          invoiceReadinessId: c.id,
          missionId: c.mission_id,
          missionLabel: c.mission_label,
          accountName: c.account_name,
          periodMonth: asDay(c.period_month) ?? String(c.period_month),
          dueCents: Number(c.due_cents),
        }))
      return { ...toPayment(row), candidates, ambiguous: candidates.length > 1 }
    })

    // #2419.5 — le double paiement SIGNALÉ : la somme des paiements rattachés
    // dépasse le facturé. Aucun remboursement, aucune écriture : on le dit.
    const overpaidRows = returnedRows<{
      id: string
      mission_id: string
      mission_label: string | null
      account_name: string | null
      period_month: string | Date
      invoiced_amount_cents: string | number
      paid_total_cents: string | number
      payment_count: string | number
    }>(
      await manager.query(
        `SELECT ir.id, ir.mission_id, m.label AS mission_label, a.company_name AS account_name, ir.period_month,
                ir.invoiced_amount_cents, agg.paid_total_cents, agg.payment_count AS payment_count
           FROM invoice_readiness ir
           JOIN (SELECT invoice_readiness_id, SUM(amount_cents) AS paid_total_cents, COUNT(*) AS payment_count
                   FROM invoice_payments
                  WHERE workspace_id = $1 AND invoice_readiness_id IS NOT NULL AND customer_credit_noted_at IS NULL
                  GROUP BY invoice_readiness_id) agg ON agg.invoice_readiness_id = ir.id
           JOIN missions m ON m.id = ir.mission_id
           LEFT JOIN accounts a ON a.id = m.account_id
          WHERE ir.workspace_id = $1 AND ir.invoiced_amount_cents IS NOT NULL
            AND agg.paid_total_cents > ir.invoiced_amount_cents
          ORDER BY ir.period_month DESC`,
        [workspaceId],
      ),
    )
    const overpaid = overpaidRows.map(row => ({
      invoiceReadinessId: row.id,
      missionId: row.mission_id,
      missionLabel: row.mission_label,
      accountName: row.account_name,
      periodMonth: asDay(row.period_month) ?? String(row.period_month),
      invoicedAmountCents: Number(row.invoiced_amount_cents),
      paidTotalCents: Number(row.paid_total_cents),
      paymentCount: Number(row.payment_count),
      excessCents: Number(row.paid_total_cents) - Number(row.invoiced_amount_cents),
    }))

    return { unmatched, overpaid }
  }

  /**
   * #2419.3 — le geste HUMAIN qui rattache un paiement à une facture.
   *
   * Seul un paiement encore à rapprocher, vers une facture annoncée et non
   * annulée DU MÊME espace. QUI et QUAND sont gardés.
   */
  async match(workspaceId: string, userId: string, paymentId: string, invoiceReadinessId: string): Promise<void> {
    const updated = returnedRows(
      await this.readiness.manager.query(
        `UPDATE invoice_payments p
            SET invoice_readiness_id = ir.id, matched_at = now(), matched_by = $4
           FROM invoice_readiness ir
          WHERE p.workspace_id = $1 AND p.id = $2 AND p.invoice_readiness_id IS NULL
            AND ir.workspace_id = $1 AND ir.id = $3
            AND ir.invoiced_at IS NOT NULL AND ir.invoice_cancelled_at IS NULL
        RETURNING p.id`,
        [workspaceId, paymentId, invoiceReadinessId, userId],
      ),
    )
    if (updated.length === 0) {
      throw new ConflictException(
        'Rapprochement impossible : ce paiement est déjà rattaché, ou cette facture n’est pas annoncée dans cet espace.',
      )
    }
    await resyncPaid(this.readiness.manager, workspaceId, invoiceReadinessId)
  }

  /**
   * #2419.11 — la correction de l'espace : ce paiement en trop est un CRÉDIT
   * dû au client. Une NOTE interne — Bellum s'en souvient —, jamais un avoir
   * émis ni une écriture comptable (c80, « SUIT, ne COMPTABILISE pas »).
   *
   * Seul un paiement d'une facture payée EN TROP, dans la limite de l'excès :
   * noter en crédit un paiement dont la facture a besoin la ferait repasser
   * impayée sans que personne l'ait voulu.
   */
  async noteCustomerCredit(workspaceId: string, userId: string, paymentId: string, note: string): Promise<void> {
    const [row] = returnedRows<{ id: string; invoice_readiness_id: string }>(
      await this.readiness.manager.query(
        `UPDATE invoice_payments p
            SET customer_credit_noted_at = now(), customer_credit_note = $3, customer_credit_noted_by = $4
           FROM invoice_readiness ir
          WHERE p.workspace_id = $1 AND p.id = $2 AND p.customer_credit_noted_at IS NULL
            AND ir.id = p.invoice_readiness_id AND ir.workspace_id = $1 AND ir.invoiced_amount_cents IS NOT NULL
            AND p.amount_cents <= (
              SELECT SUM(q.amount_cents) FROM invoice_payments q
               WHERE q.invoice_readiness_id = ir.id AND q.customer_credit_noted_at IS NULL
            ) - ir.invoiced_amount_cents
        RETURNING p.id, p.invoice_readiness_id`,
        [workspaceId, paymentId, note, userId],
      ),
    )
    if (!row) {
      throw new NotFoundException('Aucun paiement en trop à noter en crédit client pour cette référence.')
    }
    await resyncPaid(this.readiness.manager, workspaceId, row.invoice_readiness_id)
  }
}
