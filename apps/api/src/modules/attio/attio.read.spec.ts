import { AttioClient } from './attio.client'

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, init: Init) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const { status = 200, body = {} } = handler(String(input), init ?? {})
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const client = new AttioClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  scopes: '',
  frontendUrl: 'https://app',
} as never)
const record = (id: string, createdAt: string, values: Record<string, unknown>) => ({
  id: { object_id: 'o', record_id: id },
  created_at: createdAt,
  values,
})
const bodyOf = (spy: jest.Mock, n = 0): Record<string, unknown> =>
  JSON.parse(String((spy.mock.calls[n]?.[1] as Init).body))

// #4189 — lecture commune Attio : POST /v2/objects/{slug}/records/query (limit/offset).
// Les fiches Attio n'ont PAS de date de modification : le curseur est la CRÉATION.
describe('AttioClient — lecture (#4189)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('contacts : people/records/query, nom/e-mail/poste/téléphone, société non lue (référence seule)', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          record('p1', '2026-10-01T10:00:00.000000000Z', {
            name: [{ first_name: 'Ana', last_name: 'Roy', full_name: 'Ana Roy' }],
            email_addresses: [{ email_address: 'a@b.fr' }],
            job_title: [{ value: 'DSI' }],
            phone_numbers: [{ original_phone_number: '+33102030405' }],
            company: [{ target_object: 'companies', target_record_id: 'c1' }],
          }),
        ],
      },
    }))
    const page = await client.listContacts('tok', { limit: 50 })
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://api.attio.com/v2/objects/people/records/query')
    expect(bodyOf(spy)).toEqual({ limit: 50, offset: 0 })
    expect(page.contacts).toEqual([
      {
        id: 'p1',
        email: 'a@b.fr',
        firstName: 'Ana',
        lastName: 'Roy',
        company: null,
        jobTitle: 'DSI',
        phone: '+33102030405',
        modifiedAt: '2026-10-01T10:00:00.000Z',
      },
    ])
    expect(page.nextAfter).toBeNull()
  })

  it('une page pleine renvoie le décalage suivant comme curseur ; une page courte clôt la lecture', async () => {
    stubFetch(() => ({
      body: { data: [record('p1', '2026-10-01T10:00:00Z', {}), record('p2', '2026-10-02T10:00:00Z', {})] },
    }))
    expect((await client.listContacts('tok', { limit: 2 })).nextAfter).toBe('o:2')
    stubFetch(() => ({ body: { data: [record('p1', '2026-10-01T10:00:00Z', {})] } }))
    expect((await client.listContacts('tok', { limit: 2, after: 'o:2' })).nextAfter).toBeNull()
  })

  it('le curseur o:<n> devient le décalage de la requête', async () => {
    const spy = stubFetch(() => ({ body: { data: [] } }))
    await client.listCompanies('tok', { limit: 100, after: 'o:300' })
    expect(bodyOf(spy)).toEqual({ limit: 100, offset: 300 })
  })

  it('⚠️ « depuis » filtre sur la CRÉATION côté client (aucun tri/filtre non documenté envoyé) : les anciennes fiches sont écartées', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          record('c1', '2026-09-30T10:00:00Z', { name: [{ value: 'Ancienne' }] }),
          record('c2', '2026-10-02T10:00:00Z', { name: [{ value: 'Neuve' }], domains: [{ domain: 'neuve.fr' }] }),
        ],
      },
    }))
    const page = await client.listCompanies('tok', { limit: 50, since: '2026-10-01T00:00:00.000Z' })
    expect(bodyOf(spy)).toEqual({ limit: 50, offset: 0 })
    expect(page.companies).toEqual([
      { id: 'c2', name: 'Neuve', domain: 'neuve.fr', modifiedAt: '2026-10-02T10:00:00.000Z' },
    ])
  })

  it('affaires : objet « deals », étape et valeur telles que rendues, société = référence', async () => {
    const spy = stubFetch(() => ({
      body: {
        data: [
          record('d1', '2026-10-03T10:00:00Z', {
            name: [{ value: 'Régie' }],
            stage: [{ status: { title: 'Negotiation' } }],
            value: [{ currency_value: 90000 }],
            associated_company: [{ target_record_id: 'c1' }],
          }),
        ],
      },
    }))
    const page = await client.listDeals('tok', { limit: 50 })
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://api.attio.com/v2/objects/deals/records/query')
    expect(page.deals).toEqual([
      {
        id: 'd1',
        title: 'Régie',
        amount: 90000,
        currency: null,
        stage: 'Negotiation',
        status: null,
        closeDate: null,
        accountId: 'c1',
        accountName: null,
        modifiedAt: '2026-10-03T10:00:00.000Z',
      },
    ])
  })

  it('⚠️ un objet « deals » absent de l’espace est une ERREUR, jamais « aucune affaire »', async () => {
    stubFetch(() => ({ status: 404, body: { message: 'Object with slug/ID "deals" not found' } }))
    await expect(client.listDeals('tok', { limit: 5 })).rejects.toThrow(/not found/)
  })

  it('les activités ne sont pas lues : pas de méthode (tâches et notes demandent un droit non demandé)', () => {
    expect((client as unknown as Record<string, unknown>)['listActivities']).toBeUndefined()
  })
})
