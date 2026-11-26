import { describe, expect, it } from 'vitest'
import { expertiseHeadline, historicalNeedsCount, monogram, overviewCounters, sizeBandOf } from './discover-overview'
import type { DiscoverCandidate } from './discover-types'

type Row = Pick<DiscoverCandidate, 'portfolioState' | 'knownNeedsCount' | 'sourceAxes'>
const axes = (n: number): DiscoverCandidate['sourceAxes'] => ({
  score: 6,
  max: 10,
  unmeasured: [],
  axes: [
    {
      key: 'dataforge',
      max: 10,
      measured: true,
      points: 6,
      evidence: `${n} besoin(s) passé(s)`,
      label_key: 'reference_needs',
      label_params: { n, won: 0 },
      latestAt: null,
    },
  ],
})

describe('#4493 — les compteurs de la page, sur les comptes affichés', () => {
  it('somme ce qui est MESURÉ ; aucun compte mesuré ⇒ `null`, jamais « 0 »', () => {
    const rows: Row[] = [
      { portfolioState: 'new', knownNeedsCount: undefined, sourceAxes: undefined },
      { portfolioState: 'customer', knownNeedsCount: 2, sourceAxes: axes(3) },
      { portfolioState: 'new', knownNeedsCount: 0, sourceAxes: axes(1) },
    ]
    expect(overviewCounters(rows)).toEqual({ newForWorkspace: 2, knownNeeds: 2, historicalNeeds: 4 })
    expect(overviewCounters([rows[0] as Row])).toEqual({ newForWorkspace: 1, knownNeeds: null, historicalNeeds: null })
  })

  it('les besoins historiques ne se lisent que sur l’axe qui les porte (sait dire NON)', () => {
    expect(historicalNeedsCount({ sourceAxes: axes(3) })).toBe(3)
    const other = axes(3)
    if (other?.axes[0]) other.axes[0] = { ...other.axes[0], label_key: 'reference_priority', label_params: {} }
    expect(historicalNeedsCount({ sourceAxes: other })).toBeNull()
    expect(historicalNeedsCount({ sourceAxes: undefined })).toBeNull()
  })
})

describe('#4493 — l’illustration d’une piste : des initiales, jamais un logo deviné', () => {
  it.each([
    ['Île-de-France', 'IDF'],
    ['Banque & assurance', 'BA'],
    ['SAP', 'SAP'],
    ['Cloud & Infrastructure (AWS, Azure, GCP, Hosting)', 'CI'],
    ['', ''],
  ])('%s → %s', (label, expected) => {
    expect(monogram(label)).toBe(expected)
  })

  it('une expertise déclarée perd sa liste entre parenthèses', () => {
    expect(expertiseHeadline('Cloud & Infrastructure (AWS, Azure, GCP, Hosting)')).toBe('Cloud & Infrastructure')
  })
})

describe('#4495 — la tranche maison, lue sur le libellé publié', () => {
  it.each([
    ['250 à 499 salariés', 'ETI'],
    ['10 000 à 19 999 salariés', 'GC'],
    ['10-49', 'PME'],
    ['1 à 2 salariés', 'TPE'],
    ['1000+', 'GC'],
    ['0 salarié', null],
    [null, null],
  ] as const)('%s → %s', (label, code) => {
    expect(sizeBandOf(label)).toBe(code)
  })
})
