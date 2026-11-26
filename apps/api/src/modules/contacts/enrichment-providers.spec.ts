import { EnrichmentProviders } from './enrichment-providers'

/**
 * Ces fournisseurs sont le DERNIER recours d'une cascade qui débite un crédit.
 * Deux propriétés à verrouiller : sans clé, zéro appel réseau (donc zéro
 * facture chez un fournisseur qu'on n'a pas configuré) ; et jamais de donnée
 * inventée quand la réponse ne contient rien.
 */
describe('EnrichmentProviders', () => {
  const OLD_ENV = { ...process.env }
  let providers: EnrichmentProviders

  beforeEach(() => {
    delete process.env['HUNTER_API_KEY']
    delete process.env['LUSHA_API_KEY']
    providers = new EnrichmentProviders()
    jest.restoreAllMocks()
  })

  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('sans clé : désactivé, et AUCUN appel réseau', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    expect(providers.isEnabled()).toBe(false)
    expect(await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Hunter n’est pas appelé sans DOMAINE — il cherche dans un domaine, pas dans un nom', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
    const hit = await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', organizationName: 'ACME' })
    expect(hit).toBeNull()
    // Sans domaine, Hunter produirait surtout des faux positifs sur les homonymes.
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('Hunter rend l’adresse écrite par le fournisseur, telle quelle', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { email: 'sofia.nardi@acme.com', score: 92 } }),
    } as Response)

    const hit = await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    expect(hit).toEqual({ provider: 'hunter', email: 'sofia.nardi@acme.com' })
  })

  it('une réponse sans adresse ne devient pas un résultat', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { email: null, score: 0 } }),
    } as Response)

    expect(await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })).toBeNull()
  })

  it('un 4xx fournisseur ne fait pas tomber l’enrichissement', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 429 } as Response)
    expect(await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })).toBeNull()
  })

  it('Lusha prend la première adresse et le premier téléphone, sans les reclasser', async () => {
    process.env['LUSHA_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          emailAddresses: [{ email: 'sofia@acme.com' }, { email: 'autre@acme.com' }],
          phoneNumbers: [{ number: '+33 1 23 45 67 89' }],
        },
      }),
    } as Response)

    const hit = await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    expect(hit).toEqual({ provider: 'lusha', email: 'sofia@acme.com', phone: '+33 1 23 45 67 89' })
  })

  it('Hunter passe avant Lusha : son résultat est gardé quand Lusha ne rend rien de plus', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    process.env['LUSHA_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
      const isHunter = String(url).includes('hunter.io')
      return {
        ok: true,
        json: async () =>
          isHunter ? { data: { email: 'sofia@acme.com' } } : { data: { emailAddresses: [], phoneNumbers: [] } },
      } as Response
    })

    const hit = await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    // Hunter's email is kept — Lusha ran too (see next test) but had nothing to add.
    expect(hit).toEqual({ provider: 'hunter', email: 'sofia@acme.com' })
  })

  // #3022 (retour bêta) — Hunter (Email Finder) ne rend JAMAIS de téléphone ;
  // avant ce correctif, un `return hit` dès que Hunter matchait empêchait
  // Lusha de tourner, donc de compléter le téléphone. La cascade doit
  // continuer tant que le téléphone manque, même si Hunter a déjà trouvé
  // l'email.
  it('Lusha tourne ENCORE après Hunter quand le téléphone manque toujours, et son numéro est fusionné (#3022)', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    process.env['LUSHA_API_KEY'] = 'k'
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url: unknown) => {
      const isHunter = String(url).includes('hunter.io')
      return {
        ok: true,
        json: async () =>
          isHunter
            ? { data: { email: 'sofia@acme.com' } }
            : { data: { emailAddresses: [], phoneNumbers: [{ number: '+33 1 23 45 67 89' }] } },
      } as Response
    })

    const hit = await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })

    expect(fetchSpy).toHaveBeenCalledTimes(2) // Hunter, THEN Lusha — both ran.
    // Hunter's email is kept (present-only); Lusha's phone — the field that was
    // still missing — is merged in, and the provenance follows the phone.
    expect(hit).toEqual({ provider: 'lusha', email: 'sofia@acme.com', phone: '+33 1 23 45 67 89' })
  })

  it('un réseau qui tombe rend null au lieu de propager', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'))
    expect(await providers.enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })).toBeNull()
  })

  // #2988.5 — Hunter ne rend structurellement jamais de téléphone (Email
  // Finder). L'appeler pour `only: 'phone'` serait un appel fournisseur pour
  // une question qu'il ne peut pas répondre — même discipline que le saut de
  // Dropcontact dans `ContactsService.enrichContact`.
  it('only: "phone" — Hunter n’est pas appelé du tout, la cascade passe à Lusha', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    process.env['LUSHA_API_KEY'] = 'k'
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { emailAddresses: [], phoneNumbers: [{ number: '+33 1 23 45 67 89' }] },
      }),
    } as Response)

    const hit = await providers.enrich({
      firstName: 'Sofia',
      lastName: 'Nardi',
      domain: 'acme.com',
      only: 'phone',
    })
    expect(hit).toEqual({ provider: 'lusha', phone: '+33 1 23 45 67 89' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // La seule requête faite est celle de Lusha (host distinct de Hunter).
    expect((fetchSpy.mock.calls[0]?.[0] as string).includes('lusha.com')).toBe(true)
  })

  it('only: "email" — Hunter reste appelé normalement (rien ne change)', async () => {
    process.env['HUNTER_API_KEY'] = 'k'
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ data: { email: 'sofia.nardi@acme.com' } }),
    } as Response)

    const hit = await providers.enrich({
      firstName: 'Sofia',
      lastName: 'Nardi',
      domain: 'acme.com',
      only: 'email',
    })
    expect(hit).toEqual({ provider: 'hunter', email: 'sofia.nardi@acme.com' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  // Un fournisseur qui ne rend QUE la coordonnée écartée n'est pas une réponse
  // à la question posée : la cascade doit continuer vers le suivant plutôt que
  // de s'arrêter sur un résultat inutile.
  it('only: "phone" — Lusha ne rend qu’un email : ce n’est pas une réponse, la cascade continue vers Kaspr', async () => {
    process.env['LUSHA_API_KEY'] = 'k'
    process.env['KASPR_API_KEY'] = 'k'
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { emailAddresses: [{ email: 'sofia@acme.com' }], phoneNumbers: [] } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ profile: { phones: ['+33 6 12 34 56 78'], emails: [] } }),
      } as Response)

    const hit = await providers.enrich({
      firstName: 'Sofia',
      lastName: 'Nardi',
      organizationName: 'ACME',
      domain: 'acme.com',
      linkedinUrl: 'https://www.linkedin.com/in/sofia-nardi',
      only: 'phone',
    })
    expect(hit).toEqual({ provider: 'kaspr', phone: '+33 6 12 34 56 78' })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('EnrichmentProviders — les fournisseurs à contrat non vérifiable', () => {
  const OLD_ENV = { ...process.env }
  let providers: EnrichmentProviders

  beforeEach(() => {
    // `jest.spyOn(global, 'fetch')` rend l'espion DÉJÀ posé s'il existe, avec son
    // historique d'appels : sans restauration, un test de ce bloc verrait les
    // appels d'un bloc précédent et échouerait sans qu'aucun code soit en cause.
    jest.restoreAllMocks()
    process.env = { ...OLD_ENV }
    delete process.env['HUNTER_API_KEY']
    delete process.env['LUSHA_API_KEY']
    delete process.env['KASPR_API_KEY']
    delete process.env['FULLENRICH_API_KEY']
    providers = new EnrichmentProviders()
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  const query = {
    firstName: 'Marc',
    lastName: 'Dupuis',
    organizationName: 'ACME',
    domain: 'acme.fr',
    linkedinUrl: 'https://www.linkedin.com/in/marc-dupuis/',
  }

  it('sans clé, aucun appel réseau — la cascade est inchangée', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    expect(providers.isEnabled()).toBe(false)
    expect(await providers.enrich(query)).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('lit une réponse dont on ne connaît pas les clés', async () => {
    process.env['KASPR_API_KEY'] = 'k'
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { phones: [], emails: [{ email: 'marc@acme.fr' }] } }),
    } as never)

    const hit = await providers.enrich(query)

    expect(hit).toEqual({ provider: 'kaspr', email: 'marc@acme.fr' })
  })

  it('ne rend RIEN quand la réponse ne contient aucune coordonnée', async () => {
    // C'est le point de la décision : un contrat mal deviné donne « ça ne
    // trouve rien », jamais « ça débite pour une réponse mal lue ».
    process.env['FULLENRICH_API_KEY'] = 'k'
    // E1 — FullEnrich est asynchrone : sonde bornée, raccourcie pour le test.
    process.env['FULLENRICH_POLL_INTERVAL_MS'] = '1'
    process.env['FULLENRICH_POLL_TIMEOUT_MS'] = '5'
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ENRICHING', enrichment_id: 'abc-123' }),
    } as never)

    expect(await providers.enrich(query)).toBeNull()
  })

  it('n’accepte pas en écho ce qu’on a envoyé', async () => {
    process.env['KASPR_API_KEY'] = 'k'
    jest.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { id: 'marc-dupuis', name: 'Marc Dupuis', domain: 'acme.fr' } }),
    } as never)

    expect(await providers.enrich(query)).toBeNull()
  })

  it('un échec réseau ne lève pas — la cascade continue', async () => {
    process.env['KASPR_API_KEY'] = 'k'
    jest.spyOn(global, 'fetch' as never).mockRejectedValue(new Error('timeout') as never)
    expect(await providers.enrich(query)).toBeNull()
  })

  it('n’appelle pas sans nom complet ni ancre d’organisation', async () => {
    process.env['KASPR_API_KEY'] = 'k'
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    expect(await providers.enrich({ firstName: 'Marc' })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  // Contrat Kaspr VÉRIFIÉ le 08/10/2026 avec la clé réelle : POST
  // api.developers.kaspr.io/profile/linkedin, 200. L'ancienne route répondait 404.
  describe('Kaspr — /profile/linkedin', () => {
    const okPhone = {
      ok: true,
      status: 200,
      json: async () => ({ profile: { phones: ['+33 6 12 34 56 78'], emails: [] } }),
    }

    it.each([
      ['https://www.linkedin.com/in/marc-dupuis/', 'marc-dupuis'],
      ['https://www.linkedin.com/in/marc-dupuis?trk=public', 'marc-dupuis'],
      ['https://fr.linkedin.com/in/marc-dupuis/?locale=fr', 'marc-dupuis'],
      ['https://www.linkedin.com/in/jos%C3%A9-garc%C3%ADa', 'josé-garcía'],
    ])('extrait le slug de %s', async (linkedinUrl, slug) => {
      process.env['KASPR_API_KEY'] = 'k'
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue(okPhone as never)
      await providers.enrich({ ...query, linkedinUrl })
      const body = JSON.parse(((fetchSpy.mock.calls[0] as unknown[])[1] as { body: string }).body) as { id: string }
      expect(body.id).toBe(slug)
    })

    it('sans URL LinkedIn exploitable : aucun appel réseau', async () => {
      process.env['KASPR_API_KEY'] = 'k'
      const fetchSpy = jest.spyOn(global, 'fetch' as never)
      expect(await providers.enrich({ ...query, linkedinUrl: undefined })).toBeNull()
      expect(await providers.enrich({ ...query, linkedinUrl: 'https://www.linkedin.com/company/acme' })).toBeNull()
      expect(fetchSpy).not.toHaveBeenCalled()
      fetchSpy.mockRestore()
    })

    it('envoie la bonne URL, les bons en-têtes et le bon corps', async () => {
      process.env['KASPR_API_KEY'] = 'secret'
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue(okPhone as never)
      const hit = await providers.enrich(query)
      expect(hit).toEqual({ provider: 'kaspr', phone: '+33 6 12 34 56 78' })
      const [url, init] = fetchSpy.mock.calls[0] as unknown as [
        string,
        { method: string; headers: Record<string, string>; body: string },
      ]
      expect(url).toBe('https://api.developers.kaspr.io/profile/linkedin')
      expect(init.method).toBe('POST')
      expect(init.headers['Authorization']).toBe('Bearer secret')
      expect(init.headers['accept-version']).toBe('v2.0')
      expect(init.headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(init.body)).toEqual({ id: 'marc-dupuis', name: 'Marc Dupuis' })
    })

    it('KASPR_API_URL surcharge l’URL par défaut', async () => {
      process.env['KASPR_API_KEY'] = 'k'
      process.env['KASPR_API_URL'] = 'https://example.test/k'
      const fetchSpy = jest.spyOn(global, 'fetch' as never).mockResolvedValue(okPhone as never)
      await providers.enrich(query)
      expect((fetchSpy.mock.calls[0] as unknown[])[0]).toBe('https://example.test/k')
    })

    it('une réponse vide rend null', async () => {
      process.env['KASPR_API_KEY'] = 'k'
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ profile: { id: 'marc-dupuis', phones: [], emails: [] } }),
      } as never)
      expect(await providers.enrich(query)).toBeNull()
    })

    it('un 404 rend null', async () => {
      process.env['KASPR_API_KEY'] = 'k'
      jest.spyOn(global, 'fetch' as never).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Route not found' }),
      } as never)
      expect(await providers.enrich(query)).toBeNull()
    })
  })
})

