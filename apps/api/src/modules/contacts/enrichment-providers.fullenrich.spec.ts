import { EnrichmentProviders, type EnrichmentReport } from './enrichment-providers'

/**
 * E1 (07/10/2026, #3698) — FullEnrich sur son contrat PUBLIC (docs.fullenrich.com,
 * vérifié le 07/10) : ASYNCHRONE.
 *   POST {base}/contact/enrich/bulk  → { enrichment_id }
 *   GET  {base}/contact/enrich/bulk/{id} → { status, data: [{ contact_info, profile }] }
 * Auth `Authorization: Bearer <clé>`. FullEnrich ne facture que sur un résultat
 * (1 crédit e-mail, 10 crédits mobile) : on ne demande QUE les coordonnées qui
 * manquent. Aucun appel réel ici — faux `fetch` seulement (solde de 50 crédits).
 */
describe('EnrichmentProviders — FullEnrich asynchrone (E1)', () => {
  const OLD_ENV = { ...process.env }
  let providers: EnrichmentProviders

  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = { ...OLD_ENV }
    delete process.env['HUNTER_API_KEY']
    delete process.env['LUSHA_API_KEY']
    delete process.env['KASPR_API_KEY']
    delete process.env['FULLENRICH_API_URL']
    process.env['FULLENRICH_API_KEY'] = 'k'
    process.env['FULLENRICH_POLL_INTERVAL_MS'] = '1'
    process.env['FULLENRICH_POLL_TIMEOUT_MS'] = '30'
    providers = new EnrichmentProviders()
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  const query = { firstName: 'Marc', lastName: 'Dupuis', organizationName: 'ACME', domain: 'acme.fr' }

  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body })

  const finished = (contactInfo: Record<string, unknown>, profile: Record<string, unknown> = {}) => ({
    id: 'enr-1',
    status: 'FINISHED',
    data: [{ contact_info: contactInfo, profile }],
  })

  it('POST le lot (Bearer, seulement les coordonnées manquantes) puis GET le résultat', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(reply(200, { id: 'enr-1', status: 'IN_PROGRESS' }) as never)
      .mockResolvedValueOnce(
        reply(
          200,
          finished(
            {
              most_probable_work_email: { email: 'marc.dupuis@acme.fr', status: 'DELIVERABLE' },
              most_probable_phone: { number: '+33 6 12 34 56 78', region: 'FR', line_type: 'MOBILE' },
            },
            { social_profiles: { professional_network: { url: 'https://www.linkedin.com/in/marc-dupuis' } } },
          ),
        ) as never,
      )
    const report: EnrichmentReport = { attempts: [] }

    const hit = await providers.enrich(query, report)

    expect(hit).toEqual({
      provider: 'fullenrich',
      email: 'marc.dupuis@acme.fr',
      phone: '+33 6 12 34 56 78',
      linkedinUrl: 'https://www.linkedin.com/in/marc-dupuis',
    })
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://app.fullenrich.com/api/v2/contact/enrich/bulk')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer k')
    const body = JSON.parse(init.body as string)
    expect(body.data[0]).toMatchObject({ first_name: 'Marc', last_name: 'Dupuis', domain: 'acme.fr' })
    expect(body.data[0].enrich_fields).toEqual(['contact.work_emails', 'contact.phones'])
    expect(fetchSpy.mock.calls[1]?.[0]).toBe('https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-1')
    expect(report.attempts).toEqual(
      expect.arrayContaining([
        { source: 'fullenrich', coordinate: 'email', outcome: 'found' },
        { source: 'fullenrich', coordinate: 'phone', outcome: 'found' },
      ]),
    )
  })

  it('ne demande PAS l’e-mail quand la fiche l’a déjà (10 crédits mobile, 1 crédit e-mail : rien de payé pour rien)', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(reply(200, finished({})) as never)
    await providers.enrich({ ...query, have: { email: true } })
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.data[0].enrich_fields).toEqual(['contact.phones'])
  })

  it('est appelé quand le téléphone est là mais que l’e-mail manque (ordre décidé par Louis)', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(reply(200, finished({})) as never)
    await providers.enrich({ ...query, have: { phone: true } })
    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body.data[0].enrich_fields).toEqual(['contact.work_emails'])
  })

  it('n’est PAS appelé quand rien ne manque', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch' as never)
    expect(await providers.enrich({ ...query, have: { phone: true, email: true } })).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('FINI sans rien : null, et « introuvable » nommé par coordonnée demandée', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(reply(200, finished({ most_probable_work_email: null, phones: [] })) as never)
    const report: EnrichmentReport = { attempts: [] }
    expect(await providers.enrich(query, report)).toBeNull()
    expect(report.attempts).toEqual([
      { source: 'fullenrich', coordinate: 'email', outcome: 'not_found' },
      { source: 'fullenrich', coordinate: 'phone', outcome: 'not_found' },
    ])
  })

  it('verrou « adresse devinée » : une adresse CATCH_ALL ou INVALID est refusée', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(
        reply(200, finished({ most_probable_work_email: { email: 'marc@acme.fr', status: 'CATCH_ALL' } })) as never,
      )
    const report: EnrichmentReport = { attempts: [] }
    expect(await providers.enrich({ ...query, have: { phone: true } }, report)).toBeNull()
    expect(report.attempts).toEqual([{ source: 'fullenrich', coordinate: 'email', outcome: 'not_found' }])
  })

  it('verrou « écho » : une valeur qu’on a envoyée n’est pas un résultat', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(
        reply(
          200,
          finished({}, { social_profiles: { professional_network: { url: 'https://www.linkedin.com/in/x' } } }),
        ) as never,
      )
    const hit = await providers.enrich({ ...query, linkedinUrl: 'https://www.linkedin.com/in/x' })
    expect(hit).toBeNull()
  })

  it('un timeout n’est pas un échec : « inconnu », et l’identifiant est rendu pour REPRENDRE sans repayer', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-9' }) as never)
      .mockResolvedValue(reply(200, { id: 'enr-9', status: 'IN_PROGRESS' }) as never)
    const report: EnrichmentReport = { attempts: [] }
    expect(await providers.enrich(query, report)).toBeNull()
    expect(report.asyncLookup).toEqual({ id: 'enr-9' })
    expect(report.attempts.every(attempt => attempt.outcome === 'unknown')).toBe(true)
  })

  it('reprend une recherche en cours par son identifiant — AUCUN nouveau POST', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, finished({ most_probable_phone: { number: '+33 6 99 88 77 66' } })) as never)
    const hit = await providers.enrich({ ...query, asyncLookupId: 'enr-9' })
    expect(hit).toEqual({ provider: 'fullenrich', phone: '+33 6 99 88 77 66' })
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://app.fullenrich.com/api/v2/contact/enrich/bulk/enr-9')
  })

  it('une clé refusée (401) est une ERREUR, pas un « introuvable »', async () => {
    jest.spyOn(global, 'fetch' as never).mockResolvedValueOnce(reply(401, { message: 'no' }) as never)
    const report: EnrichmentReport = { attempts: [] }
    expect(await providers.enrich(query, report)).toBeNull()
    expect(report.attempts.map(attempt => attempt.outcome)).toEqual(['error', 'error'])
  })

  it('crédits insuffisants chez FullEnrich : erreur, jamais « introuvable »', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(reply(200, { enrichment_id: 'enr-1' }) as never)
      .mockResolvedValueOnce(reply(200, { id: 'enr-1', status: 'CREDITS_INSUFFICIENT' }) as never)
    const report: EnrichmentReport = { attempts: [] }
    expect(await providers.enrich(query, report)).toBeNull()
    expect(report.attempts.map(attempt => attempt.outcome)).toEqual(['error', 'error'])
  })
})
