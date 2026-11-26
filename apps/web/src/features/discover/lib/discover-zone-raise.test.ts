import { describe, expect, it } from 'vitest'
import { applyZoneRaise, nextZoneRaise } from './discover-zone-widening'
import type { DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'

// #4433.3 (recette prod 01/11) — « Élargir la zone » MONTE d'un palier (ville → département → région), il ne retire
// pas la ville ; jamais la France en automatique (Louis 27/10).
describe('#4433.3 — « Élargir la zone » monte d’un palier', () => {
  const zone = (over: Record<string, unknown> = {}) => ({ city: 'Albi', department: '', region: [], ...over })

  it('nextZoneRaise : ville seule → département, puis région, puis plus rien (jamais la France d’office)', () => {
    expect(nextZoneRaise(zone(), null)).toBe('department')
    expect(nextZoneRaise(zone(), { city: 'Albi', tier: 'department' })).toBe('region')
    expect(nextZoneRaise(zone(), { city: 'Albi', tier: 'region' })).toBeNull()
  })

  it('SAIT DIRE NON : une autre ville repart du département ; sans ville, ou une aire posée, aucun geste de montée', () => {
    expect(nextZoneRaise(zone(), { city: 'Toulouse', tier: 'region' })).toBe('department')
    expect(nextZoneRaise(zone({ city: '' }), null)).toBeNull()
    expect(nextZoneRaise(zone({ department: '81' }), null)).toBeNull()
    expect(nextZoneRaise(zone({ region: ['76'] }), null)).toBeNull()
  })

  it('applyZoneRaise pose `zoneRaise` sur la recherche de CETTE ville, sans retirer la ville', () => {
    const request = { mode: 'registry', query: { filters: { city: 'Albi' }, limit: 24 } } as DiscoverRequest
    const out = applyZoneRaise(request, { city: 'albi', tier: 'department' })
    expect(out).toMatchObject({ query: { filters: { city: 'Albi', zoneRaise: 'department' } } })
    // une autre ville, ou aucun geste : la requête est intacte
    expect(applyZoneRaise(request, { city: 'Lille', tier: 'department' })).toBe(request)
    expect(applyZoneRaise(request, null)).toBe(request)
  })
})
