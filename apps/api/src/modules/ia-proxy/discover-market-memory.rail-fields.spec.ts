import type { DiscoverCandidate } from '@bellum/contracts'
import type { MarketMemoryService } from '../market-memory/market-memory.service'
import { DiscoverMarketMemoryService } from './discover-market-memory.service'

/**
 * #4632.2 — « Famille de rôles observée » et « Écosystèmes liés à » AGISSENT sur la liste : ils la CLASSENT par la
 * mémoire marché (les comptes observés avec cette famille / cet écosystème d'abord, les autres derrière dans leur
 * ordre). Rien n'est écarté : la mémoire marché ne peut pas prouver une ABSENCE (GA-259), et une recherche qui
 * plafonne à 50 lignes ne dit pas « cette entreprise n'a pas ce rôle ».
 */
const candidate = (siren: string, name: string) => ({ siren, name }) as unknown as DiscoverCandidate

function serviceOf(matches: Array<{ companyName: string }> | 'unavailable') {
  const searchByFilters = jest.fn(async () =>
    matches === 'unavailable' ? { status: 'unavailable' } : { status: 'ok', matches },
  )
  const service = new DiscoverMarketMemoryService({ searchByFilters } as unknown as MarketMemoryService)
  return { service, searchByFilters }
}

const LIST = [candidate('1', 'Alpha SAS'), candidate('2', 'Bravo'), candidate('3', 'Charlie')]

describe('#4632.2 — les champs du rail changent la liste', () => {
  it('la famille de rôles observée remonte en tête les comptes observés, sans en écarter aucun', async () => {
    const { service, searchByFilters } = serviceOf([{ companyName: 'CHARLIE' }, { companyName: 'Hors liste' }])
    const out = await service.applyFilters(LIST, { roleFamilyObserved: 'Data' })
    expect(searchByFilters).toHaveBeenCalledWith({ roleFamily: 'Data' })
    expect(out.candidates.map(c => c.siren)).toEqual(['3', '1', '2'])
    expect(out.candidates).toHaveLength(LIST.length)
  })

  it("l'écosystème lié à classe de la même façon, par l'ESN observée", async () => {
    const { service, searchByFilters } = serviceOf([{ companyName: 'Bravo' }])
    const out = await service.applyFilters(LIST, { ecosystemObserved: 'Sopra' })
    expect(searchByFilters).toHaveBeenCalledWith({ esn: 'Sopra' })
    expect(out.candidates.map(c => c.siren)).toEqual(['2', '1', '3'])
  })

  it('sans critère posé, aucune lecture et la liste est inchangée', async () => {
    const { service, searchByFilters } = serviceOf([])
    const out = await service.applyFilters(LIST, {})
    expect(searchByFilters).not.toHaveBeenCalled()
    expect(out.candidates).toEqual(LIST)
  })

  it('mémoire marché en panne : la liste reste INTACTE et la panne se dit (non mesuré)', async () => {
    const { service } = serviceOf('unavailable')
    const out = await service.applyFilters(LIST, { roleFamilyObserved: 'Data' })
    expect(out.candidates).toEqual(LIST)
    expect(out.degraded).toEqual([expect.objectContaining({ kind: 'unmeasured', fields: ['roleFamilyObserved'] })])
  })
})
