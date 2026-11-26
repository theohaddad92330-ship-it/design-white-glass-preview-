import { Logger } from '@nestjs/common'
import { EnrichmentProviders, type EnrichmentReport } from './enrichment-providers'
import { MemoryPersonCacheStore, PersonContactCache, setPersonContactCacheStore } from './person-contact-cache'

/**
 * CACHE-API (15/10) — une coordonnée achetée n'est JAMAIS payée deux fois en 30 jours :
 * deux appels identiques = 1 seul appel réseau ; COMMUN ; une panne n'est pas écrite ;
 * une personne effacée n'est jamais resservie depuis le cache.
 */
describe('EnrichmentProviders — cache 30 j par personne, commun à tous les espaces', () => {
  const OLD_ENV = { ...process.env }
  const person = { firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' }
  let providers: EnrichmentProviders
  let store: MemoryPersonCacheStore

  const ok = (body: unknown): Partial<Response> => ({ ok: true, status: 200, json: async () => body })
  const hunterHit = (): Partial<Response> => ok({ data: { email: 'sofia.nardi@acme.com' } })
  const mockFetch = (handler: () => Partial<Response>) =>
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => handler() as Response)
  const report = (): EnrichmentReport => ({ attempts: [] })

  beforeEach(() => {
    jest.restoreAllMocks()
    for (const key of ['HUNTER_API_KEY', 'LUSHA_API_KEY', 'KASPR_API_KEY', 'FULLENRICH_API_KEY'])
      delete process.env[key]
    process.env['HUNTER_API_KEY'] = 'k'
    store = new MemoryPersonCacheStore()
    setPersonContactCacheStore(store)
    providers = new EnrichmentProviders()
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
    setPersonContactCacheStore(null)
  })

  it('deux appels identiques → UN seul appel réseau', async () => {
    const fetchSpy = mockFetch(hunterHit)
    const q = { ...person, only: 'email' as const, workspaceId: 'ws-1' }
    const first = await providers.enrich(q, report())
    const second = await providers.enrich(q, report())
    expect(first?.email).toBe('sofia.nardi@acme.com')
    expect(second).toEqual(first)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('« have » et « only » se filtrent à la lecture : e-mail payé, question e-mail seule puis tout — pas de second appel pour l’e-mail', async () => {
    const fetchSpy = mockFetch(hunterHit)
    await providers.enrich({ ...person, only: 'email', workspaceId: 'ws-1' }, report())
    const again = await providers.enrich(
      { ...person, only: 'email', workspaceId: 'ws-1', have: { phone: true } },
      report(),
    )
    expect(again?.email).toBe('sofia.nardi@acme.com')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('COMMUN (Louis 15/10) : deux espaces, même personne = 1 seul appel réseau', async () => {
    const fetchSpy = mockFetch(hunterHit)
    await providers.enrich({ ...person, only: 'email', workspaceId: 'ws-1' }, report())
    const second = await providers.enrich({ ...person, only: 'email', workspaceId: 'ws-2' }, report())
    expect(second?.email).toBeTruthy()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('une panne réseau n’est JAMAIS écrite : la question suivante repart', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('réseau'))
    const q = { ...person, only: 'email' as const, workspaceId: 'ws-1' }
    await providers.enrich(q, report())
    await providers.enrich(q, report())
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(store.entries.size).toBe(0)
  })

  it('un « rien trouvé » est gardé (TTL court) : pas de second appel immédiat', async () => {
    const fetchSpy = mockFetch(() => ok({ data: { email: null } }))
    const q = { ...person, only: 'email' as const, workspaceId: 'ws-1' }
    expect(await providers.enrich(q, report())).toBeNull()
    expect(await providers.enrich(q, report())).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('sans espace non plus : le cache est commun, une seule question payée', async () => {
    const fetchSpy = mockFetch(hunterHit)
    await providers.enrich({ ...person, only: 'email' }, report())
    await providers.enrich({ ...person, only: 'email' }, report())
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('personne EFFACÉE (c67) : purgée, elle n’est plus jamais resservie depuis le cache', async () => {
    const fetchSpy = mockFetch(hunterHit)
    const q = { ...person, only: 'email' as const, workspaceId: 'ws-1' }
    await providers.enrich(q, report())
    expect(store.entries.size).toBe(1)
    await new PersonContactCache(store).purgePerson(person)
    expect(store.entries.size).toBe(0)
    await providers.enrich(q, report())
    expect(fetchSpy).toHaveBeenCalledTimes(2) // reparti en direct, rien n'a été resservi
  })

  it('le journal ne porte aucune coordonnée', async () => {
    mockFetch(hunterHit)
    const logs: string[] = []
    jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.push(String(m))
    })
    const q = { ...person, only: 'email' as const, workspaceId: 'ws-1' }
    await providers.enrich(q, report())
    await providers.enrich(q, report())
    expect(logs.filter(l => l.includes('cache='))).toEqual([
      'contact:enrich cache=miss payé=oui',
      'contact:enrich cache=hit payé=non',
    ])
  })
})
