import { buildPipelineReport, meetingToDealRate, periodStart, type DealFact } from './pipeline-report'

/** Un deal ouvert par défaut ; chaque test ne surcharge que ce qui l'intéresse. */
function deal(over: Partial<DealFact> = {}): DealFact {
  return {
    id: 'd1',
    name: 'Deal',
    stage: 'appointmentscheduled',
    stageLabel: 'Rendez-vous fixé',
    pipeline: 'default',
    amount: 1000,
    ownerId: 'o1',
    ownerName: 'Théo',
    createdAt: '2026-07-01T00:00:00.000Z',
    closedAt: null,
    lastActivityAt: null,
    isClosed: false,
    isWon: null,
    ...over,
  }
}

const NOW = new Date('2026-08-03T12:00:00.000Z')

describe('periodStart', () => {
  it('ancre le trimestre sur le trimestre civil, pas sur 90 jours glissants', () => {
    expect(periodStart(NOW, 'quarter').toISOString()).toBe('2026-07-01T00:00:00.000Z')
    expect(periodStart(new Date('2026-02-14T00:00:00.000Z'), 'quarter').toISOString()).toBe('2026-01-01T00:00:00.000Z')
    expect(periodStart(new Date('2026-12-31T23:00:00.000Z'), 'quarter').toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('mois et année tombent sur le premier jour', () => {
    expect(periodStart(NOW, 'month').toISOString()).toBe('2026-08-01T00:00:00.000Z')
    expect(periodStart(NOW, 'year').toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('buildPipelineReport', () => {
  const base = { now: NOW, period: 'quarter' as const, truncated: false, syncedAt: '2026-08-03T06:00:00.000Z' }

  it('sépare les ouverts des clos de la fenêtre', () => {
    const report = buildPipelineReport(
      [
        deal({ id: 'open-1' }),
        deal({ id: 'won-1', isClosed: true, isWon: true, closedAt: '2026-07-15T00:00:00.000Z', amount: 5000 }),
        deal({ id: 'lost-1', isClosed: true, isWon: false, closedAt: '2026-07-20T00:00:00.000Z', amount: 2000 }),
      ],
      base,
    )
    expect(report.open.deals).toBe(1)
    expect(report.closed).toMatchObject({ won: 1, lost: 1, wonAmount: 5000, lostAmount: 2000 })
    expect(report.winRate).toBe(0.5)
  })

  it('exclut de la fenêtre un deal clos AVANT le trimestre', () => {
    const report = buildPipelineReport(
      [deal({ id: 'old', isClosed: true, isWon: true, closedAt: '2026-03-31T00:00:00.000Z' })],
      base,
    )
    expect(report.closed.won).toBe(0)
    expect(report.winRate).toBeNull()
  })

  it('un deal clos sans date de clôture lisible n’entre dans AUCUNE fenêtre', () => {
    // C'est la règle qui empêche l'historique mal daté de gonfler le trimestre
    // en cours — le chiffre le plus regardé du rapport.
    const report = buildPipelineReport(
      [
        deal({ id: 'no-date', isClosed: true, isWon: true, closedAt: null }),
        deal({ id: 'bad-date', isClosed: true, isWon: true, closedAt: 'pas une date' }),
      ],
      base,
    )
    expect(report.closed.won).toBe(0)
    expect(report.winRate).toBeNull()
  })

  it('ne compte jamais un montant absent comme zéro', () => {
    const report = buildPipelineReport([deal({ id: 'a', amount: null }), deal({ id: 'b', amount: 3000 })], base)
    expect(report.open.amount).toBe(3000)
    expect(report.open.amountUnknown).toBe(1)
    expect(report.open.byStage[0]).toMatchObject({ deals: 2, amount: 3000, amountUnknown: 1 })
  })

  it('le taux de conversion est nul quand rien n’est clos, jamais zéro', () => {
    const report = buildPipelineReport([deal()], base)
    expect(report.winRate).toBeNull()
  })

  it('un deal clos à l’issue illisible n’est ni gagné ni perdu', () => {
    const report = buildPipelineReport(
      [deal({ id: 'x', isClosed: true, isWon: null, closedAt: '2026-07-10T00:00:00.000Z' })],
      base,
    )
    expect(report.closed).toMatchObject({ won: 0, lost: 0, outcomeUnknown: 1 })
    expect(report.winRate).toBeNull()
  })

  it('le cycle moyen ignore les deals mal datés et les compte à part', () => {
    const report = buildPipelineReport(
      [
        deal({
          id: 'ten-days',
          isClosed: true,
          isWon: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          closedAt: '2026-07-11T00:00:00.000Z',
        }),
        deal({
          id: 'twenty-days',
          isClosed: true,
          isWon: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          closedAt: '2026-07-21T00:00:00.000Z',
        }),
        deal({ id: 'no-created', isClosed: true, isWon: true, createdAt: null, closedAt: '2026-07-15T00:00:00.000Z' }),
      ],
      base,
    )
    expect(report.averageCycleDays).toBe(15)
    expect(report.cycleUnmeasured).toBe(1)
  })

  it('une clôture antérieure à la création ne produit pas un cycle négatif', () => {
    const report = buildPipelineReport(
      [
        deal({
          id: 'backwards',
          isClosed: true,
          isWon: true,
          createdAt: '2026-07-20T00:00:00.000Z',
          closedAt: '2026-07-10T00:00:00.000Z',
        }),
      ],
      base,
    )
    expect(report.averageCycleDays).toBeNull()
    expect(report.cycleUnmeasured).toBe(1)
  })

  it('regroupe par propriétaire, les non assignés compris', () => {
    const report = buildPipelineReport(
      [
        deal({ id: 'a', ownerId: 'o1', ownerName: 'Théo' }),
        deal({
          id: 'b',
          ownerId: 'o1',
          ownerName: 'Théo',
          isClosed: true,
          isWon: true,
          closedAt: '2026-07-05T00:00:00.000Z',
          amount: 9000,
        }),
        deal({ id: 'c', ownerId: null, ownerName: null }),
      ],
      base,
    )
    const theo = report.byOwner.find(o => o.ownerId === 'o1')
    expect(theo).toMatchObject({ open: 1, won: 1, wonAmount: 9000 })
    expect(report.byOwner.find(o => o.ownerId === 'unassigned')).toMatchObject({ open: 1 })
  })

  it('porte sa couverture — combien lu, tronqué ou non, synchronisé quand', () => {
    const report = buildPipelineReport([deal()], { ...base, truncated: true, syncedAt: null })
    expect(report.coverage).toEqual({ dealsRead: 1, truncated: true, syncedAt: null })
  })

  it('un cache vide rend un rapport vide, pas une erreur', () => {
    const report = buildPipelineReport([], base)
    expect(report.open.deals).toBe(0)
    expect(report.winRate).toBeNull()
    expect(report.averageCycleDays).toBeNull()
  })
})

describe('meetingToDealRate', () => {
  it('compte des personnes rencontrées, pas des réunions', () => {
    expect(meetingToDealRate({ contactsWithMeeting: 10, contactsWithMeetingAndDeal: 3 })).toEqual({
      rate: 0.3,
      base: 10,
    })
  })

  it('rend null quand personne n’a été rencontré', () => {
    expect(meetingToDealRate({ contactsWithMeeting: 0, contactsWithMeetingAndDeal: 0 })).toEqual({
      rate: null,
      base: 0,
    })
  })

  it('borne le numérateur au dénominateur — jamais plus de 100 %', () => {
    expect(meetingToDealRate({ contactsWithMeeting: 4, contactsWithMeetingAndDeal: 9 }).rate).toBe(1)
  })
})
