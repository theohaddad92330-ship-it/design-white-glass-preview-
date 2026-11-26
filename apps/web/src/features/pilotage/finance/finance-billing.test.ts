import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { financeBilling } from './finance-billing'

function line(over: Partial<InvoiceReadiness>): InvoiceReadiness {
  return {
    missionId: '00000000-0000-4000-8000-000000000001',
    missionLabel: 'M',
    accountName: 'Client A',
    accountId: null,
    periodMonth: '2026-09',
    state: 'ready',
    blockers: [],
    days: 10,
    preparedAmountCents: 1_000_00,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    ...over,
  }
}

describe('financeBilling — préparé / facturé / à préparer', () => {
  it('« préparé » = lignes prêtes ; jamais confondu avec « facturé »', () => {
    const out = financeBilling([line({}), line({ preparedAmountCents: 500_00 })])
    expect(out.prepared).toEqual({ count: 2, amountCents: 1_500_00, withoutAmount: 0 })
    expect(out.invoiced.count).toBe(0)
  })

  it('« facturé » sépare la preuve du connecteur de la simple déclaration — sa SOURCE se nomme', () => {
    const out = financeBilling([
      line({ state: 'invoiced', invoicedAmountCents: 2_000_00 }),
      line({ state: 'invoiced_declared', invoicedAmountCents: 3_000_00 }),
    ])
    expect(out.invoiced).toMatchObject({ count: 2, amountCents: 5_000_00, proven: 1, declared: 1 })
  })

  it('« à préparer » = temps validés (aucun bloqueur de relevé) mais bloqués ailleurs', () => {
    const out = financeBilling([
      line({ state: 'blocked', blockers: ['missing_rate'], preparedAmountCents: null }),
      line({ state: 'blocked', blockers: ['missing_po', 'missing_billing_contact'] }),
      line({ state: 'blocked', blockers: ['timesheet_not_validated'] }),
    ])
    expect(out.toPrepare.count).toBe(2)
  })

  it('un montant inconnu n’est jamais 0 : aucun montant lisible sur un groupe non vide → null', () => {
    const out = financeBilling([line({ preparedAmountCents: null })])
    expect(out.prepared).toEqual({ count: 1, amountCents: null, withoutAmount: 1 })
  })

  it('un groupe vide a amountCents null — une absence ne fait aucune tuile', () => {
    expect(financeBilling([]).prepared.count).toBe(0)
    expect(financeBilling([]).prepared.amountCents).toBeNull()
  })
})
