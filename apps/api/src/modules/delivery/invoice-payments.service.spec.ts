import { ConflictException, NotFoundException } from '@nestjs/common'
import { InvoicePaymentsService, recordAttachedPayment } from './invoice-payments.service'

const WORKSPACE = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'
const PAYMENT = 'p0000000-0000-4000-8000-000000000001'
const INVOICE = 'i0000000-0000-4000-8000-000000000001'
const MISSION = 'm0000000-0000-4000-8000-000000000001'

function paymentRow(over: Record<string, unknown> = {}) {
  return {
    id: PAYMENT,
    invoice_readiness_id: null,
    mission_id: null,
    mission_label: null,
    account_name: null,
    period_month: null,
    amount_cents: '35700',
    received_on: '2026-09-20',
    payer: 'ACME',
    reference: 'VIR-42',
    source: 'manual',
    matched_at: null,
    customer_credit_note: null,
    customer_credit_noted_at: null,
    ...over,
  }
}

function makeService(routes: Record<string, unknown[]> = {}) {
  const queries: { sql: string; params: unknown[] }[] = []
  const manager = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params })
      for (const [needle, rows] of Object.entries(routes)) if (sql.includes(needle)) return rows
      return []
    }),
  }
  const service = new InvoicePaymentsService({ manager } as never)
  return { service, queries }
}

describe('InvoicePaymentsService — #2419.1 l’objet Payment', () => {
  it('enregistre un paiement SANS facture : il reste « à rapprocher », borné à l’espace', async () => {
    const { service, queries } = makeService({ 'INSERT INTO invoice_payments': [paymentRow()] })
    const created = await service.recordUnmatched(WORKSPACE, USER, {
      amountCents: 35700,
      receivedOn: '2026-09-20',
      payer: 'ACME',
      reference: 'VIR-42',
    })
    const insert = queries.find(q => q.sql.includes('INSERT INTO invoice_payments'))
    expect(insert?.sql).toContain('invoice_readiness_id')
    expect(insert?.sql).toContain('NULL')
    expect(insert?.params[0]).toBe(WORKSPACE)
    expect(created.invoiceReadinessId).toBeNull()
    expect(created.amountCents).toBe(35700)
    expect(created).not.toHaveProperty('status')
  })

  it('le paiement rattaché par « marquer payé » recalcule l’encaissé comme la SOMME des paiements rattachés', async () => {
    const queries: string[] = []
    const manager = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql)
        return []
      }),
    }
    await recordAttachedPayment(manager as never, {
      workspaceId: WORKSPACE,
      userId: USER,
      invoiceReadinessId: INVOICE,
      amountCents: 35700,
      receivedOn: '2026-09-20',
    })
    expect(queries[0]).toContain('INSERT INTO invoice_payments')
    expect(queries[1]).toContain('SUM(p.amount_cents)')
    // Un paiement noté en crédit client ne compte plus dans l'encaissé de la facture.
    expect(queries[1]).toContain('customer_credit_noted_at IS NULL')
  })
})

