import { REFRESH_DIMENSION_PHASE, type RefreshDimension } from '@bellum/contracts'
import { selectUndueRefreshDebits, type RefreshDebitRow } from './refresh-refund'

/**
 * #2650.2 — QUELS débits sont indus. Fenêtre glissante, par compte ET par
 * axe : le premier débit ouvre la fenêtre, les suivants pris dans les 6 h
 * sont indus ; le premier débit pris 6 h ou plus après l'ouverture en ouvre
 * une nouvelle. Un débit indu n'ouvre RIEN — sous la règle corrigée
 * (#2650.1), il aurait été refusé.
 *
 * Chaque cas sait dire NON : un débit légitime (autre axe, autre compte,
 * au-delà de 6 h) n'est jamais remboursé — le rattrapage est CIBLÉ.
 */
const H = 60 * 60 * 1000
const T0 = Date.parse('2026-08-22T08:00:00.000Z')

function debit(id: string, offsetMs: number, overrides: Partial<RefreshDebitRow> = {}): RefreshDebitRow {
  return {
    id,
    owner_user_id: 'owner-1',
    workspace_id: 'ws-1',
    account_id: 'acc-1',
    reason: 'refresh:signals',
    delta: -1,
    created_at: new Date(T0 + offsetMs),
    ...overrides,
  }
}

describe('selectUndueRefreshDebits (#2650.2)', () => {
  it('un second débit du même axe sur le même compte, à moins de 6 h, est indu', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', 50_000)])
    expect(undue.map(u => u.debit.id)).toEqual(['d2'])
    expect(undue[0]).toMatchObject({ dimension: 'signals', amount: 1, windowOpenedBy: { id: 'd1' } })
  })

  it('un débit pris 6 h ou plus après le premier est LÉGITIME — il ouvre une nouvelle fenêtre', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', 6 * H), debit('d3', 7 * H)])
    expect(undue.map(u => u.debit.id)).toEqual(['d3'])
    expect(undue[0]?.windowOpenedBy.id).toBe('d2')
  })

  it("un débit indu n'ouvre PAS de fenêtre : l'ancre reste le premier débit payé à bon droit", () => {
    // d2 (+5 h) est indu ; d3 (+7 h) est à 2 h de d2 mais à 7 h de d1 → légitime.
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', 5 * H), debit('d3', 7 * H)])
    expect(undue.map(u => u.debit.id)).toEqual(['d2'])
  })

  it('une autre PHASE sur le même compte ne compte pas — contacts après signals est légitime', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', H, { reason: 'refresh:contacts' })])
    expect(undue).toEqual([])
  })

  // Le groupement est celui du verrou #2650.1 (`REFRESH_DIMENSION_PHASE`) :
  // `ecosystem` rejoue la MÊME phase de recherche que `signals`, déjà payée.
  it('un alias de la MÊME phase est indu — ecosystem après signals dans les 6 h', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', H, { reason: 'refresh:ecosystem' })])
    expect(undue.map(u => u.debit.id)).toEqual(['d2'])
    expect(undue[0]).toMatchObject({ dimension: 'ecosystem', windowOpenedBy: { id: 'd1' } })
  })

  it('la fenêtre est celle de la PHASE : signals après buying_path reste légitime, strategy après buying_path non', () => {
    const undue = selectUndueRefreshDebits([
      debit('d1', 0, { reason: 'refresh:buying_path' }),
      debit('d2', H),
      debit('d3', 2 * H, { reason: 'refresh:strategy' }),
    ])
    expect(undue.map(u => u.debit.id)).toEqual(['d3'])
  })

  it.each(Object.keys(REFRESH_DIMENSION_PHASE) as RefreshDimension[])(
    'pour tout couple d’axes, %s suivi d’un autre axe est indu SI ET SEULEMENT SI la phase est la même',
    first => {
      for (const second of Object.keys(REFRESH_DIMENSION_PHASE) as RefreshDimension[]) {
        const undue = selectUndueRefreshDebits([
          debit('d1', 0, { reason: `refresh:${first}` }),
          debit('d2', H, { reason: `refresh:${second}` }),
        ])
        expect(undue.length).toBe(REFRESH_DIMENSION_PHASE[first] === REFRESH_DIMENSION_PHASE[second] ? 1 : 0)
      }
    },
  )

  it('un autre COMPTE ne compte pas — chaque compte a sa fenêtre', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0), debit('d2', H, { account_id: 'acc-2' })])
    expect(undue).toEqual([])
  })

  it("l'ordre d'arrivée ne change rien : les débits sont relus dans l'ordre chronologique", () => {
    const undue = selectUndueRefreshDebits([debit('d3', 2 * H), debit('d1', 0), debit('d2', H)])
    expect(undue.map(u => u.debit.id)).toEqual(['d2', 'd3'])
    expect(undue.every(u => u.windowOpenedBy.id === 'd1')).toBe(true)
  })

  it('rend le montant RÉELLEMENT débité, pas la grille du jour', () => {
    const undue = selectUndueRefreshDebits([debit('d1', 0, { delta: -2 }), debit('d2', H, { delta: -2 })])
    expect(undue[0]?.amount).toBe(2)
  })

  it("ignore ce qui n'est pas un débit de rafraîchissement lisible", () => {
    const undue = selectUndueRefreshDebits([
      debit('d1', 0),
      debit('x1', H, { reason: 'Doctolib' }),
      debit('x2', H, { reason: 'refresh:bogus' }),
      debit('x3', H, { reason: null }),
      debit('x4', H, { account_id: null }),
      debit('x5', H, { delta: 1 }),
    ])
    expect(undue).toEqual([])
  })

  it('mesuré le 19/09 : 1 indu le 18/09, 2 indus le 22/08 — trois, pas plus', () => {
    const sept18 = Date.parse('2026-09-18T09:00:00.000Z') - T0
    const undue = selectUndueRefreshDebits([
      debit('a1', 0),
      debit('a2', 30 * 60_000),
      debit('a3', 2 * H),
      debit('b1', sept18),
      debit('b2', sept18 + 50_000),
      debit('b3', sept18 + 8 * H),
    ])
    expect(undue.map(u => u.debit.id)).toEqual(['a2', 'a3', 'b2'])
  })
})
