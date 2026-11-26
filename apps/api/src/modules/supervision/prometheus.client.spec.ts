import { BadRequestException, Logger } from '@nestjs/common'
import { PrometheusClient, REQUETES } from './prometheus.client'

const JETON = 'glc_JETON-ULTRA-SECRET-42'
const ENV_KEYS = ['GRAFANA_PROM_URL', 'GRAFANA_PROM_USER', 'GRAFANA_PROM_READ_TOKEN'] as const

function configurer(): void {
  process.env['GRAFANA_PROM_URL'] = 'https://prom.example.test/'
  process.env['GRAFANA_PROM_USER'] = '3624472'
  process.env['GRAFANA_PROM_READ_TOKEN'] = JETON
}

function reponseVecteur(result: unknown[]): Response {
  return new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result } }), { status: 200 })
}

describe('PrometheusClient (supervision, liste blanche)', () => {
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

  it('LIT une liste blanche non vide, dont chaque entrée a une PromQL et un périmètre', () => {
    const ids = Object.keys(REQUETES)
    expect(ids.length).toBeGreaterThan(10)
    for (const id of ids) {
      const r = REQUETES[id as keyof typeof REQUETES]
      expect(r.promql.length).toBeGreaterThan(5)
      expect(['hote', 'conteneur', 'flotte', 'cible']).toContain(r.perimetre)
    }
  })

  it('refuse un id hors liste blanche (400) — aucune PromQL externe acceptée, aucun appel', async () => {
    configurer()
    const client = new PrometheusClient()
    await expect(client.interroger('up{role="ci-runner"}')).rejects.toBeInstanceOf(BadRequestException)
    await expect(client.interroger('inconnu')).rejects.toThrow(BadRequestException)
    await expect(client.interroger({ promql: 'up' })).rejects.toThrow(BadRequestException)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuse une fenêtre au-delà de fenetreMaxSec (400)', async () => {
    configurer()
    const client = new PrometheusClient()
    const max = REQUETES.serie_cpu_pct_24h.fenetreMaxSec
    await expect(client.interroger('serie_cpu_pct_24h', max + 1)).rejects.toThrow(BadRequestException)
    await expect(client.interroger('serie_cpu_pct_24h', -5)).rejects.toThrow(BadRequestException)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(ENV_KEYS)('no-op STRICT sans %s : aucun appel réseau, etat non_configure', async manquante => {
    configurer()
    delete process.env[manquante]
    const client = new PrometheusClient()
    await expect(client.interroger('hote_coeurs')).resolves.toEqual({ etat: 'non_configure' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('interroge /api/prom/api/v1/query en Basic auth et rend les valeurs mesurées', async () => {
    configurer()
    fetchSpy.mockResolvedValue(reponseVecteur([{ metric: { host: 'bellum-ci-runner' }, value: [1700000000, '8'] }]))
    const client = new PrometheusClient()
    const r = await client.interroger('hote_coeurs')
    expect(r).toEqual({
      etat: 'mesure',
      series: [{ labels: { host: 'bellum-ci-runner' }, points: [{ t: 1700000000, v: 8 }] }],
    })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url.startsWith('https://prom.example.test/api/prom/api/v1/query?')).toBe(true)
    expect(new URL(url).searchParams.get('query')).toBe(REQUETES.hote_coeurs.promql)
    const auth = (init.headers as Record<string, string>)['Authorization']
    expect(auth).toBe(`Basic ${Buffer.from(`3624472:${JETON}`).toString('base64')}`)
    expect(init.signal).toBeDefined()
  })

  it('une valeur NaN / Inf devient null — jamais 0', async () => {
    configurer()
    fetchSpy.mockResolvedValue(reponseVecteur([{ metric: { host: 'h' }, value: [1, 'NaN'] }]))
    const r = await new PrometheusClient().interroger('hote_cpu_pct')
    expect(r).toEqual({ etat: 'mesure', series: [{ labels: { host: 'h' }, points: [{ t: 1, v: null }] }] })
  })

  it('une requête range passe start/end/step bornés', async () => {
    configurer()
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'success',
          data: {
            resultType: 'matrix',
            result: [
              {
                metric: { host: 'h' },
                values: [
                  [1, '12.5'],
                  [2, '13'],
                ],
              },
            ],
          },
        }),
      ),
    )
    const r = await new PrometheusClient().interroger('serie_mem_pct_24h')
    expect(r).toEqual({
      etat: 'mesure',
      series: [
        {
          labels: { host: 'h' },
          points: [
            { t: 1, v: 12.5 },
            { t: 2, v: 13 },
          ],
        },
      ],
    })
    const url = new URL((fetchSpy.mock.calls[0] as [string])[0])
    expect(url.pathname).toBe('/api/prom/api/v1/query_range')
    expect(url.searchParams.get('step')).toBe(String(REQUETES.serie_mem_pct_24h.pasSec))
    const start = Number(url.searchParams.get('start'))
    const end = Number(url.searchParams.get('end'))
    expect(end - start).toBe(REQUETES.serie_mem_pct_24h.fenetreMaxSec)
  })

  it('met en cache 30 s par (id, fenêtre)', async () => {
    configurer()
    fetchSpy.mockImplementation(async () => reponseVecteur([]))
    const client = new PrometheusClient()
    await client.interroger('hote_coeurs')
    await client.interroger('hote_coeurs')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await client.interroger('hote_load1')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('HTTP en erreur ⇒ injoignable, raison sans le jeton, jeton absent des journaux', async () => {
    configurer()
    fetchSpy.mockResolvedValue(new Response(`bad token ${JETON}`, { status: 401, statusText: 'Unauthorized' }))
    const r = await new PrometheusClient().interroger('hote_coeurs')
    expect(r).toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
    expect(JSON.stringify(r)).not.toContain(JETON)
    expect(logs.join('\n')).not.toContain(JETON)
  })

  it('erreur réseau portant le jeton ⇒ injoignable, le jeton ne fuit NI dans la raison NI dans les journaux', async () => {
    configurer()
    fetchSpy.mockRejectedValue(new Error(`connect ECONNREFUSED https://3624472:${JETON}@prom.example.test`))
    const r = await new PrometheusClient().interroger('hote_coeurs')
    expect(r.etat).toBe('injoignable')
    expect(JSON.stringify(r)).not.toContain(JETON)
    expect(logs.length).toBeGreaterThan(0)
    expect(logs.join('\n')).not.toContain(JETON)
  })

  it('délai dépassé ⇒ injoignable « délai dépassé »', async () => {
    configurer()
    const err = new Error('The operation was aborted due to timeout')
    err.name = 'TimeoutError'
    fetchSpy.mockRejectedValue(err)
    const r = await new PrometheusClient().interroger('hote_coeurs')
    expect(r).toEqual({ etat: 'injoignable', raison: 'délai dépassé (5 s)' })
  })

  it('réponse illisible ⇒ injoignable, pas un tableau vide', async () => {
    configurer()
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ status: 'error', error: 'parse' })))
    const r = await new PrometheusClient().interroger('hote_coeurs')
    expect(r).toEqual({ etat: 'injoignable', raison: 'réponse illisible' })
  })
})
