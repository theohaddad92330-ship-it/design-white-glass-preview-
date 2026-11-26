import { describe, expect, it } from 'vitest'
import type { DiscoverCandidate } from './discover-types'
import { emptyUnifiedFilters, type UnifiedFilters } from './discover-filters'
import { blockingFilters, freelanceSignalMissing } from './discover-blocking-filters'

// #4997 — « sans le filtre X : N comptes » : mesuré sur les candidats reçus, aucun appel en plus.
const account = (name: string, over: Partial<DiscoverCandidate> = {}): DiscoverCandidate =>
  ({
    siren: name,
    name,
    nafCode: null,
    department: null,
    headcountRange: null,
    signals: [],
    ...over,
  }) as DiscoverCandidate
const unified = (over: Partial<UnifiedFilters> = {}): UnifiedFilters => ({ ...emptyUnifiedFilters(), ...over })

describe('#4997 — le filtre qui vide la liste se nomme', () => {
  // maritime/routier · Île-de-France · 1000 salariés et plus : trois comptes, chacun écarté par UN filtre.
  const pool = [
    account('A', { department: '75', headcountRange: '50 à 99 salariés' }),
    account('B', { department: '69', headcountRange: '1000 salariés et plus' }),
    account('C', { department: '75', headcountRange: '10 à 19 salariés' }),
  ]
  const filters = unified({ department: '75', headcount: ['1000+'] as UnifiedFilters['headcount'] })

  it('nomme chaque filtre dont la levée rend des comptes, du plus rendant au moins', () => {
    expect(blockingFilters(pool, filters, 'signals', 0).map(f => f.key)).toEqual(
      expect.arrayContaining(['department', 'headcount']),
    )
    const byKey = Object.fromEntries(blockingFilters(pool, filters, 'signals', 0).map(f => [f.key, f.count]))
    expect(byKey.department).toBe(1) // B revient sans la zone
    expect(byKey.headcount).toBe(2) // A et C reviennent sans la taille
  })

  it('un seul filtre posé, ou une liste déjà fournie : rien à dire', () => {
    expect(blockingFilters(pool, unified({ department: '75' }), 'signals', 0)).toEqual([])
    expect(blockingFilters(pool, filters, 'signals', 5)).toEqual([])
  })

  it('un filtre dont la levée ne rend rien n’est pas nommé (rien n’est deviné)', () => {
    expect(blockingFilters([account('Z', { department: '13' })], filters, 'signals', 0).map(f => f.key)).toEqual([
      'department',
    ])
  })

  it('#4999 — Freelance seul sans aucun champ contrat à la source : l’écran le dit', () => {
    const hiring = (contractType?: 'CDI') =>
      account('H', {
        signals: [{ type: 'hiring', label: 'Offre', date: '2026-07-01', ...(contractType ? { contractType } : {}) }],
      })
    const freelance = unified({ freelanceOnly: true })
    expect(freelanceSignalMissing([hiring()], freelance)).toBe(true)
    expect(freelanceSignalMissing([hiring(), hiring('CDI')], freelance)).toBe(false)
    expect(freelanceSignalMissing([hiring()], unified())).toBe(false)
    expect(freelanceSignalMissing([], freelance)).toBe(false)
  })
})
