import { GeocodingService } from './geocoding.service'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('GeocodingService.geocode', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  it('rend les coordonnées du PREMIER résultat de la BAN', async () => {
    const fetchMock = jest.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
      jsonResponse({ features: [{ geometry: { coordinates: [2.3522, 48.8566] } }] }),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    const service = new GeocodingService()

    const point = await service.geocode('Paris')

    expect(point).toEqual({ latitude: 48.8566, longitude: 2.3522 })
    // `limit=1`, sans clé — c'est l'interrupteur du dépôt : un fournisseur
    // public sans identifiant à passer.
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('api-adresse.data.gouv.fr')
    expect(url).toContain('limit=1')
    expect(url).not.toContain('key=')
  })

  it('rend `null` sur une ville sans résultat — jamais une coordonnée inventée', async () => {
    global.fetch = (async () => jsonResponse({ features: [] })) as unknown as typeof fetch
    const service = new GeocodingService()

    expect(await service.geocode('Nullepartville')).toBeNull()
  })

  it('rend `null` proprement quand le réseau est indisponible — n’explose jamais l’appelant', async () => {
    global.fetch = (async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch
    const service = new GeocodingService()

    await expect(service.geocode('Paris')).resolves.toBeNull()
  })

  it('rend `null` sur une réponse HTTP en échec (5xx, quota…)', async () => {
    global.fetch = (async () => jsonResponse({}, false, 503)) as unknown as typeof fetch
    const service = new GeocodingService()

    expect(await service.geocode('Paris')).toBeNull()
  })

  it('rend `null` sur une chaîne vide, sans appeler le réseau', async () => {
    const fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    const service = new GeocodingService()

    expect(await service.geocode('   ')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
