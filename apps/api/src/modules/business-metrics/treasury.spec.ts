import { averageBurnCents, burnOf, runwayMonths, type TreasuryMonth } from './treasury'

function mois(month: string, over: Partial<TreasuryMonth> = {}): TreasuryMonth {
  return {
    month,
    bankBalanceCents: 10_000_00,
    fixedExpensesCents: 3_000_00,
    variableExpensesCents: 1_200_00,
    collectedCents: 0,
    ...over,
  }
}

describe('burnOf (#1649)', () => {
  it('applique la formule de l’issue, encaissements compris', () => {
    expect(burnOf(mois('2026-09', { collectedCents: 1_000_00 }))).toBe(3_200_00)
  })

  it('un terme non saisi rend null — jamais un burn trop haut qui a l’air d’un chiffre', () => {
    expect(burnOf(mois('2026-09', { collectedCents: null }))).toBeNull()
    expect(burnOf(mois('2026-09', { fixedExpensesCents: null }))).toBeNull()
    expect(burnOf(mois('2026-09', { variableExpensesCents: null }))).toBeNull()
  })

  it('un mois où l’on encaisse plus qu’on ne dépense rend un burn NÉGATIF, pas zéro', () => {
    expect(burnOf(mois('2026-09', { collectedCents: 9_000_00 }))).toBe(-4_800_00)
  })
})

describe('averageBurnCents (#1649)', () => {
  it('TEST DE L’ISSUE — un seul mois saisi ne fait pas une moyenne', () => {
    const r = averageBurnCents([mois('2026-09')], '2026-09')

    expect(r.measured).toBe(false)
    expect(r.measured === false && r.reason).toBe('not_enough_months')
  })

  it('deux mois suffisent', () => {
    const r = averageBurnCents([mois('2026-08'), mois('2026-09', { fixedExpensesCents: 4_000_00 })], '2026-09')

    expect(r).toEqual({ measured: true, cents: (4_200_00 + 5_200_00) / 2, monthsUsed: 2 })
  })

  it('ne prend que les TROIS derniers mois mesurables', () => {
    const r = averageBurnCents(
      [mois('2026-06', { fixedExpensesCents: 100_000_00 }), mois('2026-07'), mois('2026-08'), mois('2026-09')],
      '2026-09',
    )

    expect(r).toEqual({ measured: true, cents: 4_200_00, monthsUsed: 3 })
  })

  it('un trou de saisie ne fait pas disparaître la moyenne — il est SAUTÉ', () => {
    const r = averageBurnCents([mois('2026-07'), mois('2026-08', { collectedCents: null }), mois('2026-09')], '2026-09')

    expect(r).toEqual({ measured: true, cents: 4_200_00, monthsUsed: 2 })
  })

  it('ne regarde jamais l’avenir', () => {
    const r = averageBurnCents([mois('2026-09'), mois('2026-10'), mois('2026-11')], '2026-09')

    expect(r.measured).toBe(false)
  })
})

describe('runwayMonths (#1649)', () => {
  it('divise le solde du mois par le burn moyen', () => {
    const r = runwayMonths([mois('2026-08'), mois('2026-09', { bankBalanceCents: 42_000_00 })], '2026-09')

    expect(r).toEqual({ measured: true, months: 10, averageBurnCents: 4_200_00 })
  })

  it('sans solde relevé, il n’y a rien à diviser', () => {
    const r = runwayMonths([mois('2026-08'), mois('2026-09', { bankBalanceCents: null })], '2026-09')

    expect(r).toEqual({ measured: false, reason: 'no_balance' })
  })

  it('un seul mois → « non mesurable, il faut 2 mois »', () => {
    const r = runwayMonths([mois('2026-09')], '2026-09')

    expect(r).toEqual({ measured: false, reason: 'not_enough_months' })
  })

  it('un burn nul ou négatif n’est pas un runway infini — il se DIT', () => {
    const encaisse = { collectedCents: 20_000_00 }
    const r = runwayMonths([mois('2026-08', encaisse), mois('2026-09', encaisse)], '2026-09')

    expect(r).toEqual({ measured: false, reason: 'not_burning' })
  })
})
