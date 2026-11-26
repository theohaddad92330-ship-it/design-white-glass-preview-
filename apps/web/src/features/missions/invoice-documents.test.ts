import type { InvoiceReadiness } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  agingBuckets,
  declaredIssuedCents,
  expectedCollectionsByWeek,
  filterInvoiceDocuments,
  invoiceDocumentState,
  invoiceDocuments,
  invoiceDocumentTiles,
  receivablesKpis,
} from './invoice-documents'

const NOW = new Date('2026-10-19T12:00:00.000Z')

function line(over: Partial<InvoiceReadiness> = {}): InvoiceReadiness {
  return {
    missionId: '11111111-1111-4111-8111-111111111111',
    missionLabel: 'Renfort plateforme',
    accountId: null,
    accountName: 'ACME',
    periodMonth: '2026-08-01',
    state: 'invoiced',
    blockers: [],
    days: 20,
    preparedAmountCents: 10_000_00,
    invoicedAt: '2026-09-05T12:00:00.000Z',
    invoiceReference: 'F-118',
    invoicedAmountCents: 10_000_00,
    dueOn: '2026-10-04',
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

// Théo C missions-factures.R2/N7 — l'état d'affichage d'un document.
describe('invoiceDocumentState', () => {
  it('« Partielle · en retard » : un règlement partiel qui laisse un solde échu', () => {
    const row = line({ paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 4_000_00 })
    expect(invoiceDocumentState(row, NOW)).toBe('partial_overdue')
  })

  it('un règlement partiel NON échu reste « à recevoir » (aucun cinquième statut stocké)', () => {
    const row = line({ dueOn: '2026-11-30', paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 4_000_00 })
    expect(invoiceDocumentState(row, NOW)).toBe('to_receive')
  })

  it('un mois prêt est un brouillon : préparé, jamais émis', () => {
    expect(invoiceDocumentState(line({ state: 'ready', invoicedAmountCents: null }), NOW)).toBe('draft')
  })

  it('le litige passe avant le retard, comme dans collectionStatus', () => {
    expect(invoiceDocumentState(line({ disputedAt: '2026-10-06T12:00:00.000Z', disputeReason: 'x' }), NOW)).toBe(
      'disputed',
    )
  })

  it('soldée, échue, sans échéance', () => {
    expect(invoiceDocumentState(line({ paidAt: '2026-10-01T12:00:00.000Z', paidAmountCents: 10_000_00 }), NOW)).toBe(
      'settled',
    )
    expect(invoiceDocumentState(line(), NOW)).toBe('overdue')
    expect(invoiceDocumentState(line({ dueOn: null }), NOW)).toBe('to_receive')
  })
})

describe('invoiceDocuments', () => {
  it("garde les mois émis (prouvés ou déclarés) et les brouillons, rien d'autre", () => {
    const rows = [
      line(),
      line({ state: 'invoiced_declared' }),
      line({ state: 'ready' }),
      line({ state: 'blocked' }),
      line({ state: 'not_due' }),
    ]
    expect(invoiceDocuments(rows)).toHaveLength(3)
  })
})

describe('invoiceDocumentTiles', () => {
  it("compte les brouillons, somme l'émis et le reste à recevoir, nomme les litiges", () => {
    const rows = [
      line(),
      line({
        missionId: '22222222-2222-4222-8222-222222222222',
        paidAt: '2026-10-10T12:00:00.000Z',
        paidAmountCents: 4_000_00,
      }),
      line({ missionId: '33333333-3333-4333-8333-333333333333', state: 'ready', invoicedAmountCents: null }),
      line({
        missionId: '44444444-4444-4444-8444-444444444444',
        disputedAt: '2026-10-06T12:00:00.000Z',
        disputeReason: 'x',
      }),
    ]
    const tiles = invoiceDocumentTiles(rows)
    expect(tiles.drafts).toBe(1)
    expect(tiles.issuedCents).toBe(30_000_00)
    expect(tiles.outstandingCents).toBe(26_000_00)
    expect(tiles.disputed).toBe(1)
  })

  it('un montant inconnu ne devient jamais 0 € : null', () => {
    const tiles = invoiceDocumentTiles([line({ invoicedAmountCents: null })])
    expect(tiles.issuedCents).toBeNull()
    expect(tiles.outstandingCents).toBeNull()
  })

  it('sans aucun document, les sommes sont 0 (la fenêtre est complète)', () => {
    expect(invoiceDocumentTiles([]).issuedCents).toBe(0)
  })
})

describe('filterInvoiceDocuments', () => {
  const rows = [
    line({ state: 'ready', invoicedAmountCents: null }),
    line({ dueOn: '2026-12-01' }),
    line({ paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 4_000_00 }),
    line({ paidAt: '2026-10-01T12:00:00.000Z', paidAmountCents: 10_000_00 }),
    line({ disputedAt: '2026-10-06T12:00:00.000Z', disputeReason: 'x' }),
  ]
  it.each([
    ['all', 5],
    ['drafts', 1],
    ['issued', 4],
    ['with_balance', 3],
    ['overdue', 2],
    ['disputed', 1],
    ['settled', 1],
    ['declared', 0],
  ] as const)('filtre %s', (filter, expected) => {
    expect(filterInvoiceDocuments(rows, filter, NOW)).toHaveLength(expected)
  })

  // Louis 23/10 — multi-sélection partout : plusieurs états = leur UNION ; aucun = tout.
  it('plusieurs états se cumulent en OU, et une sélection vide montre tout', () => {
    expect(filterInvoiceDocuments(rows, ['drafts', 'settled'], NOW)).toHaveLength(2)
    expect(filterInvoiceDocuments(rows, [], NOW)).toHaveLength(5)
  })

  it('« Déclarées sans preuve » ne retient que les mois déclarés, jamais ceux que l’outil a prouvés', () => {
    const mixed = [line(), line({ state: 'invoiced_declared', invoicedByName: 'Léa' })]
    expect(filterInvoiceDocuments(mixed, ['declared'], NOW)).toHaveLength(1)
    expect(filterInvoiceDocuments(mixed, ['issued'], NOW)).toHaveLength(2)
  })
})

describe('declaredIssuedCents', () => {
  it('somme la seule part déclarée sans preuve de l’outil', () => {
    const rows = [line(), line({ state: 'invoiced_declared', invoicedAmountCents: 8_700_00 })]
    expect(declaredIssuedCents(rows)).toBe(8_700_00)
  })

  it('aucune déclaration : rien à nommer (null, jamais « 0 € déclarés »)', () => {
    expect(declaredIssuedCents([line()])).toBeNull()
  })

  it('une déclaration sans montant lisible n’invente pas de zéro', () => {
    expect(declaredIssuedCents([line({ state: 'invoiced_declared', invoicedAmountCents: null })])).toBeNull()
  })
})

// Théo C missions-encaissements.N3 — l'ancienneté de l'encours, six tranches.
describe('agingBuckets', () => {
  it('range le restant dû par tranche, litiges compris, et garde les tranches vides à 0', () => {
    const rows = [
      line({ dueOn: '2026-11-15' }),
      line({ dueOn: '2026-10-09' }),
      line({ dueOn: '2026-09-01' }),
      line({ dueOn: '2026-07-01' }),
      line({ dueOn: null }),
    ]
    const buckets = agingBuckets(rows, NOW)
    expect(buckets.map(b => b.key)).toEqual(['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'no_due_date'])
    expect(buckets.map(b => b.count)).toEqual([1, 1, 1, 0, 1, 1])
    expect(buckets.find(b => b.key === 'd61_90')?.amountCents).toBe(0)
    expect(buckets.find(b => b.key === 'd31_60')?.amountCents).toBe(10_000_00)
  })

  it('ne compte pas une ligne soldée ni un brouillon', () => {
    const rows = [line({ paidAt: '2026-10-01T12:00:00.000Z', paidAmountCents: 10_000_00 }), line({ state: 'ready' })]
    expect(agingBuckets(rows, NOW).every(b => b.count === 0)).toBe(true)
  })
})

describe('receivablesKpis', () => {
  it("reste à recevoir, dont échus, montant litigieux inclus dans l'encours (pas ajouté)", () => {
    const rows = [
      line({ dueOn: '2026-12-01' }),
      line({}),
      line({ disputedAt: '2026-10-06T12:00:00.000Z', disputeReason: 'x', invoicedAmountCents: 3_600_00 }),
    ]
    const kpis = receivablesKpis(rows, NOW)
    expect(kpis.remainingCents).toBe(23_600_00)
    expect(kpis.overdueCents).toBe(13_600_00)
    expect(kpis.disputedCents).toBe(3_600_00)
  })
})

// Théo V22 (23/10) — « Les quatre prochaines semaines » : une PRÉVISION d'échéances, pas un solde bancaire.
describe('expectedCollectionsByWeek', () => {
  // Jeudi 22/10/2026 : la première semaine court du lundi 19 au dimanche 25 octobre.
  const today = new Date('2026-10-22T12:00:00.000Z')

  it('range le reste dû par semaine d’ÉCHÉANCE, quatre semaines de lundi à dimanche', () => {
    const view = expectedCollectionsByWeek(
      [
        line({ dueOn: '2026-10-24', invoicedAmountCents: 1_000_00 }),
        line({ dueOn: '2026-11-04', invoicedAmountCents: 13_440_00 }),
      ],
      today,
    )
    expect(view.weeks.map(week => week.startsOn)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
    expect(view.weeks.map(week => week.count)).toEqual([1, 0, 1, 0])
    expect(view.weeks[0]!.cents).toBe(1_000_00)
    expect(view.weeks[2]!.cents).toBe(13_440_00)
  })

  it('une semaine sans échéance dit « aucune » (count 0) : jamais un zéro déguisé en montant mesuré', () => {
    const view = expectedCollectionsByWeek([], today)
    expect(view.weeks.every(week => week.count === 0)).toBe(true)
  })

  it('l’échu, le litige et le sans-échéance ne sont PAS placés arbitrairement : ils sont comptés à part', () => {
    const view = expectedCollectionsByWeek(
      [
        line({ dueOn: '2026-10-01', invoicedAmountCents: 14_880_00 }),
        line({
          dueOn: '2026-11-04',
          disputedAt: '2026-10-06T12:00:00.000Z',
          disputeReason: 'x',
          invoicedAmountCents: 13_176_00,
        }),
        line({ dueOn: null, invoicedAmountCents: 10_440_00 }),
      ],
      today,
    )
    expect(view.weeks.every(week => week.count === 0)).toBe(true)
    expect(view.unplaced.count).toBe(3)
    expect(view.unplaced.cents).toBe(38_496_00)
  })

  it('une facture soldée n’attend rien', () => {
    const view = expectedCollectionsByWeek(
      [line({ dueOn: '2026-10-24', paidAt: '2026-10-10T12:00:00.000Z', paidAmountCents: 10_000_00 })],
      today,
    )
    expect(view.weeks[0]!.count).toBe(0)
  })

  it('un reste dû inconnu ne devient jamais 0 € : la semaine porte null', () => {
    const view = expectedCollectionsByWeek([line({ dueOn: '2026-10-24', invoicedAmountCents: null })], today)
    expect(view.weeks[0]!.count).toBe(1)
    expect(view.weeks[0]!.cents).toBeNull()
  })
})
