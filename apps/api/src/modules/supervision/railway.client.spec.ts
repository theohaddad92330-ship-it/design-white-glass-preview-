import { Logger } from '@nestjs/common'
import { RailwayClient } from './railway.client'

const JETON = 'jeton-railway-ULTRA-SECRET-42'
const PROJET = '35efdac2-af65-42a5-88f8-35ed9c40a254'
const ENV = '474a205c-bb75-4484-81f6-85c936f4c7a1'
const ENV_KEYS = ['RAILWAY_METRICS_TOKEN', 'RAILWAY_PROJECT_ID', 'RAILWAY_ENVIRONMENT_ID'] as const

function configurer(): void {
  process.env['RAILWAY_METRICS_TOKEN'] = JETON
  process.env['RAILWAY_PROJECT_ID'] = PROJET
  process.env['RAILWAY_ENVIRONMENT_ID'] = ENV
}

const METRIQUES = {
  data: {
    metrics: [
      { measurement: 'CPU_USAGE', tags: { serviceId: 'svc-1' }, values: [{ ts: 1_700_000_000, value: 0.5 }] },
      { measurement: 'DROP_TABLE', tags: { serviceId: 'svc-1' }, values: [{ ts: 1_700_000_000, value: 9 }] },
    ],
  },
}
const SERVICES = { data: { project: { services: { edges: [{ node: { id: 'svc-1', name: 'api' } }] } } } }

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), { status })
}

/** Réponse selon la requête GraphQL envoyée. */
function repondre(metriques: () => Response, services: () => Response) {
  return (_url: unknown, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { query: string }
    return Promise.resolve(body.query.includes('metrics(') ? metriques() : services())
  }
}

const RAISON_REFUSEE = 'erreur GraphQL (accès refusé : jeton à vérifier)'

