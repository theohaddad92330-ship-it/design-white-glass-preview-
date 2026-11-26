import {
  computeMovements,
  contractedMonthlyCents,
  lineMovements,
  monthOf,
  previousMonth,
  recurringLines,
  type SnapshotLine,
  type SubscriptionRow,
} from './mrr-movements'

/** Les deux grilles vivantes, réduites à ce que ces tests exercent. */
const PRICES = { starter: 4900, team: 14900, growth: 19900, trial: 0, beta: 0 }
const SEATS = { starter: 900, team: 2900, growth: 4900, trial: 0, beta: 0 }

describe('computeMovements (#1645)', () => {
  it('T2 — mrrEnd = mrrStart + new + expansion − contraction − churned, exactement', () => {
    const before: SnapshotLine[] = [
      { subjectId: 'reste', mrrCents: 14900 },
      { subjectId: 'monte', mrrCents: 4900 },
      { subjectId: 'descend', mrrCents: 19900 },
      { subjectId: 'part', mrrCents: 4900 },
    ]
    const after: SnapshotLine[] = [
      { subjectId: 'reste', mrrCents: 14900 },
      { subjectId: 'monte', mrrCents: 19900 },
      { subjectId: 'descend', mrrCents: 14900 },
      { subjectId: 'arrive', mrrCents: 9900 },
    ]

    const m = computeMovements(before, after)

    expect(m.mrrStartCents).toBe(44600)
    expect(m.mrrNewCents).toBe(9900)
    expect(m.mrrExpansionCents).toBe(15000)
    expect(m.mrrContractionCents).toBe(5000)
    expect(m.mrrChurnedCents).toBe(4900)
    expect(m.mrrEndCents).toBe(59600)

    // L'invariant, écrit comme l'issue l'écrit.
    expect(m.mrrEndCents).toBe(
      (m.mrrStartCents ?? 0) +
        (m.mrrNewCents ?? 0) +
        (m.mrrExpansionCents ?? 0) -
        (m.mrrContractionCents ?? 0) -
        (m.mrrChurnedCents ?? 0),
    )

    expect(m.customersStart).toBe(4)
    expect(m.customersNew).toBe(1)
    expect(m.customersChurned).toBe(1)
    expect(m.customersEnd).toBe(4)
  })

  it('le PREMIER mois n’a pas de mrrStart — null, jamais 0', () => {
    const m = computeMovements(null, [{ subjectId: 'a', mrrCents: 14900 }])

    expect(m.mrrStartCents).toBeNull()
    expect(m.mrrNewCents).toBeNull()
    expect(m.mrrExpansionCents).toBeNull()
    expect(m.mrrContractionCents).toBeNull()
    expect(m.mrrChurnedCents).toBeNull()
    expect(m.customersStart).toBeNull()

    // Ce qui EST mesuré ce mois-là le reste.
    expect(m.mrrEndCents).toBe(14900)
    expect(m.customersEnd).toBe(1)
  })

  it('distingue « aucun mois précédent » de « zéro client, mesuré »', () => {
    const jamais = computeMovements(null, [{ subjectId: 'a', mrrCents: 100 }])
    const mesureAZero = computeMovements([], [{ subjectId: 'a', mrrCents: 100 }])

    expect(jamais.mrrStartCents).toBeNull()
    expect(mesureAZero.mrrStartCents).toBe(0)
    expect(mesureAZero.mrrNewCents).toBe(100)
  })

  it('un mois sans aucun mouvement ne fabrique pas de mouvement', () => {
    const lignes: SnapshotLine[] = [{ subjectId: 'a', mrrCents: 14900 }]
    const m = computeMovements(lignes, [...lignes])

    expect(m.mrrNewCents).toBe(0)
    expect(m.mrrExpansionCents).toBe(0)
    expect(m.mrrContractionCents).toBe(0)
    expect(m.mrrChurnedCents).toBe(0)
    expect(m.mrrEndCents).toBe(m.mrrStartCents)
  })
})

describe('lineMovements (#1646.6) — le détail PAR CLIENT que `computeMovements` agrège', () => {
  it('classe chaque ligne dans une et une seule nature, exactement comme le total les agrège', () => {
    const before: SnapshotLine[] = [
      { subjectId: 'reste', mrrCents: 14900 },
      { subjectId: 'monte', mrrCents: 4900 },
      { subjectId: 'descend', mrrCents: 19900 },
      { subjectId: 'part', mrrCents: 4900 },
    ]
    const after: SnapshotLine[] = [
      { subjectId: 'reste', mrrCents: 14900 },
      { subjectId: 'monte', mrrCents: 19900 },
      { subjectId: 'descend', mrrCents: 14900 },
      { subjectId: 'arrive', mrrCents: 9900 },
    ]

    const rows = lineMovements(before, after)

    // « reste » ne bouge pas : aucune ligne pour lui — un mois sans mouvement
    // ne fabrique pas de mouvement, au niveau ligne aussi.
    expect(rows.find(r => r.subjectId === 'reste')).toBeUndefined()
    expect(rows).toEqual(
      expect.arrayContaining([
        { subjectId: 'arrive', nature: 'nouveau', montantCents: 9900 },
        { subjectId: 'monte', nature: 'expansion', montantCents: 15000 },
        { subjectId: 'descend', nature: 'contraction', montantCents: 5000 },
        { subjectId: 'part', nature: 'attrition', montantCents: 4900 },
      ]),
    )
    expect(rows).toHaveLength(4)

    // Même total que l'agrégat — une seule dérivation, pas deux (GA-26).
    const total = computeMovements(before, after)
    expect(rows.filter(r => r.nature === 'nouveau').reduce((s, r) => s + r.montantCents, 0)).toBe(total.mrrNewCents)
    expect(rows.filter(r => r.nature === 'expansion').reduce((s, r) => s + r.montantCents, 0)).toBe(
      total.mrrExpansionCents,
    )
    expect(rows.filter(r => r.nature === 'contraction').reduce((s, r) => s + r.montantCents, 0)).toBe(
      total.mrrContractionCents,
    )
    expect(rows.filter(r => r.nature === 'attrition').reduce((s, r) => s + r.montantCents, 0)).toBe(
      total.mrrChurnedCents,
    )
  })

  it('sans mois précédent, aucune ligne — une différence sans terme de comparaison n’existe pas', () => {
    expect(lineMovements(null, [{ subjectId: 'a', mrrCents: 100 }])).toEqual([])
  })

  it('un mois sans aucun mouvement ne fabrique aucune ligne', () => {
    const lignes: SnapshotLine[] = [{ subjectId: 'a', mrrCents: 14900 }]
    expect(lineMovements(lignes, [...lignes])).toEqual([])
  })
})

