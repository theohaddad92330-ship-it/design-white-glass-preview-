import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { averageDailyRate, financeMissionRevenue, financeRevenueByClient } from './finance-mission-revenue'

/**
 * #2564.1 — LE CA PAR MISSION du tableau de bord Finance.
 *
 * `GET /delivery/invoice-readiness` porte déjà, mission par mission, ce qui a
 * été LIVRÉ et FACTURABLE (`preparedAmountCents`) et ce qui a été FACTURÉ
 * (`invoicedAmountCents`) — l'écran Finance l'appelait déjà pour sa bande de
 * bloqueurs sans jamais montrer les lignes. Ce module trie ce qui est déjà
 * reçu ; il ne recalcule aucun montant.
 */
function row(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Mission',
    accountId: null,
    accountName: 'Compte',
    periodMonth: '2026-07-01',
    state: 'ready',
    blockers: [],
    days: 10,
    preparedAmountCents: 100_000,
    invoicedAt: null,
    invoiceReference: null,
    invoicedAmountCents: null,
    dueOn: null,
    remindersSent: 0,
    disputedAt: null,
    disputeReason: null,
    disputeResolvedAt: null,
    lastReminderAt: null,
    paidAt: null,
    paidAmountCents: null,
    ...over,
  }
}

describe('financeMissionRevenue', () => {
  it('trie les missions du plus gros montant livré au plus petit', () => {
    const { rows } = financeMissionRevenue([
      row({ missionId: 'a', preparedAmountCents: 50_000 }),
      row({ missionId: 'b', preparedAmountCents: 200_000 }),
    ])
    expect(rows.map(r => r.missionId)).toEqual(['b', 'a'])
  })

  it('#2564.1 — un montant NON MESURÉ reste `null`, jamais `0`, et se range en dernier', () => {
    const { rows, withoutAmount } = financeMissionRevenue([
      row({ missionId: 'known', preparedAmountCents: 10_000 }),
      row({ missionId: 'unknown', preparedAmountCents: null }),
    ])
    expect(rows.map(r => r.missionId)).toEqual(['known', 'unknown'])
    const unknown = rows.find(r => r.missionId === 'unknown')
    // La garde qui sait dire NON : si un jour quelqu'un écrit
    // `preparedAmountCents ?? 0` dans ce module, cette ligne rougit — `null`
    // et `0` sont deux réponses différentes à « combien ? ».
    expect(unknown?.preparedAmountCents).toBeNull()
    expect(unknown?.preparedAmountCents).not.toBe(0)
    expect(withoutAmount).toBe(1)
  })

  it('porte le montant FACTURÉ à côté du préparatoire, sans les fondre', () => {
    const { rows } = financeMissionRevenue([row({ preparedAmountCents: 100_000, invoicedAmountCents: 95_000 })])
    expect(rows[0].preparedAmountCents).toBe(100_000)
    expect(rows[0].invoicedAmountCents).toBe(95_000)
  })
})

describe('financeRevenueByClient / averageDailyRate (rangée Marge et CA)', () => {
  const rows = [
    {
      missionId: 'a',
      missionLabel: 'A',
      accountName: 'Client A',
      periodMonth: '2026-09',
      preparedAmountCents: 100,
      invoicedAmountCents: null,
    },
    {
      missionId: 'b',
      missionLabel: 'B',
      accountName: 'Client A',
      periodMonth: '2026-09',
      preparedAmountCents: null,
      invoicedAmountCents: null,
    },
    {
      missionId: 'c',
      missionLabel: 'C',
      accountName: 'Client B',
      periodMonth: '2026-09',
      preparedAmountCents: null,
      invoicedAmountCents: null,
    },
    {
      missionId: 'd',
      missionLabel: 'D',
      accountName: null,
      periodMonth: '2026-09',
      preparedAmountCents: 50,
      invoicedAmountCents: null,
    },
  ]

  it('somme le CA par client ; un client sans aucun montant reste null, jamais 0', () => {
    const out = financeRevenueByClient(rows)
    expect(out.groups).toEqual([
      { client: 'Client A', missions: 2, amountCents: 100, withoutAmount: 1 },
      { client: 'Client B', missions: 1, amountCents: null, withoutAmount: 1 },
    ])
    expect(out.withoutClient).toBe(1)
  })

  it('TJM moyen : moyenne des TJM connus, une mission comptée une fois, dénominateur dit', () => {
    const out = averageDailyRate([
      { missionId: 'a', dailyRateCents: 600_00 },
      { missionId: 'a', dailyRateCents: 600_00 },
      { missionId: 'b', dailyRateCents: 800_00 },
      { missionId: 'c', dailyRateCents: null },
    ])
    expect(out).toEqual({ averageCents: 700_00, measured: 2, missions: 3 })
  })

  it('aucun TJM connu → null (non mesuré), pas 0', () => {
    expect(averageDailyRate([{ missionId: 'a', dailyRateCents: null }]).averageCents).toBeNull()
  })
})