/**
 * LOT (15/10) DATA-A point 8 — Hunter : la clé voyage en EN-TÊTE (jamais dans l'URL, donc jamais dans
 * un journal d'accès), et la vérification que Hunter calcule est LUE : une adresse qu'il dit invalide
 * n'est jamais rendue, une adresse « valid » est marquée vérifiée, le reste reste non vérifié.
 */
describe('EnrichmentProviders — Hunter, clé en en-tête et vérification lue (DATA-A 8)', () => {
  const OLD_ENV = { ...process.env }
  const hunterPayload = (verification?: { status: string }) => ({
    ok: true,
    json: async () => ({
      data: { email: 'sofia.nardi@acme.com', score: 92, ...(verification ? { verification } : {}) },
    }),
  })

  beforeEach(() => {
    jest.restoreAllMocks()
    for (const key of ['HUNTER_API_KEY', 'LUSHA_API_KEY', 'KASPR_API_KEY', 'FULLENRICH_API_KEY'])
      delete process.env[key]
    process.env['HUNTER_API_KEY'] = 'secret-key'
  })
  afterEach(() => {
    process.env = { ...OLD_ENV }
  })

  it('la clé part dans l’en-tête X-API-KEY, jamais dans l’URL', async () => {
    const spy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(hunterPayload() as Response)
    await new EnrichmentProviders().enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    const [url, init] = spy.mock.calls[0]!
    expect(String(url)).not.toContain('secret-key')
    expect(String(url)).not.toContain('api_key')
    expect((init as RequestInit).headers).toMatchObject({ 'X-API-KEY': 'secret-key' })
  })

  it('verification.status « valid » → adresse vérifiée', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(hunterPayload({ status: 'valid' }) as Response)
    const hit = await new EnrichmentProviders().enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    expect(hit).toEqual({ provider: 'hunter', email: 'sofia.nardi@acme.com', emailStatus: 'verified' })
  })

  it('verification.status « accept_all » → non vérifiée (jamais « vérifiée » par défaut)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(hunterPayload({ status: 'accept_all' }) as Response)
    const hit = await new EnrichmentProviders().enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    expect(hit?.emailStatus).toBe('unverified')
  })

  it('verification.status « invalid » → l’adresse n’est PAS rendue', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(hunterPayload({ status: 'invalid' }) as Response)
    expect(
      await new EnrichmentProviders().enrich({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' }),
    ).toBeNull()
  })
})
