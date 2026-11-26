import type { Intervention } from '@bellum/contracts'
import { groupOverdueByClient, type OverdueMeta } from './intervention-grouping'

const NOW = new Date('2026-10-14T10:00:00Z')

function item(id: string, over: Partial<Intervention> = {}): Intervention {
  return {
    id,
    kind: 'payment_overdue',
    subjectType: 'mission',
    subjectId: id,
    subjectLabel: null,
    ownerId: null,
    ownerName: null,
    detail: 'facture en retard',
    state: 'open',
    openedAt: '2026-09-01T00:00:00.000Z',
    resolvedAt: null,
    ...over,
  }
}

function meta(client: string | null, dueOn: string, invoiced: number | null, paid: number | null = null): OverdueMeta {
  return {
    clientLabel: client,
    dueOn,
    invoicedAmountCents: invoiced,
    paidAt: paid === null ? null : '2026-09-20',
    paidAmountCents: paid,
  }
}

describe('groupOverdueByClient', () => {
  it('une ligne par client : nombre, montant dû, plus ancien retard', () => {
    const items = [item('a'), item('b'), item('c')]
    const metas = new Map([
      ['a', meta('Acme', '2026-08-15', 100000)],
      ['b', meta('Acme', '2026-09-14', 50000)],
      ['c', meta('Globex', '2026-09-30', 20000)],
    ])
    const out = groupOverdueByClient(items, metas, NOW)
    expect(out).toHaveLength(2)
    expect(out[0].group).toMatchObject({
      clientLabel: 'Acme',
      invoiceCount: 2,
      outstandingCents: 150000,
      oldestOverdueDays: 60,
      ids: ['a', 'b'],
    })
    expect(out[0].detail).toContain('Acme')
    expect(out[0].detail).toContain('2 factures')
    // Globex n'a qu'une facture : la ligne reste seule, avec sa propre phrase.
    expect(out[1].group).toBeUndefined()
    expect(out[1].detail).toBe('facture en retard')
  })

  it('un montant inconnu reste inconnu : jamais 0 ni une somme partielle', () => {
    const out = groupOverdueByClient(
      [item('a'), item('b')],
      new Map([
        ['a', meta('Acme', '2026-08-15', 100000)],
        ['b', meta('Acme', '2026-09-14', null)],
      ]),
      NOW,
    )
    expect(out[0].group?.outstandingCents).toBeNull()
    expect(out[0].detail).not.toMatch(/0 €/)
  })

  it('laisse intactes les autres natures et garde la place du premier membre', () => {
    const other = item('x', { kind: 'account_untouched', subjectType: 'account' })
    const out = groupOverdueByClient(
      [other, item('a'), item('b')],
      new Map([
        ['a', meta('Acme', '2026-08-15', 1)],
        ['b', meta('Acme', '2026-08-16', 1)],
      ]),
      NOW,
    )
    expect(out.map(i => i.id)).toEqual(['x', 'a'])
    expect(out[0].group).toBeUndefined()
  })
})
