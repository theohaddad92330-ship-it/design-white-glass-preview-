import type { CrmTaskInput } from '../crm/crm-task'
import { PipedriveClient } from './pipedrive.client'

/**
 * A besoin lands in Pipedrive as a **Deal** (API v2 /deals), best-effort linked
 * to the account's Organization, with the detail carried as a v1 Note. These
 * specs pin: the deal title/org link, NO invented stage, and that a note failure
 * never undoes the deal.
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

const client = new PipedriveClient({
  clientId: 'c',
  clientSecret: 's',
  redirectUri: 'https://x/cb',
  scopes: '',
  frontendUrl: 'https://app',
})
const DOMAIN = 'https://acme.pipedrive.com'
const input: CrmTaskInput = { subject: 'Besoin — TF1 : Régie', body: 'Détail du besoin', company: 'TF1' }

function bodyOf(spy: jest.Mock, matcher: (url: string) => boolean): Record<string, unknown> | null {
  const call = spy.mock.calls.find(([u, i]) => matcher(String(u)) && (i as Init | undefined)?.method === 'POST')
  return call ? (JSON.parse((call[1] as Init).body ?? '{}') as Record<string, unknown>) : null
}

describe('PipedriveClient.createDeal', () => {
  afterEach(() => jest.restoreAllMocks())

  it('crée un Deal (title) lié à l’Organization trouvée + une Note portant le détail', async () => {
    const spy = stubFetch((url, method) => {
      if (url.includes('/organizations/search')) return { body: { data: { items: [{ item: { id: 42 } }] } } }
      if (url.endsWith('/v2/deals') && method === 'POST') return { body: { data: { id: 7 } } }
      if (url.endsWith('/v1/notes') && method === 'POST') return { body: { data: { id: 100 } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createDeal('tok', DOMAIN, input)
    expect(result).toEqual({ id: '7' })

    const deal = bodyOf(spy, u => u.endsWith('/v2/deals'))
    expect(deal?.['title']).toBe('Besoin — TF1 : Régie')
    expect(deal?.['org_id']).toBe(42)
    // Jamais de stage/pipeline fabriqué → Pipedrive applique son défaut.
    expect(deal?.['stage_id']).toBeUndefined()
    expect(deal?.['pipeline_id']).toBeUndefined()
    // Le détail voyage en Note liée au deal.
    const note = bodyOf(spy, u => u.endsWith('/v1/notes'))
    expect(note?.['content']).toBe('Détail du besoin')
    expect(note?.['deal_id']).toBe(7)
  })

  it('un échec de la Note ne défait pas le Deal créé (best-effort)', async () => {
    stubFetch((url, method) => {
      if (url.includes('/organizations/search')) return { body: { data: { items: [] } } }
      if (url.endsWith('/organizations') && method === 'POST') return { body: { data: { id: 55 } } }
      if (url.endsWith('/v2/deals') && method === 'POST') return { body: { data: { id: 8 } } }
      if (url.endsWith('/v1/notes') && method === 'POST') return { status: 403, body: { error: 'no scope' } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    await expect(client.createDeal('tok', DOMAIN, input)).resolves.toEqual({ id: '8' })
  })

  it('un besoin sans compte crée un Deal sans org_id, sans recherche Organization', async () => {
    const spy = stubFetch((url, method) => {
      if (url.endsWith('/v2/deals') && method === 'POST') return { body: { data: { id: 9 } } }
      throw new Error(`unexpected ${method} ${url}`)
    })

    const result = await client.createDeal('tok', DOMAIN, { subject: 'Besoin : X', body: '' })
    expect(result).toEqual({ id: '9' })
    expect(bodyOf(spy, u => u.endsWith('/v2/deals'))?.['org_id']).toBeUndefined()
    expect(spy.mock.calls.some(([u]) => String(u).includes('/organizations'))).toBe(false)
  })
})

/**
 * Révocation server-side (`POST {OAUTH_BASE}/oauth/revoke`) — endpoint
 * officiel documenté par Pipedrive (pipedrive.readme.io « App Uninstallation »
 * — confirmé aussi par un ingénieur Pipedrive sur le forum développeur),
 * authentifié en HTTP Basic comme l'échange et le rafraîchissement. Envoyer le
 * refresh_token retire TOUTES les données OAuth côté Pipedrive et marque
 * l'app désinstallée.
 */
describe('PipedriveClient.revoke', () => {
  afterEach(() => jest.restoreAllMocks())

  it('POSTe le refresh_token en Basic Auth sur oauth.pipedrive.com/oauth/revoke', async () => {
    const spy = stubFetch(() => ({ body: {} }))

    await client.revoke('the-refresh-token')

    expect(spy).toHaveBeenCalledTimes(1)
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://oauth.pipedrive.com/oauth/revoke')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from('c:s').toString('base64')}`,
    )
    expect(String(init.body)).toContain('token=the-refresh-token')
    expect(String(init.body)).toContain('token_type_hint=refresh_token')
  })

  it('un refus (401 mauvais client_secret, etc.) est une vraie erreur — pas de succès silencieux', async () => {
    stubFetch(() => ({ status: 401, body: { error: 'invalid_client' } }))

    await expect(client.revoke('RT')).rejects.toThrow(/Pipedrive token revocation failed/)
  })
})
