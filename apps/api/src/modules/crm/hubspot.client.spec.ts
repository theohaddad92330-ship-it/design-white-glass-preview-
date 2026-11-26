import { HubspotClient } from './hubspot.client'
import type { CrmTaskInput } from './crm-task'

/**
 * A besoin lands in HubSpot as a **Deal** (not a task). These specs pin the two
 * things that matter: the deal carries the besoin label/detail with NO invented
 * pipeline/stage, and it is associated to the account's Company on a best-effort
 * basis (found → linked; unknown or lookup error → deal stands, company-less).
 */

type Init = { method?: string; body?: string }
function stubFetch(handler: (url: string, method: string) => { status?: number; body?: unknown }): jest.Mock {
  return jest.spyOn(global, 'fetch' as never).mockImplementation((async (input: string | URL, init?: Init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const { status = 200, body = {} } = handler(url, method)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }) as never) as unknown as jest.Mock
}

const client = new HubspotClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  scopes: 'x',
  frontendUrl: 'https://app',
})
const input: CrmTaskInput = { subject: 'Besoin — TF1 : Régie', body: 'Détail du besoin', company: 'TF1' }

/** Read the JSON body of the POST to the deals collection endpoint. */
function dealBody(spy: jest.Mock): Record<string, unknown> {
  const call = spy.mock.calls.find(
    ([u, i]) => String(u).endsWith('/objects/deals') && (i as Init | undefined)?.method === 'POST',
  )
  return call ? (JSON.parse((call[1] as Init).body ?? '{}') as Record<string, unknown>) : {}
}

