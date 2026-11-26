import { BoondManagerClient } from './boondmanager.client'

/**
 * #4695.3 — les en-têtes d'authentification, PROUVÉS (le trou : aucun test ne les lisait).
 *
 * OAuth2 → `Authorization: Bearer`, jeton utilisateur → Basic, JWT d'application → deux en-têtes `X-Jwt-*`. Et un
 * jeton n'apparaît dans AUCUN journal, y compris sur un appel en échec. Réseau simulé : un test d'unité ne part pas.
 */
describe('BoondManagerClient — en-têtes d’authentification (#4695.3)', () => {
  const fetchMock = jest.fn()
  const realFetch = global.fetch
  const SECRET = 'sekret-tok-0123456789'

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterAll(() => {
    global.fetch = realFetch
  })

  const respond = (status: number, body: string): Response =>
    ({
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(),
      text: () => Promise.resolve(body),
    }) as unknown as Response

  async function sentHeaders(
    config: ConstructorParameters<typeof BoondManagerClient>[0],
  ): Promise<Record<string, string>> {
    fetchMock.mockResolvedValue(respond(200, '{"data":[]}'))
    await new BoondManagerClient(config).listRecords('/companies', 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    return init.headers as Record<string, string>
  }

  const base = { baseUrl: 'https://erp.test/api', searchParam: 'keywords' }

  it('OAuth2 : Authorization Bearer, sans en-tête X-Jwt', async () => {
    const headers = await sentHeaders({ ...base, accessToken: SECRET })
    expect(headers['Authorization']).toBe(`Bearer ${SECRET}`)
    expect(headers['X-Jwt-Client-Boondmanager']).toBeUndefined()
    expect(headers['Accept-Encoding']).toBe('gzip')
  })

  it('jeton utilisateur : HTTP Basic « jeton: » en base64', async () => {
    const headers = await sentHeaders({ ...base, userToken: SECRET })
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from(`${SECRET}:`).toString('base64')}`)
  })

  it('JWT d’application : les deux en-têtes X-Jwt, pas d’Authorization', async () => {
    const headers = await sentHeaders({ ...base, clientToken: 'client-jwt', clientKey: 'app-jwt' })
    expect(headers['X-Jwt-Client-Boondmanager']).toBe('client-jwt')
    expect(headers['X-Jwt-App-Boondmanager']).toBe('app-jwt')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('aucun identifiant : aucun en-tête d’authentification', async () => {
    const headers = await sentHeaders(base)
    expect(headers['Authorization']).toBeUndefined()
    expect(headers['X-Jwt-App-Boondmanager']).toBeUndefined()
  })

  it('aucun jeton dans un journal, même sur un échec', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(m =>
      jest.spyOn(console, m).mockImplementation(),
    )
    fetchMock.mockResolvedValue(respond(500, 'boom'))
    await new BoondManagerClient({ ...base, accessToken: SECRET }).listRecords('/companies', 1)
    const logged = spies.flatMap(spy => spy.mock.calls.flat().map(String)).join('\n')
    spies.forEach(spy => spy.mockRestore())
    expect(logged).not.toContain(SECRET)
  })
})
