import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { collectionsToTreatByClient } from './finance-collections-clients'

const NOW = new Date('2026-10-14T10:00:00Z')

function inv(over: Partial<InvoiceReadiness>): InvoiceReadiness {
  return {
    missionId: '00000000-0000-4000-8000-000000000001',
    missionLabel: 'M',
    accountName: 'Client A',
    accountId: null,
    periodMonth: '2026-08',
    state: 'invoiced',
    blockers: [],
    days: 10,
    preparedAmountCents: null,
    invoicedAt: '2026-08-31',
    invoiceReference: null,
    invoicedAmountCents: 1_000_00,
    dueOn: '2026-09-30',
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

describe('collectionsToTreatByClient', () => {
  it('regroupe les impayés (retard + attente) par client, le plus ancien retard en tête', () => {
    const out = collectionsToTreatByClient(
      [
        inv({ accountName: 'Client A', dueOn: '2026-09-30' }),
        inv({ accountName: 'Client A', dueOn: '2026-10-30' }),
        inv({ accountName: 'Client B', dueOn: '2026-08-31' }),
        inv({ accountName: 'Client C', paidAt: '2026-09-05', paidAmountCents: 1_000_00 }),
      ],
      NOW,
    )
    expect(out.groups.map(group => group.client)).toEqual(['Client B', 'Client A'])
    expect(out.groups[1]).toMatchObject({ count: 2, overdue: 1, oldestOverdueDays: 14 })
    expect(out.groups[0]?.oldestOverdueDays).toBe(44)
  })

  it('une ligne sans client ne fait AUCUNE ligne de liste : elle est comptée à part', () => {
    const out = collectionsToTreatByClient([inv({ accountName: null })], NOW)
    expect(out.groups).toEqual([])
    expect(out.withoutClient).toBe(1)
  })

  it('un client sans retard n’affiche pas d’ancienneté (jamais 0 jour)', () => {
    const out = collectionsToTreatByClient([inv({ dueOn: '2026-12-01' })], NOW)
    expect(out.groups[0]?.oldestOverdueDays).toBeNull()
  })

  it('le reste dû inconnu reste null, jamais 0', () => {
    const out = collectionsToTreatByClient([inv({ invoicedAmountCents: null })], NOW)
    expect(out.groups[0]?.amountCents).toBeNull()
  })
})
