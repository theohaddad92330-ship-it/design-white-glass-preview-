import { SalesforceClient } from './salesforce.client'

describe('SalesforceClient — instance_url validation', () => {
  const client = new SalesforceClient({} as never)
  const input = { email: 'jean@acme.co', company: 'Acme' } as never

  // Le réseau est SIMULÉ, jamais laissé partir.
  //
  // La version précédente s'appuyait sur « avec aucun réseau, fetch échoue » :
  // elle n'était donc verte que sur une machine hors ligne. Branchée, la requête
  // vers `myorg.lightning.force.com` partait pour de vrai et pendait jusqu'au
  // délai de 5 s de Jest — un test rouge qui ne dit rien du code. Un test
  // d'unité ne doit dépendre ni d'un DNS ni de l'absence de réseau.
  const fetchMock = jest.fn()
  const realFetch = global.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockRejectedValue(new Error('réseau désactivé dans les tests'))
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = realFetch
  })

  it.each([
    'http://myorg.my.salesforce.com', // not https
    'https://evil.com', // wrong host
    'https://myorg.my.salesforce.com.evil.com', // suffix trick
    'https://169.254.169.254', // internal IP
    'not-a-url',
  ])('rejects a non-Salesforce/https instance_url before any request: %s', async url => {
    await expect(client.createContact('tok', url, input)).rejects.toThrow()
    await expect(client.updateContact('tok', url, 'id1', input)).rejects.toThrow()
    await expect(client.findContactIdByEmail('tok', url, 'jean@acme.co')).rejects.toThrow()
    // « before any request » : c'est la moitié qui compte. Une URL refusée dont
    // la requête serait quand même partie annulerait tout l'intérêt du garde.
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['https://myorg.my.salesforce.com', 'https://myorg.lightning.force.com'])(
    'accepts a Salesforce-owned https host: %s (validation passes, the request targets that host)',
    async url => {
      await expect(client.findContactIdByEmail('tok', url, 'jean@acme.co')).rejects.not.toThrow(/instance_url/)
      // L'hôte accepté doit être celui qu'on appelle : un garde qui laisse
      // passer puis appelle ailleurs serait pire que pas de garde.
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(new RegExp(`^${url}/services/data/`))
    },
  )
})

/**
 * Révocation server-side (`{loginUrl}/services/oauth2/revoke`) — endpoint
 * documenté par Salesforce (developer.salesforce.com/blogs, la famille de
 * `/services/oauth2/token` déjà utilisée par exchangeCode/refresh ci-dessus).
 * Envoyer le refresh_token révoque toute la concession, jetons d'accès
 * compris.
 */
describe('SalesforceClient.revoke', () => {
  const revokeClient = new SalesforceClient({
    clientId: 'cid',
    clientSecret: 'csecret',
    redirectUri: 'https://x/cb',
    scopes: 'api refresh_token',
    loginUrl: 'https://login.salesforce.com',
    frontendUrl: 'https://app',
  })

  afterEach(() => jest.restoreAllMocks())

  it('POSTe le refresh_token en form-urlencoded sur services/oauth2/revoke', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as never)

    await revokeClient.revoke('the-refresh-token')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://login.salesforce.com/services/oauth2/revoke')
    expect(init.method).toBe('POST')
    expect(String(init.body)).toBe('token=the-refresh-token')
  })

  it('un 400 (jeton déjà invalide) est traité comme un succès — le résultat voulu est acquis', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_token' }) } as never)

    await expect(revokeClient.revoke('already-gone')).resolves.toBeUndefined()
  })

  it('un refus applicatif (5xx) est une vraie erreur — pas de succès silencieux', async () => {
    jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({ message: 'org down' }) } as never)

    await expect(revokeClient.revoke('RT')).rejects.toThrow(/Salesforce token revocation failed/)
  })
})