describe('HubspotClient.createDeal', () => {
  afterEach(() => jest.restoreAllMocks())

  it('crée un Deal (dealname + description) SANS pipeline/stage inventé, associé à la Company trouvée', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/companies/search') && method === 'POST')
        return { body: { total: 1, results: [{ id: 'comp-9' }] } }
      if (url.endsWith('/objects/deals') && method === 'POST') return { body: { id: 'deal-1' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createDeal('tok', input)
    expect(result).toEqual({ id: 'deal-1' })

    const body = dealBody(spy)
    const properties = body['properties'] as Record<string, unknown>
    expect(properties['dealname']).toBe('Besoin — TF1 : Régie')
    expect(properties['description']).toBe('Détail du besoin')
    // Jamais de stage/pipeline fabriqué → HubSpot applique son défaut.
    expect(properties['dealstage']).toBeUndefined()
    expect(properties['pipeline']).toBeUndefined()
    // Association best-effort à la Company trouvée.
    const assoc = body['associations'] as Array<{ to?: { id?: string } }>
    expect(assoc?.[0]?.to?.id).toBe('comp-9')
  })

  it('crée le Deal SANS association quand la Company est introuvable', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/companies/search') && method === 'POST') return { body: { total: 0, results: [] } }
      if (url.endsWith('/objects/deals') && method === 'POST') return { body: { id: 'deal-2' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createDeal('tok', input)
    expect(result).toEqual({ id: 'deal-2' })
    expect(dealBody(spy)['associations']).toBeUndefined()
  })

  it('un échec de recherche Company n’empêche pas la création du Deal (best-effort)', async () => {
    stubFetch((url, method) => {
      if (url.endsWith('/companies/search') && method === 'POST') return { status: 403, body: { message: 'no scope' } }
      if (url.endsWith('/objects/deals') && method === 'POST') return { body: { id: 'deal-3' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(client.createDeal('tok', input)).resolves.toEqual({ id: 'deal-3' })
  })

  it('un besoin sans compte crée un Deal simple, sans recherche Company', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/objects/deals') && method === 'POST') return { body: { id: 'deal-4' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createDeal('tok', { subject: 'Besoin : X', body: 'y' })
    expect(result).toEqual({ id: 'deal-4' })
    const searched = spy.mock.calls.some(([u]) => String(u).endsWith('/companies/search'))
    expect(searched).toBe(false)
  })
})

describe('HubspotClient.listContacts — la borne du fournisseur', () => {
  afterEach(() => jest.restoreAllMocks())

  /** Le paramètre `limit` réellement envoyé à HubSpot. */
  function sentLimit(spy: jest.Mock): string | null {
    const call = spy.mock.calls.find(([u]) => String(u).includes('/objects/contacts?'))
    return call ? new URL(String(call[0])).searchParams.get('limit') : null
  }

  it('ne demande JAMAIS plus de 100 objets — au-delà HubSpot refuse l’appel entier', async () => {
    // Défaut réel de production : la reprise demandait 200 et HubSpot répondait
    // « You can only request at most 100 objects in one request ». L'import ne
    // pouvait aboutir sur aucun portail, quel que soit son nombre de contacts.
    const spy = stubFetch(() => ({ body: { results: [], paging: {} } }))
    await client.listContacts('tok', { limit: 200 })
    expect(sentLimit(spy)).toBe('100')
  })

  it('respecte une demande plus petite', async () => {
    const spy = stubFetch(() => ({ body: { results: [], paging: {} } }))
    await client.listContacts('tok', { limit: 25 })
    expect(sentLimit(spy)).toBe('25')
  })

  it('ne descend pas sous 1 — `limit=0` ferait rendre une page vide qui se lit « CRM vide »', async () => {
    const spy = stubFetch(() => ({ body: { results: [], paging: {} } }))
    await client.listContacts('tok', { limit: 0 })
    expect(sentLimit(spy)).toBe('1')
  })
})

// #2388.24 — même borne fournisseur que les contacts, côté sociétés.
describe('HubspotClient.listCompanies — la borne du fournisseur', () => {
  afterEach(() => jest.restoreAllMocks())

  function sentLimit(spy: jest.Mock): string | null {
    const call = spy.mock.calls.find(([u]) => String(u).includes('/objects/companies?'))
    return call ? new URL(String(call[0])).searchParams.get('limit') : null
  }

  it('ne demande JAMAIS plus de 100 objets — même limite fournisseur que les contacts', async () => {
    const spy = stubFetch(() => ({ body: { results: [], paging: {} } }))
    await client.listCompanies('tok', { limit: 200 })
    expect(sentLimit(spy)).toBe('100')
  })

  it('rend les sociétés de la page, et le curseur suivant quand il existe', async () => {
    stubFetch(() => ({
      body: {
        results: [
          { id: 'co-1', properties: { name: 'TF1' } },
          { id: 'co-2', properties: { name: '' } },
        ],
        paging: { next: { after: 'cursor-2' } },
      },
    }))
    const page = await client.listCompanies('tok', { limit: 100 })
    expect(page).toEqual({
      companies: [
        { id: 'co-1', name: 'TF1' },
        { id: 'co-2', name: null },
      ],
      nextAfter: 'cursor-2',
    })
  })

  it('rend `nextAfter: null` quand il n’y a plus de page', async () => {
    stubFetch(() => ({ body: { results: [], paging: {} } }))
    const page = await client.listCompanies('tok', { limit: 100 })
    expect(page.nextAfter).toBeNull()
  })
})

// #2261.13 (19/09) — l'horodatage SOURCE que la mesure de latence réclame.
describe('HubspotClient.findContactByEmail — l’horodatage source (#2261.13)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('rend l’id ET `lastmodifieddate` converti en ISO', async () => {
    stubFetch(() => ({
      body: {
        results: [{ id: '501', properties: { email: 'a@b.fr', lastmodifieddate: '2026-09-19T08:00:00Z' } }],
      },
    }))
    const found = await client.findContactByEmail('tok', 'a@b.fr')
    expect(found).toEqual({ id: '501', lastModifiedAt: '2026-09-19T08:00:00.000Z' })
  })

  it('aucun contact trouvé : `null`, jamais un id deviné', async () => {
    stubFetch(() => ({ body: { results: [] } }))
    await expect(client.findContactByEmail('tok', 'inconnu@b.fr')).resolves.toBeNull()
  })

  it('`lastmodifieddate` absent ou illisible : l’id reste, l’horodatage source vaut `null` — jamais deviné', async () => {
    stubFetch(() => ({ body: { results: [{ id: '501', properties: { email: 'a@b.fr' } }] } }))
    const found = await client.findContactByEmail('tok', 'a@b.fr')
    expect(found).toEqual({ id: '501', lastModifiedAt: null })
  })

  it('une recherche en échec lève — jamais un contact inventé', async () => {
    stubFetch(() => ({ status: 500, body: { message: 'hubspot down' } }))
    await expect(client.findContactByEmail('tok', 'a@b.fr')).rejects.toThrow(/HubSpot contact search failed/)
  })
})

// SYNC-C — la lecture « depuis » par l'API search, et le quota dit 429.
describe('HubspotClient.searchModifiedSince', () => {
  afterEach(() => jest.restoreAllMocks())

  it('filtre sur hs_lastmodifieddate APRÈS la date, trié croissant, et rend la date de modification', async () => {
    const spy = stubFetch(() => ({
      body: {
        results: [{ id: 'c-1', properties: { email: 'a@b.fr', hs_lastmodifieddate: '2026-10-19T10:00:00.000Z' } }],
        paging: { next: { after: '100' } },
      },
    }))
    const page = await client.searchModifiedSince('tok', 'contacts', { since: '2026-10-19T09:00:00.000Z', limit: 500 })
    const body = JSON.parse(String(spy.mock.calls[0][1].body))
    expect(String(spy.mock.calls[0][0])).toContain('/contacts/search')
    expect(body.filterGroups[0].filters[0]).toEqual({
      propertyName: 'hs_lastmodifieddate',
      operator: 'GT',
      value: String(Date.parse('2026-10-19T09:00:00.000Z')),
    })
    expect(body.sorts[0]).toEqual({ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' })
    expect(body.limit).toBe(100)
    expect(page.contacts[0]?.modifiedAt).toBe('2026-10-19T10:00:00.000Z')
    expect(page.nextAfter).toBe('100')
  })

  it('lit les sociétés par l’endpoint companies', async () => {
    const spy = stubFetch(() => ({ body: { results: [{ id: 'co-1', properties: { name: 'TF1' } }] } }))
    const page = await client.searchModifiedSince('tok', 'companies', { since: '2026-10-19T09:00:00.000Z', limit: 10 })
    expect(String(spy.mock.calls[0][0])).toContain('/companies/search')
    expect(page.companies).toEqual([{ id: 'co-1', name: 'TF1' }])
    expect(page.nextAfter).toBeNull()
  })

  it('refuse une date illisible plutôt que de relire tout le portail', async () => {
    await expect(client.searchModifiedSince('tok', 'contacts', { since: 'hier', limit: 10 })).rejects.toThrow(
      /illisible/,
    )
  })

  it('nomme le quota dépassé « 429 » pour que la synchro recule', async () => {
    stubFetch(() => ({ status: 429, body: { message: 'ten_secondly_rolling limit' } }))
    await expect(
      client.searchModifiedSince('tok', 'contacts', { since: '2026-10-19T09:00:00Z', limit: 10 }),
    ).rejects.toThrow(/429/)
  })
})