describe('recurringLines (#1645)', () => {
  it('T3 — un client sur facture n’entre PAS dans le MRR', () => {
    const rows: SubscriptionRow[] = [
      { userId: 'stripe', plan: 'growth', extraSeats: 0, billingMode: 'stripe' },
      { userId: 'facture', plan: 'growth', extraSeats: 0, billingMode: 'manual' },
    ]

    expect(recurringLines(rows, PRICES, SEATS)).toEqual([{ subjectId: 'stripe', mrrCents: 19900 }])
  })

  it('facture les sièges supplémentaires au prix DE LEUR plan', () => {
    const rows: SubscriptionRow[] = [{ userId: 'a', plan: 'team', extraSeats: 3, billingMode: 'stripe' }]

    expect(recurringLines(rows, PRICES, SEATS)).toEqual([{ subjectId: 'a', mrrCents: 14900 + 3 * 2900 }])
  })

  it('un plan gratuit ou inconnu n’est pas un client payant — il sort du corpus', () => {
    const rows: SubscriptionRow[] = [
      { userId: 'essai', plan: 'trial', extraSeats: 0, billingMode: 'stripe' },
      { userId: 'beta', plan: 'beta', extraSeats: 0, billingMode: 'stripe' },
      { userId: 'mystere', plan: 'mystere', extraSeats: 0, billingMode: 'stripe' },
    ]

    expect(recurringLines(rows, PRICES, SEATS)).toEqual([])
  })

  it('une chute à zéro sort du corpus, donc se lit comme un DÉPART', () => {
    const avant = recurringLines([{ userId: 'a', plan: 'growth', extraSeats: 0, billingMode: 'stripe' }], PRICES, SEATS)
    const apres = recurringLines([{ userId: 'a', plan: 'trial', extraSeats: 0, billingMode: 'stripe' }], PRICES, SEATS)

    const m = computeMovements(avant, apres)
    expect(m.mrrChurnedCents).toBe(19900)
    expect(m.mrrContractionCents).toBe(0)
    expect(m.customersEnd).toBe(0)
  })
})

describe('contractedMonthlyCents (#1645)', () => {
  it('annualise le récurrent et compte ses clients', () => {
    const r = contractedMonthlyCents([
      { workspaceId: 'm', amountCents: 60000, period: 'monthly' },
      { workspaceId: 't', amountCents: 90000, period: 'quarterly' },
      { workspaceId: 'a', amountCents: 240000, period: 'yearly' },
    ])

    expect(r.recurringCents).toBe(60000 + 30000 + 20000)
    expect(r.recurringCustomers).toBe(3)
  })

  it('ne divise JAMAIS un one_off par douze — il est compté à part', () => {
    const r = contractedMonthlyCents([{ workspaceId: 'x', amountCents: 120000, period: 'one_off' }])

    expect(r.recurringCents).toBe(0)
    expect(r.recurringCustomers).toBe(0)
    expect(r.oneOffCents).toBe(120000)
    expect(r.oneOffCustomers).toBe(1)
  })

  it('un montant nul n’est pas un contrat', () => {
    const r = contractedMonthlyCents([{ workspaceId: 'x', amountCents: 0, period: 'yearly' }])

    expect(r.recurringCents).toBe(0)
    expect(r.recurringCustomers).toBe(0)
  })
})

describe('previousMonth / monthOf', () => {
  it('recule d’un mois, y compris par-dessus janvier', () => {
    expect(previousMonth('2026-09')).toBe('2026-08')
    expect(previousMonth('2026-01')).toBe('2025-12')
    expect(previousMonth('2026-10')).toBe('2026-09')
  })

  it('refuse un mois illisible plutôt que d’en deviner un', () => {
    expect(() => previousMonth('2026-13')).toThrow()
    expect(() => previousMonth('septembre')).toThrow()
  })

  it('lit le mois d’une date en UTC — jamais l’horloge locale du test', () => {
    expect(monthOf(new Date('2026-09-07T22:30:00Z'))).toBe('2026-09')
    expect(monthOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01')
  })
})
