import { CascadeLedger, providerCost } from './enrichment-cascade'
import { EnrichmentProviders, type EnrichmentReport } from './enrichment-providers'

/**
 * #4106 — la cascade payante : ordre, plafond, erreurs, arrêt. Le journal `tried` est
 * INTERNE : rien de ce qu'il contient ne sort vers une réponse d'API.
 */
describe('EnrichmentProviders — cascade bornée (#4106)', () => {
  const OLD_ENV = { ...process.env }
  const query = { firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' }
  let providers: EnrichmentProviders

  const route = (handlers: { hunter?: () => Partial<Response>; lusha?: () => Partial<Response> }) =>
    jest.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = String(input)
      if (url.includes('hunter.io') && handlers.hunter) return handlers.hunter() as Response
      if (url.includes('lusha.com') && handlers.lusha) return handlers.lusha() as Response
      throw new Error(`appel inattendu ${url}`)
    })
  const ok = (body: unknown): Partial<Response> => ({ ok: true, status: 200, json: async () => body })
  const fail = (status: number): Partial<Response> => ({ ok: false, status })
  const hunterMiss = (): Partial<Response> => ok({ data: { email: null } })
  const lushaHit = (): Partial<Response> => ok({ data: { emailAddresses: [{ email: 's.nardi@acme.com' }] } })
  const reportWith = (ceiling: number | null): EnrichmentReport & { ledger: CascadeLedger } => ({
    attempts: [],
    ledger: new CascadeLedger(ceiling),
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    for (const key of ['HUNTER_API_KEY', 'LUSHA_API_KEY', 'KASPR_API_KEY', 'FULLENRICH_API_KEY'])
      delete process.env[key]
    process.env['HUNTER_API_KEY'] = 'k'
    process.env['LUSHA_API_KEY'] = 'k'
    providers = new EnrichmentProviders()
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('fournisseur 1 vide → fournisseur 2 appelé ; tried garde l’ordre', async () => {
    const fetchSpy = route({ hunter: hunterMiss, lusha: lushaHit })
    const report = reportWith(100)
    const hit = await providers.enrich(query, report)
    expect(hit).toEqual({ provider: 'lusha', email: 's.nardi@acme.com' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(report.ledger.tried.map(t => [t.provider, t.outcome])).toEqual([
      ['hunter', 'miss'],
      ['lusha', 'hit'],
    ])
  })

  it('champ trouvé → arrêt : only=email et Hunter répond ⇒ Lusha n’est pas appelé', async () => {
    const fetchSpy = route({ hunter: () => ok({ data: { email: 'sofia.nardi@acme.com' } }), lusha: lushaHit })
    const report = reportWith(100)
    const hit = await providers.enrich({ ...query, only: 'email' }, report)
    expect(hit?.email).toBe('sofia.nardi@acme.com')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(report.ledger.tried.map(t => t.provider)).toEqual(['hunter'])
  })

  it('plafond atteint → AUCUN appel payant supplémentaire, le journal le dit', async () => {
    const fetchSpy = route({ hunter: hunterMiss, lusha: lushaHit })
    const report = reportWith(providerCost('hunter') + providerCost('lusha') - 1)
    const hit = await providers.enrich(query, report)
    expect(hit).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(report.ledger.stopped).toBe('budget')
    expect(report.ledger.tried.map(t => [t.provider, t.outcome])).toEqual([
      ['hunter', 'miss'],
      ['lusha', 'skipped_budget'],
    ])
  })

  it('429 → fournisseur suivant', async () => {
    const fetchSpy = route({ hunter: () => fail(429), lusha: lushaHit })
    const report = reportWith(100)
    const hit = await providers.enrich(query, report)
    expect(hit?.provider).toBe('lusha')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(report.ledger.tried[0]).toMatchObject({ provider: 'hunter', outcome: 'error', cost: 0, status: 429 })
  })

  it('5xx → fournisseur suivant', async () => {
    const fetchSpy = route({ hunter: () => fail(503), lusha: lushaHit })
    const report = reportWith(100)
    expect((await providers.enrich(query, report))?.provider).toBe('lusha')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('4xx de notre fait (clé refusée) → arrêt de la cascade, le suivant n’est pas appelé', async () => {
    const warn = jest
      .spyOn((providers as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation()
    const fetchSpy = route({ hunter: () => fail(401), lusha: lushaHit })
    const report = reportWith(100)
    expect(await providers.enrich(query, report)).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(report.ledger.stopped).toBe('client_error')
    expect(warn).toHaveBeenCalled()
  })

  // LOT (15/10) DATA-A point 1 — une coordonnée déjà trouvée n'est jamais redemandée ni écrasée.
  it('e-mail déjà trouvé (have.email) → Hunter n’est PAS appelé, Lusha ne facture que le téléphone', async () => {
    const fetchSpy = route({
      hunter: hunterMiss,
      lusha: () => ok({ data: { phoneNumbers: [{ number: '+33612345678' }] } }),
    })
    const report = reportWith(100)
    const hit = await providers.enrich({ ...query, have: { email: true } }, report)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('lusha.com')
    expect(hit?.phone).toBe('+33612345678')
    expect(report.ledger.tried.map(t => t.provider)).toEqual(['lusha'])
    expect(report.ledger.tried[0]?.cost).toBe(providerCost('lusha', ['phone']))
  })

  it('e-mail déjà trouvé → l’e-mail rendu par un fournisseur ne le remplace jamais', async () => {
    route({
      hunter: hunterMiss,
      lusha: () =>
        ok({ data: { emailAddresses: [{ email: 'autre@acme.com' }], phoneNumbers: [{ number: '+33612345678' }] } }),
    })
    const hit = await providers.enrich({ ...query, have: { email: true } })
    expect(hit?.email).toBeUndefined()
    expect(hit?.phone).toBe('+33612345678')
  })

  it('sans journal fourni : comportement inchangé (pas de plafond)', async () => {
    const fetchSpy = route({ hunter: hunterMiss, lusha: lushaHit })
    expect((await providers.enrich(query))?.provider).toBe('lusha')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('un e-mail rendu qui correspond à un candidat du pattern est noté comme indice, jamais servi seul', async () => {
    route({ hunter: () => ok({ data: { email: 'sofia.nardi@acme.com' } }), lusha: lushaHit })
    const report = reportWith(100)
    await providers.enrich({ ...query, only: 'email', emailCandidates: ['sofia.nardi@acme.com'] }, report)
    expect(report.ledger.tried[0]).toMatchObject({ provider: 'hunter', outcome: 'hit', pattern_confirmed: true })
  })
})