describe('InvoicePaymentsService — #2419.3 rapprochement : proposé, jamais automatique', () => {
  it('liste les factures CANDIDATES d’un paiement non rapproché et dit l’ambiguïté, sans rien rattacher', async () => {
    const { service, queries } = makeService({
      'FROM invoice_payments p': [paymentRow()],
      'AS candidate_for': [
        {
          candidate_for: PAYMENT,
          id: INVOICE,
          mission_id: MISSION,
          mission_label: 'Renfort',
          account_name: 'ACME',
          period_month: '2026-08-01',
          due_cents: '35700',
        },
        {
          candidate_for: PAYMENT,
          id: 'i2',
          mission_id: MISSION,
          mission_label: 'Renfort',
          account_name: 'ACME',
          period_month: '2026-07-01',
          due_cents: '35700',
        },
      ],
    })
    const view = await service.list(WORKSPACE)
    const unmatched = view.unmatched[0]
    expect(unmatched?.candidates).toHaveLength(2)
    expect(unmatched?.ambiguous).toBe(true)
    expect(queries.some(q => /UPDATE invoice_payments/.test(q.sql))).toBe(false)
  })

  it('un seul candidat n’est PAS ambigu — mais reste une proposition', async () => {
    const { service } = makeService({
      'FROM invoice_payments p': [paymentRow()],
      'AS candidate_for': [
        {
          candidate_for: PAYMENT,
          id: INVOICE,
          mission_id: MISSION,
          mission_label: 'Renfort',
          account_name: 'ACME',
          period_month: '2026-08-01',
          due_cents: '35700',
        },
      ],
    })
    const view = await service.list(WORKSPACE)
    expect(view.unmatched[0]?.ambiguous).toBe(false)
    expect(view.unmatched[0]?.invoiceReadinessId).toBeNull()
  })

  it('le geste humain rattache : QUI et QUAND, facture de l’espace seulement, puis l’encaissé se recalcule', async () => {
    const { service, queries } = makeService({
      'UPDATE invoice_payments p': [{ id: PAYMENT }],
    })
    await service.match(WORKSPACE, USER, PAYMENT, INVOICE)
    const update = queries.find(q => q.sql.includes('UPDATE invoice_payments p'))
    expect(update?.sql).toContain('matched_at = now()')
    expect(update?.sql).toContain('p.invoice_readiness_id IS NULL')
    expect(update?.sql).toContain('ir.workspace_id = $1')
    expect(update?.params).toEqual([WORKSPACE, PAYMENT, INVOICE, USER])
    expect(queries.some(q => q.sql.includes('SUM(p.amount_cents)'))).toBe(true)
  })

  it('refuse un rattachement impossible (déjà rattaché, autre espace, facture non annoncée)', async () => {
    const { service } = makeService()
    await expect(service.match(WORKSPACE, USER, PAYMENT, INVOICE)).rejects.toBeInstanceOf(ConflictException)
  })
})

describe('InvoicePaymentsService — #2419.5 double paiement SIGNALÉ', () => {
  it('signale une facture dont les paiements rattachés dépassent le facturé — sans rien rembourser', async () => {
    const { service, queries } = makeService({
      'AS payment_count': [
        {
          id: INVOICE,
          mission_id: MISSION,
          mission_label: 'Renfort',
          account_name: 'ACME',
          period_month: '2026-08-01',
          invoiced_amount_cents: '35700',
          paid_total_cents: '71400',
          payment_count: '2',
        },
      ],
    })
    const view = await service.list(WORKSPACE)
    expect(view.overpaid).toEqual([
      expect.objectContaining({ invoiceReadinessId: INVOICE, paymentCount: 2, excessCents: 35700 }),
    ])
    expect(queries.some(q => /refund|rembours/i.test(q.sql))).toBe(false)
  })
})

describe('InvoicePaymentsService — #2419.11 note interne de crédit client', () => {
  it('note le paiement en crédit client (jamais un avoir émis), puis recalcule l’encaissé', async () => {
    const { service, queries } = makeService({
      'SET customer_credit_noted_at': [{ id: PAYMENT, invoice_readiness_id: INVOICE }],
    })
    await service.noteCustomerCredit(WORKSPACE, USER, PAYMENT, 'Second virement, à déduire de la prochaine facture')
    const update = queries.find(q => q.sql.includes('SET customer_credit_noted_at'))
    // Seul un paiement d'une facture EN EXCÈS, dans la limite de cet excès.
    expect(update?.sql).toContain('p.amount_cents <=')
    expect(update?.sql).toContain('p.workspace_id = $1')
    expect(queries.some(q => q.sql.includes('SUM(p.amount_cents)'))).toBe(true)
  })

  it('refuse de noter un paiement d’une facture qui n’est pas payée en trop', async () => {
    const { service } = makeService()
    await expect(service.noteCustomerCredit(WORKSPACE, USER, PAYMENT, 'x')).rejects.toBeInstanceOf(NotFoundException)
  })
})