describe('RailwayClient', () => {
  const saved: Record<string, string | undefined> = {}
  let fetchSpy: jest.SpyInstance
  let logs: string[]

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    fetchSpy = jest.spyOn(globalThis, 'fetch')
    logs = []
    for (const niveau of ['log', 'warn', 'error', 'debug'] as const) {
      jest.spyOn(Logger.prototype, niveau).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(a => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '))
      })
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    jest.restoreAllMocks()
  })

  it.each(ENV_KEYS)('NO-OP strict sans %s : non_configure, aucun appel réseau', async manquant => {
    configurer()
    delete process.env[manquant]
    await expect(new RailwayClient().lire('24h')).resolves.toEqual({ etat: 'non_configure' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('un identifiant projet non conforme (injection) est traité comme non configuré', async () => {
    configurer()
    process.env['RAILWAY_PROJECT_ID'] = 'x"){evil}'
    await expect(new RailwayClient().lire('24h')).resolves.toEqual({ etat: 'non_configure' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('envoie Project-Access-Token (et PAS Authorization) en POST sur le point GraphQL', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json(SERVICES),
      ),
    )
    await new RailwayClient().lire('24h')
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://backboard.railway.com/graphql/v2')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Project-Access-Token']).toBe(JETON)
    expect(headers['Authorization']).toBeUndefined()
  })

  it('requête de métriques bornée : ids du projet, fenêtre, mesures de la liste blanche', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json(SERVICES),
      ),
    )
    await new RailwayClient().lire('1h')
    const corps = fetchSpy.mock.calls.map(c => JSON.parse(String((c[1] as RequestInit).body)).query as string)
    const q = corps.find(c => c.includes('metrics('))!
    expect(q).toContain(`projectId:"${PROJET}"`)
    expect(q).toContain(`environmentId:"${ENV}"`)
    expect(q).toContain('CPU_USAGE,CPU_LIMIT,MEMORY_USAGE_GB,MEMORY_LIMIT_GB')
    expect(q).toContain('groupBy:[SERVICE_ID]')
    const debut = /startDate:"([^"]+)"/.exec(q)![1]!
    const ageMs = Date.now() - new Date(debut).getTime()
    expect(ageMs).toBeGreaterThan(3_500_000)
    expect(ageMs).toBeLessThan(3_700_000)
  })

  it('rend les séries de la liste blanche (le reste est jeté) et les noms de services', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json(SERVICES),
      ),
    )
    const r = await new RailwayClient().lire('24h')
    expect(r.etat).toBe('mesure')
    if (r.etat !== 'mesure') return
    expect(r.series).toEqual([{ mesure: 'CPU_USAGE', serviceId: 'svc-1', points: [{ t: 1_700_000_000_000, v: 0.5 }] }])
    expect(r.noms).toEqual({ 'svc-1': 'api' })
  })

  it('la requête des noms qui échoue ne casse pas la mesure : noms vides', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json({}, 500),
      ),
    )
    const r = await new RailwayClient().lire('24h')
    expect(r).toMatchObject({ etat: 'mesure', noms: {} })
  })

  // #4480.5 — l'ÉCRAN nomme la classe de l'erreur (vocabulaire fermé), jamais le message serveur.
  it.each([
    ['Not Authorized', 'erreur GraphQL (accès refusé : jeton à vérifier)'],
    ['Too many requests, rate limit', 'erreur GraphQL (limite de débit)'],
    ['Cannot query field "metrics" on type "Query"', 'erreur GraphQL (requête non reconnue par Railway)'],
    ['Problem processing request', 'erreur GraphQL'],
  ])('#4480.5 — « %s » se dit à l’écran par sa classe, sans citer le message', async (message, attendu) => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json({ errors: [{ message: `${message} ${JETON}` }] }),
        () => json(SERVICES),
      ),
    )
    const r = await new RailwayClient().lire('24h')
    expect(r).toEqual({ etat: 'injoignable', raison: attendu })
    expect(JSON.stringify(r)).not.toContain(JETON)
    expect(JSON.stringify(r)).not.toContain(message)
  })

  it('erreur GraphQL errors[] : injoignable, message FIXE sans le message serveur ni le jeton', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json({ errors: [{ message: `Not Authorized ${JETON}` }] }),
        () => json(SERVICES),
      ),
    )
    const r = await new RailwayClient().lire('24h')
    expect(r).toEqual({ etat: 'injoignable', raison: RAISON_REFUSEE })
    expect(JSON.stringify(r)).not.toContain(JETON)
    expect(logs.join('\n')).not.toContain(JETON)
  })

  it('HTTP en erreur : raison fixe', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json({}, 401),
        () => json(SERVICES),
      ),
    )
    await expect(new RailwayClient().lire('24h')).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
  })

  it('panne réseau : raison fixe, jamais le message d’exception ni le jeton', async () => {
    configurer()
    fetchSpy.mockRejectedValue(new Error(`connect ECONNREFUSED ${JETON}`))
    const r = await new RailwayClient().lire('24h')
    expect(r).toEqual({ etat: 'injoignable', raison: 'erreur réseau' })
    expect(logs.join('\n')).not.toContain(JETON)
  })

  describe('#4480 — 315 erreurs GraphQL en 1 h 30 : on espace, on met en cache, on journalise UNE fois', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const refuse = () => json({ errors: [{ message: `Not Authorized ${JETON}` }] })

    it('une panne persistante n’est pas re-sondée à chaque lecture : repli exponentiel, zéro réseau pendant la pause', async () => {
      configurer()
      fetchSpy.mockImplementation(repondre(refuse, refuse))
      const client = new RailwayClient()

      await expect(client.lire('24h')).resolves.toEqual({ etat: 'injoignable', raison: RAISON_REFUSEE })
      const apresPremiere = fetchSpy.mock.calls.length
      // Le minuteur de fond, l'écran et les alertes relisent dans la minute : aucun nouvel appel.
      await jest.advanceTimersByTimeAsync(20_000)
      await expect(client.lire('24h')).resolves.toEqual({ etat: 'injoignable', raison: RAISON_REFUSEE })
      await expect(client.lire('7j')).resolves.toEqual({ etat: 'injoignable', raison: RAISON_REFUSEE })
      expect(fetchSpy.mock.calls.length).toBe(apresPremiere)

      // La pause passée, on RÉESSAIE (une panne doit pouvoir se lever).
      await jest.advanceTimersByTimeAsync(60_000)
      await client.lire('24h')
      expect(fetchSpy.mock.calls.length).toBeGreaterThan(apresPremiere)
    })

    it('la même erreur ne se journalise qu’UNE fois, sans le jeton', async () => {
      configurer()
      fetchSpy.mockImplementation(repondre(refuse, refuse))
      const client = new RailwayClient()
      for (let i = 0; i < 4; i += 1) {
        await client.lire('24h')
        await jest.advanceTimersByTimeAsync(15 * 60_000)
      }
      const graphql = logs.filter(l => l.includes('erreur GraphQL'))
      expect(graphql).toHaveLength(1)
      expect(graphql.join('\n')).not.toContain(JETON)
    })

    it('les noms de services (stables) ne sont relus qu’après 10 minutes, pas à chaque mesure', async () => {
      configurer()
      fetchSpy.mockImplementation(
        repondre(
          () => json(METRIQUES),
          () => json(SERVICES),
        ),
      )
      const client = new RailwayClient()
      await client.lire('24h')
      expect(fetchSpy).toHaveBeenCalledTimes(2)
      await jest.advanceTimersByTimeAsync(31_000)
      const r = await client.lire('24h')
      // Cache de mesure expiré : une seule requête (les métriques), les noms restent ceux d'avant.
      expect(fetchSpy).toHaveBeenCalledTimes(3)
      expect(r).toMatchObject({ etat: 'mesure', noms: { 'svc-1': 'api' } })
    })

    it('sait dire NON : une panne n’est jamais mise en cache comme une mesure', async () => {
      configurer()
      let panne = true
      fetchSpy.mockImplementation(
        repondre(
          () => (panne ? refuse() : json(METRIQUES)),
          () => json(SERVICES),
        ),
      )
      const client = new RailwayClient()
      await client.lire('24h')
      panne = false
      await jest.advanceTimersByTimeAsync(60_000)
      await expect(client.lire('24h')).resolves.toMatchObject({ etat: 'mesure' })
    })
  })

  describe('délai 20 s et une nouvelle tentative (lecture de fond 30/09)', () => {
    const delai = (): Error => Object.assign(new Error('x'), { name: 'TimeoutError' })

    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it('délai dépassé deux fois : raison dédiée (20 s), deux tentatives par requête', async () => {
      configurer()
      fetchSpy.mockRejectedValue(delai())
      const p = new RailwayClient().lire('24h')
      await jest.advanceTimersByTimeAsync(2_000)
      await expect(p).resolves.toEqual({ etat: 'injoignable', raison: 'délai dépassé (20 s)' })
      // métriques + noms, chacun deux fois
      expect(fetchSpy).toHaveBeenCalledTimes(4)
    })

    it('le délai passé à fetch est de 20 s', async () => {
      configurer()
      const spy = jest.spyOn(AbortSignal, 'timeout')
      fetchSpy.mockImplementation(
        repondre(
          () => json(METRIQUES),
          () => json(SERVICES),
        ),
      )
      await new RailwayClient().lire('24h')
      expect(spy).toHaveBeenCalledWith(20_000)
    })

    it('délai puis succès : nouvelle tentative après 2 s, mesure rendue', async () => {
      configurer()
      let n = 0
      fetchSpy.mockImplementation((_u: unknown, init?: RequestInit): Promise<Response> => {
        const q = (JSON.parse(String(init?.body)) as { query: string }).query
        if (!q.includes('metrics(')) return Promise.resolve(json(SERVICES))
        n += 1
        return n === 1 ? Promise.reject(delai()) : Promise.resolve(json(METRIQUES))
      })
      const p = new RailwayClient().lire('24h')
      await jest.advanceTimersByTimeAsync(1_999)
      expect(n).toBe(1)
      await jest.advanceTimersByTimeAsync(1)
      const r = await p
      expect(n).toBe(2)
      expect(r.etat).toBe('mesure')
    })

    it('HTTP 5xx : une nouvelle tentative', async () => {
      configurer()
      let n = 0
      fetchSpy.mockImplementation((_u: unknown, init?: RequestInit): Promise<Response> => {
        const q = (JSON.parse(String(init?.body)) as { query: string }).query
        if (!q.includes('metrics(')) return Promise.resolve(json(SERVICES))
        n += 1
        return Promise.resolve(n === 1 ? json({}, 503) : json(METRIQUES))
      })
      const p = new RailwayClient().lire('24h')
      await jest.advanceTimersByTimeAsync(2_000)
      expect((await p).etat).toBe('mesure')
      expect(n).toBe(2)
    })

    it('HTTP 4xx : AUCUNE nouvelle tentative', async () => {
      configurer()
      fetchSpy.mockImplementation(() => Promise.resolve(json({}, 401)))
      await expect(new RailwayClient().lire('24h')).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })

  it('cache 30 s pour une mesure, par fenêtre ; une panne ne se cache pas', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json(SERVICES),
      ),
    )
    const c = new RailwayClient()
    await c.lire('24h')
    const n = fetchSpy.mock.calls.length
    await c.lire('24h')
    expect(fetchSpy.mock.calls.length).toBe(n)
    await c.lire('7j')
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(n)
  })
  it('#4480 — lectures SIMULTANÉES de la même fenêtre : un seul appel réseau (minuteur, écran et alertes ensemble)', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json(METRIQUES),
        () => json(SERVICES),
      ),
    )
    const client = new RailwayClient()
    const [a, b, c] = await Promise.all([client.lire('1h'), client.lire('1h'), client.lire('1h')])
    // une requête de métriques + une requête de noms, pas trois de chaque
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(a).toEqual(b)
    expect(b).toEqual(c)
    expect(a.etat).toBe('mesure')
  })

  it('#4480 — lectures simultanées pendant une panne : un seul appel, puis le coupe-circuit répond sans réseau', async () => {
    configurer()
    fetchSpy.mockImplementation(
      repondre(
        () => json({ errors: [{ message: 'Not Authorized' }] }),
        () => json(SERVICES),
      ),
    )
    const client = new RailwayClient()
    const lus = await Promise.all([client.lire('1h'), client.lire('1h')])
    expect(lus.map(l => l.etat)).toEqual(['injoignable', 'injoignable'])
    const appels = fetchSpy.mock.calls.length
    expect(appels).toBe(2)
    await client.lire('1h')
    expect(fetchSpy).toHaveBeenCalledTimes(appels)
    expect(logs.join('\n')).not.toContain(JETON)
  })
})
