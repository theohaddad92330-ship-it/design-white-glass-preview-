import { describe, expect, it } from 'vitest'
import { emptyUnifiedFilters } from './discover-filters'
import { HISTORY_MAX_ENTRIES, HISTORY_WINDOW_DAYS, pruneHistory, recordSearch } from './discover-search-history'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 19)
const withCity = (city: string) => ({ ...emptyUnifiedFilters(), city })

// #4313.1 — historique des recherches : 30 jours, 20 max, relançables.
describe('historique des recherches (#4313.1)', () => {
  it('enregistre une recherche avec ses filtres et sa date', () => {
    const history = recordSearch([], withCity('Lyon'), NOW)
    expect(history).toHaveLength(1)
    expect(history[0]?.filters.city).toBe('Lyon')
    expect(history[0]?.at).toBe(NOW)
  })

  it('SAIT DIRE NON : une recherche sans aucun critère n’est pas enregistrée', () => {
    expect(recordSearch([], emptyUnifiedFilters(), NOW)).toEqual([])
  })

  it('une recherche identique remonte en tête au lieu de se dupliquer', () => {
    const first = recordSearch([], withCity('Lyon'), NOW - 1000)
    const second = recordSearch(first, withCity('Paris'), NOW - 500)
    const third = recordSearch(second, withCity('Lyon'), NOW)
    expect(third.map(entry => entry.filters.city)).toEqual(['Lyon', 'Paris'])
  })

  it('plafonne à 20 entrées, les plus récentes d’abord', () => {
    let history = recordSearch([], withCity('v0'), NOW)
    for (let i = 1; i < 30; i++) history = recordSearch(history, withCity(`v${i}`), NOW + i)
    expect(history).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(history[0]?.filters.city).toBe('v29')
  })

  it('retire ce qui a plus de 30 jours', () => {
    const history = [
      { id: 'a', at: NOW - (HISTORY_WINDOW_DAYS + 1) * DAY, filters: withCity('vieux') },
      { id: 'b', at: NOW - DAY, filters: withCity('récent') },
    ]
    expect(pruneHistory(history, NOW).map(entry => entry.filters.city)).toEqual(['récent'])
  })

  it('garde 30 jours (brief 20/10) : 29 jours restent, 31 jours partent', () => {
    expect(HISTORY_WINDOW_DAYS).toBe(30)
    const history = [
      { id: 'a', at: NOW - 31 * DAY, filters: withCity('vieux') },
      { id: 'b', at: NOW - 29 * DAY, filters: withCity('tenu') },
    ]
    expect(pruneHistory(history, NOW).map(entry => entry.filters.city)).toEqual(['tenu'])
  })
})
