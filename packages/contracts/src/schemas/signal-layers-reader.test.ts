import { describe, expect, it } from 'vitest'
import { readSignalLayers } from './signal-layers-reader.js'
import { buildHistoricalNeeds, readSignalLayers } from './signal-layers-reader.js'
// #4760 — `signalLayers` était calculé par l'IA et n'avait AUCUN lecteur (ni web, ni API, ni contrat).
const layers = {
  visible: [{ signal: 'Budget 2026', date: '2026-09-01', freshness: 'current' }],
  more: [],
  historical: [
    { signal: 'Plan stratégique 2021', date: '2021-03-10', freshness: 'archive', freshness_window_days: 730 },
  ],
  counts: { total: 2, live: 1, historical: 1, hidden: 0 },
  job_offers: {
    visible: [{ title: 'DevOps', date: '2026-10-10', freshness: 'current' }],
    more: [],
    historical: [{ title: 'Architecte cloud', date: '2026-02-01', freshness: 'archive', freshness_window_days: 180 }],
    counts: { total: 2, live: 1, historical: 1, hidden: 0 },
  },
}

describe('readSignalLayers — #4760 le lecteur de `raw_analysis.signal_layers`', () => {
  it('nomme les besoins historiques avec leur date réelle, signaux ET offres', () => {
    const read = readSignalLayers({ signal_layers: layers })
    expect(read.historicalSignals).toEqual([{ label: 'Plan stratégique 2021', date: '2021-03-10', windowDays: 730 }])
    expect(read.historicalJobOffers).toEqual([{ label: 'Architecte cloud', date: '2026-02-01', windowDays: 180 }])
    expect(read.historicalCount).toBe(2)
  })

  it('lit aussi la forme camelCase (`signalLayers.jobOffers`) que l’IA émet avant le passage en snake_case', () => {
    const { job_offers, ...rest } = layers
    const read = readSignalLayers({ signalLayers: { ...rest, jobOffers: job_offers } })
    expect(read.historicalJobOffers.map(o => o.label)).toEqual(['Architecte cloud'])
  })

  it('une clé absente ou illisible rend vide, jamais un 0 déguisé en mesure', () => {
    for (const raw of [null, undefined, {}, { signal_layers: 'x' }, { signal_layers: { historical: 'x' } }]) {
      const read = readSignalLayers(raw)
      expect(read.historicalSignals).toEqual([])
      expect(read.historicalJobOffers).toEqual([])
      expect(read.historicalCount).toBeNull()
    }
  })

  it('une ligne historique sans libellé est écartée ; sans date, la date reste null (jamais inventée)', () => {
    const read = readSignalLayers({ signal_layers: { historical: [{ date: '2020' }, { signal: 'Sans date' }] } })
    expect(read.historicalSignals).toEqual([{ label: 'Sans date', date: null, windowDays: null }])
  })
})

describe('#4760 — buildHistoricalNeeds nomme libellé, date réelle, source et total', () => {
  it('range les plus récents d’abord, les non datés en dernier', () => {
    const block = buildHistoricalNeeds({
      historicalSignals: [{ label: 'A', date: null, windowDays: null }],
      historicalJobOffers: [
        { label: 'B', date: '2025-01-01', windowDays: 180 },
        { label: 'C', date: '2025-06-01', windowDays: 180 },
      ],
      historicalCount: 3,
    })
    expect(block?.total).toBe(3)
    expect(block?.items.map(i => `${i.label}:${i.source}`)).toEqual(['C:job_offer', 'B:job_offer', 'A:signal'])
  })

  it('rien à nommer → null, jamais un bloc vide ni un total 0', () => {
    expect(buildHistoricalNeeds({ historicalSignals: [], historicalJobOffers: [], historicalCount: null })).toBeNull()
    expect(buildHistoricalNeeds({ historicalSignals: [], historicalJobOffers: [], historicalCount: 0 })).toBeNull()
  })
})

describe('lot 771 — la couche garde le lien, les compétences et le TJM de la ligne', () => {
  it('lit url / skills / tjm_eur / nature quand ils sont là, sans rien inventer', () => {
    const read = readSignalLayers({
      signal_layers: {
        jobOffers: {
          historical: [
            {
              title: 'Architecte AWS',
              date: '2026-05-12',
              url: ' https://o/1 ',
              skills: ['AWS', ' '],
              tjm_eur: 650,
              type: 'recrutement',
            },
            { title: 'Sans rien', date: '2026-05-13', tjm_eur: 0 },
          ],
        },
      },
    })
    expect(read.historicalJobOffers[0]).toMatchObject({
      url: 'https://o/1',
      technologies: ['AWS'],
      tjmEur: 650,
      kind: 'recrutement',
    })
    const bare = read.historicalJobOffers[1]!
    expect(bare).not.toHaveProperty('url')
    expect(bare).not.toHaveProperty('tjmEur')
    expect(bare).not.toHaveProperty('technologies')
  })
})
