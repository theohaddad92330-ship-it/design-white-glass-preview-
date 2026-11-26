import { describe, expect, it } from 'vitest'
import { hiringVolumeByMonth } from './hiringVolumeTrend'

const offer = (title: string, date: string | null, over: Record<string, unknown> = {}) => ({
  title,
  date,
  contract_type: 'CDI',
  company: 'SNCF Réseau',
  url: null,
  ...over,
})

describe('hiringVolumeByMonth — la tendance du compte est le volume d’offres dans le temps (#3920, Louis 15/10)', () => {
  it('compte les offres DATÉES par mois, du plus ancien au plus récent', () => {
    const series = hiringVolumeByMonth([
      offer('Dev', '2026-08-10'),
      offer('Data', '2026-08-21'),
      offer('SRE', '2026-07-02'),
      offer('Archi', '2026-09-30T08:00:00.000+0000'),
    ])
    expect(series).toEqual([
      { month: '2026-07', count: 1 },
      { month: '2026-08', count: 2 },
      { month: '2026-09', count: 1 },
    ])
  })

  it('sait dire NON : sans date lisible, une offre n’entre pas (jamais rangée dans un mois inventé)', () => {
    const series = hiringVolumeByMonth([
      offer('A', null),
      offer('B', 'Non daté'),
      offer('C', '2026'),
      offer('D', '2026-07-01'),
      offer('E', '2026-08-01'),
    ])
    expect(series).toEqual([
      { month: '2026-07', count: 1 },
      { month: '2026-08', count: 1 },
    ])
  })

  it('sait dire NON : un seul mois n’est pas une tendance — aucune série', () => {
    expect(hiringVolumeByMonth([offer('A', '2026-08-01'), offer('B', '2026-08-15')])).toEqual([])
    expect(hiringVolumeByMonth([])).toEqual([])
    expect(hiringVolumeByMonth(undefined)).toEqual([])
    expect(hiringVolumeByMonth('n’importe quoi')).toEqual([])
  })

  it('écarte les stages (jamais servis, #4044), les dates futures et compte une offre vue deux fois UNE fois', () => {
    const series = hiringVolumeByMonth([
      offer('Stage data', '2026-07-05', { contract_type: 'Stage' }),
      offer('Dev', '2026-07-10', { url: 'https://x/1' }),
      offer('Dev', '2026-07-10', { url: 'https://x/1' }),
      offer('SRE', '2026-08-10'),
      offer('Futur', '2027-01-10'),
    ])
    expect(series).toEqual([
      { month: '2026-07', count: 1 },
      { month: '2026-08', count: 1 },
    ])
  })

  it('ne comble aucun mois vide : un mois sans offre collectée ne fait AUCUNE ligne', () => {
    const series = hiringVolumeByMonth([offer('A', '2026-05-10'), offer('B', '2026-08-10')])
    expect(series.map(entry => entry.month)).toEqual(['2026-05', '2026-08'])
  })
})
