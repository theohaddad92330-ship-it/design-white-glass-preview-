import { MemoryPersonCacheStore, setPersonContactCacheStore } from './person-contact-cache'
import type { ConfigService } from '@nestjs/config'
import { DropcontactClient } from './dropcontact.client'

/** Minimal ConfigService stub returning `dropcontactApiKey` only. */
function configWith(apiKey: string | undefined): ConfigService {
  return { get: (key: string) => (key === 'dropcontactApiKey' ? apiKey : undefined) } as unknown as ConfigService
}

/** Build a fetch Response-like object with a JSON body. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response
}

// Fast, deterministic client: zero-delay polling, few attempts.
function makeClient(apiKey = 'dc-test-key'): DropcontactClient {
  return new DropcontactClient(configWith(apiKey), {
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    requestTimeoutMs: 1_000,
  })
}

// A client with NO key configured (env-gated off).
function makeKeylessClient(): DropcontactClient {
  return new DropcontactClient(configWith(undefined), {
    pollIntervalMs: 0,
    maxPollAttempts: 3,
    requestTimeoutMs: 1_000,
  })
}

describe('DropcontactClient', () => {
  const realFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = realFetch
    jest.clearAllMocks()
  })

  describe('env gating (no-op without a key)', () => {
    it('isEnabled() is false and enrich() issues ZERO network calls without a key', async () => {
      const client = makeKeylessClient()
      expect(client.isEnabled()).toBe(false)
      const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
      expect(result).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('isEnabled() is true when a key is present', () => {
      expect(makeClient().isEnabled()).toBe(true)
    })
  })

  it('returns null (no network) when neither a name+org nor a linkedin match key is present', async () => {
    const client = makeClient()
    const result = await client.enrich({ firstName: 'Jean' }) // no org, no linkedin
    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the batch then polls the result and maps a match onto the enrichment shape', async () => {
    const client = makeClient()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: false, request_id: 'req-1', success: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          error: false,
          data: [
            {
              first_name: 'Jean',
              last_name: 'Dupont',
              email: [{ email: 'jean@acme.fr', qualification: 'nominative@pro' }],
              phone: '+33123456789',
              job: 'DSI',
              company: 'Acme',
              linkedin: 'linkedin.com/in/jeandupont',
            },
          ],
        }),
      )

    const result = await client.enrich({ firstName: 'Jean', lastName: 'Dupont', organizationName: 'Acme' })

    expect(result).toEqual({
      matched: true,
      email: 'jean@acme.fr',
      email_status: 'unverified',
      phone: '+33123456789',
      linkedin_url: 'https://linkedin.com/in/jeandupont',
      title: 'DSI',
      organization_name: 'Acme',
      city: null,
      country: null,
    })

    // 1 POST + 1 GET.
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [postUrl, postInit] = fetchMock.mock.calls[0]
    expect(postUrl).toBe('https://api.dropcontact.com/v1/enrich/all')
    expect(postInit.method).toBe('POST')
    expect(postInit.headers['X-Access-Token']).toBe('dc-test-key')
    const [getUrl, getInit] = fetchMock.mock.calls[1]
    expect(getUrl).toBe('https://api.dropcontact.com/v1/enrich/all/req-1')
    expect(getInit.method).toBe('GET')
  })

  it('keeps polling while the result is "not ready yet", then returns it', async () => {
    const client = makeClient()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'req-2', success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: false, reason: 'Request not ready yet, try again in 30 seconds' }))
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: [{ email: [{ email: 'a@b.com', qualification: 'nominative@pro' }] }] }),
      )

    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result?.matched).toBe(true)
    expect(result?.email).toBe('a@b.com')
    expect(fetchMock).toHaveBeenCalledTimes(3) // POST + 2 GET
  })

  it('returns matched:false when the result carries no reachable data (never invents)', async () => {
    const client = makeClient()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'req-3', success: true }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [{ first_name: 'Jean', email: [] }] }))

    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result).toEqual({
      matched: false,
      email: null,
      email_status: null,
      phone: null,
      linkedin_url: null,
      title: null,
      organization_name: null,
      city: null,
      country: null,
    })
  })

  it('returns null and stops when the POST is not ok', async () => {
    const client = makeClient()
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: true }, { ok: false, status: 401 }))
    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1) // no polling after a failed submit
  })

  it('returns null when the POST body has no request_id', async () => {
    const client = makeClient()
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false, reason: 'Bad request' }))
    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up (null) after the bounded poll budget without ever going unbounded', async () => {
    const client = makeClient() // maxPollAttempts: 3
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: 'req-4', success: true }))
    fetchMock.mockResolvedValue(jsonResponse({ success: false, reason: 'not ready' }))
    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result).toBeNull()
    // 1 POST + exactly maxPollAttempts (3) GETs — bounded.
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('returns null (swallows) when fetch itself throws', async () => {
    const client = makeClient()
    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const result = await client.enrich({ firstName: 'Jean', organizationName: 'Acme' })
    expect(result).toBeNull()
  })
})

describe('DropcontactClient — cache 30 j par personne, commun à tous les espaces (CACHE-API 15/10)', () => {
  const realFetch = global.fetch
  let fetchMock: jest.Mock
  const found = { success: true, data: [{ email: [{ email: 'jean@acme.fr' }], job: 'DSI', company: 'Acme' }] }
  const person = { firstName: 'Jean', lastName: 'Dupont', organizationName: 'Acme' }

  beforeEach(() => {
    setPersonContactCacheStore(new MemoryPersonCacheStore())
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterEach(() => {
    global.fetch = realFetch
    setPersonContactCacheStore(null)
  })

  it('deux appels identiques → UN seul cycle réseau (submit + poll)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: 'r1' })).mockResolvedValueOnce(jsonResponse(found))
    const client = makeClient()
    const first = await client.enrich({ ...person, workspaceId: 'ws-1' })
    const second = await client.enrich({ ...person, workspaceId: 'ws-1' })
    expect(first?.email).toBe('jean@acme.fr')
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('COMMUN (Louis 15/10) : un autre espace est servi sans nouvel appel', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ request_id: 'r1' })).mockResolvedValueOnce(jsonResponse(found))
    const client = makeClient()
    await client.enrich({ ...person, workspaceId: 'ws-1' })
    await client.enrich({ ...person, workspaceId: 'ws-2' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('une panne (HTTP 500) n’est JAMAIS écrite', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }))
    const client = makeClient()
    expect(await client.enrich({ ...person, workspaceId: 'ws-1' })).toBeNull()
    const callsAfterFirst = fetchMock.mock.calls.length
    expect(await client.enrich({ ...person, workspaceId: 'ws-1' })).toBeNull()
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst * 2)
  })

  it('« rien trouvé » est gardé (TTL court) et resservi comme non-correspondance', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ request_id: 'r1' }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [{}] }))
    const client = makeClient()
    const first = await client.enrich({ ...person, workspaceId: 'ws-1' })
    const second = await client.enrich({ ...person, workspaceId: 'ws-1' })
    expect(first?.matched).toBe(false)
    expect(second?.matched).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // LOT (15/10) DATA-A point 8 — la `qualification` que Dropcontact calcule est LUE : une adresse générique
  // (contact@) n'est pas LA personne, une adresse personnelle n'est pas une coordonnée pro.
  describe('qualification (DATA-A 8)', () => {
    const run = async (emails: unknown) => {
      const client = makeClient()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ error: false, request_id: 'req-q', success: true }))
        .mockResolvedValueOnce(jsonResponse({ success: true, data: [{ email: emails, company: 'Acme' }] }))
      return client.enrich({ firstName: 'Jean', lastName: 'Dupont', organizationName: 'Acme' })
    }

    it('saute l’adresse générique et prend la nominative pro suivante', async () => {
      const result = await run([
        { email: 'contact@acme.fr', qualification: 'generic@pro' },
        { email: 'jean.dupont@acme.fr', qualification: 'nominative@pro' },
      ])
      expect(result?.email).toBe('jean.dupont@acme.fr')
    })

    it('ne rend jamais une adresse personnelle comme coordonnée pro', async () => {
      const result = await run([{ email: 'jean@gmail.com', qualification: 'nominative@perso' }])
      expect(result?.email).toBeNull()
      expect(result?.matched).toBe(false)
    })

    it('une adresse sans qualification reste acceptée (comportement d’avant)', async () => {
      const result = await run([{ email: 'jean@acme.fr' }])
      expect(result?.email).toBe('jean@acme.fr')
    })
  })
})
