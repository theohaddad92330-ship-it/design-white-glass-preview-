import { mergeCounts, PlausibleChatbotClient, toCounts, toVisitors } from './plausible-chatbot.client'

/** Build a fetch Response-like object with a JSON body. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response
}

describe('toCounts', () => {
  it('lit `events` (occurrences), jamais `visitors` (uniques)', () => {
    const rows = [
      { name: 'chat_opened', visitors: 10, events: 12 },
      { name: 'chat_first_reply', visitors: 8, events: 8 },
    ]
    expect(toCounts(rows, 'name')).toEqual({ chat_opened: 12, chat_first_reply: 8 })
  })

  it('rend null sans lignes — la source n’a pas répondu', () => {
    expect(toCounts(null, 'name')).toBeNull()
  })

  it('ignore une ligne dont la clé demandée est absente ou non numérique', () => {
    const rows = [{ name: 'chat_opened', events: 5 }, { visitors: 3 }, { name: 'x', events: 'oups' }]
    expect(toCounts(rows as never, 'name')).toEqual({ chat_opened: 5 })
  })
})

describe('toVisitors', () => {
  it('lit `visitors` (uniques), jamais `events` — ce n’est pas la même grandeur', () => {
    const rows = [
      { name: 'chat_opened', visitors: 10, events: 12 },
      { name: 'chat_first_reply', visitors: 8, events: 8 },
    ]
    expect(toVisitors(rows, 'name')).toEqual({ chat_opened: 10, chat_first_reply: 8 })
    // Le contraste est le test : sur la MÊME ligne, les deux extracteurs
    // rendent deux nombres différents. Confondre les deux publierait un taux
    // sur douze « personnes » là où il y en a dix.
    expect(toCounts(rows, 'name')).toEqual({ chat_opened: 12, chat_first_reply: 8 })
  })

  it('rend null sans lignes — la source n’a pas répondu', () => {
    expect(toVisitors(null, 'name')).toBeNull()
  })
})

describe('mergeCounts', () => {
  it('additionne les deux tables — deux façons d’ouvrir comptent comme UNE exposition', () => {
    expect(mergeCounts({ warm: 10, concrete: 5 }, { warm: 2, concrete: 1 })).toEqual({ warm: 12, concrete: 6 })
  })

  it('rend null seulement si les DEUX sources ont échoué', () => {
    expect(mergeCounts(null, null)).toBeNull()
    expect(mergeCounts({ warm: 1 }, null)).toEqual({ warm: 1 })
    expect(mergeCounts(null, { warm: 1 })).toEqual({ warm: 1 })
  })
})

describe('PlausibleChatbotClient', () => {
  const realFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    delete process.env.PLAUSIBLE_API_KEY
    delete process.env.PLAUSIBLE_SITE_ID
    delete process.env.PLAUSIBLE_API_URL
  })

  afterEach(() => {
    global.fetch = realFetch
    jest.clearAllMocks()
    delete process.env.PLAUSIBLE_API_KEY
    delete process.env.PLAUSIBLE_SITE_ID
    delete process.env.PLAUSIBLE_API_URL
  })

  describe('sans clé ou sans site — no-op strict', () => {
    it('isEnabled() est faux et aucune requête ne part sans PLAUSIBLE_API_KEY', async () => {
      process.env.PLAUSIBLE_SITE_ID = 'bellum-ai.com'
      const client = new PlausibleChatbotClient()
      expect(client.isEnabled()).toBe(false)
      expect(await client.eventMeasurement('30d')).toEqual({ sourceAvailable: false, events: {}, visitors: {} })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('isEnabled() est faux et aucune requête ne part sans PLAUSIBLE_SITE_ID', async () => {
      process.env.PLAUSIBLE_API_KEY = 'key'
      const client = new PlausibleChatbotClient()
      expect(client.isEnabled()).toBe(false)
      expect(await client.eventMeasurement('30d')).toEqual({ sourceAvailable: false, events: {}, visitors: {} })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('siteVisitors() est un no-op strict sans configuration — `null`, jamais 0', async () => {
      const client = new PlausibleChatbotClient()
      expect(await client.siteVisitors('30d')).toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('experimentInput() est aussi un no-op strict sans configuration', async () => {
      const client = new PlausibleChatbotClient()
      expect(await client.experimentInput('open_timing', '30d')).toEqual({
        sourceAvailable: false,
        exposures: {},
        successes: {},
      })
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('isEnabled() est vrai quand les deux sont présentes', () => {
      process.env.PLAUSIBLE_API_KEY = 'key'
      process.env.PLAUSIBLE_SITE_ID = 'bellum-ai.com'
      expect(new PlausibleChatbotClient().isEnabled()).toBe(true)
    })
  })

  describe('avec une configuration valide', () => {
    function configuredClient(): PlausibleChatbotClient {
      process.env.PLAUSIBLE_API_KEY = 'key'
      process.env.PLAUSIBLE_SITE_ID = 'bellum-ai.com'
      return new PlausibleChatbotClient()
    }

    it('eventMeasurement() interroge `event:name` UNE seule fois et porte le Bearer', async () => {
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ results: [{ name: 'chat_widget_viewed', events: 100, visitors: 90 }] }),
      )

      const result = await client.eventMeasurement('30d')

      // Les DEUX grandeurs viennent de la MÊME réponse : c'est ce qui garantit
      // qu'un taux et son dénominateur portent sur le même instant.
      expect(result).toEqual({
        sourceAvailable: true,
        events: { chat_widget_viewed: 100 },
        visitors: { chat_widget_viewed: 90 },
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toContain('/api/v1/stats/breakdown')
      expect(url).toContain('property=event%3Aname')
      expect(url).toContain('site_id=bellum-ai.com')
      expect(init.headers.Authorization).toBe('Bearer key')
    })

    it('siteVisitors() lit l’AGRÉGAT du site, pas un événement du widget', async () => {
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: { visitors: { value: 4210 } } }))

      expect(await client.siteVisitors('30d')).toBe(4210)
      const [url] = fetchMock.mock.calls[0]
      expect(url).toContain('/api/v1/stats/aggregate')
      expect(url).toContain('metrics=visitors')
      // ⚠️ Aucune dimension : `property=` sur un agrégat ferait une AUTRE
      // question. L'entrée du tunnel est le site entier, pas une page.
      expect(url).not.toContain('property=')
    })

    it('siteVisitors() rend `null` — jamais 0 — quand la source ne répond pas', async () => {
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }))
      expect(await client.siteVisitors('30d')).toBeNull()
    })

    it('siteVisitors() rend `null` sur un corps illisible plutôt qu’un chiffre deviné', async () => {
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: { visitors: { value: 'beaucoup' } } }))
      expect(await client.siteVisitors('30d')).toBeNull()
    })

    it('respecte PLAUSIBLE_API_URL pour une instance auto-hébergée', async () => {
      process.env.PLAUSIBLE_API_URL = 'https://plausible.example.com'
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }))
      await client.eventMeasurement('30d')
      const [url] = fetchMock.mock.calls[0]
      expect(url).toMatch(/^https:\/\/plausible\.example\.com\/api\/v1\/stats\/breakdown/)
    })

    it('rend sourceAvailable:false sur une réponse non-ok, sans lever', async () => {
      const client = configuredClient()
      fetchMock.mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }))
      expect(await client.eventMeasurement('30d')).toEqual({ sourceAvailable: false, events: {}, visitors: {} })
    })

    it('rend sourceAvailable:false quand fetch lève, sans propager l’erreur', async () => {
      const client = configuredClient()
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      expect(await client.eventMeasurement('30d')).toEqual({ sourceAvailable: false, events: {}, visitors: {} })
    })

    it('open_timing : deux requêtes (exposition + succès), filtrées par nom d’événement', async () => {
      const client = configuredClient()
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            results: [
              { openTimingVariant: 'at8s', events: 40 },
              { openTimingVariant: 'at15s', events: 35 },
            ],
          }),
        )
        .mockResolvedValueOnce(jsonResponse({ results: [{ openTimingVariant: 'at8s', events: 6 }] }))

      const result = await client.experimentInput('open_timing', '30d')

      expect(result).toEqual({
        sourceAvailable: true,
        exposures: { at8s: 40, at15s: 35 },
        successes: { at8s: 6 },
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      const [exposureUrl] = fetchMock.mock.calls[0]
      expect(exposureUrl).toContain('filters=event%3Aname%3D%3Dchat_widget_viewed')
      const [successUrl] = fetchMock.mock.calls[1]
      expect(successUrl).toContain('filters=event%3Aname%3D%3Dchat_first_reply')
    })

    it('first_message : additionne chat_opened et chat_auto_opened pour l’exposition', async () => {
      const client = configuredClient()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [{ firstMessageVariant: 'warm', events: 30 }] }))
        .mockResolvedValueOnce(jsonResponse({ results: [{ firstMessageVariant: 'warm', events: 10 }] }))
        .mockResolvedValueOnce(jsonResponse({ results: [{ firstMessageVariant: 'warm', events: 5 }] }))

      const result = await client.experimentInput('first_message', '30d')

      expect(result).toEqual({
        sourceAvailable: true,
        exposures: { warm: 40 },
        successes: { warm: 5 },
      })
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('rend sourceAvailable:false pour une expérience si UNE des sources échoue', async () => {
      const client = configuredClient()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ results: [{ firstMessageVariant: 'warm', events: 30 }] }))
        .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ results: [] }))

      const result = await client.experimentInput('first_message', '30d')
      expect(result).toEqual({ sourceAvailable: false, exposures: {}, successes: {} })
    })
  })
})
