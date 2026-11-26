import { Logger } from '@nestjs/common'
import { SupabaseMetricsClient } from './supabase-metrics.client'

const CLE = 'eyJ-SERVICE-ROLE-ULTRA-SECRET-42'
const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'] as const

function configurer(): void {
  process.env['SUPABASE_URL'] = 'https://projet.supabase.test/'
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = CLE
}

const CORPS = [
  '# HELP x y',
  'node_load1 0.5',
  'go_goroutines 3',
  'pg_database_size_bytes{datname="postgres"} 100',
].join('\n')

describe('SupabaseMetricsClient', () => {
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

  it('NO-OP strict sans clé : non_configure, aucun appel réseau', async () => {
    process.env['SUPABASE_URL'] = 'https://projet.supabase.test'
    await expect(new SupabaseMetricsClient().lire()).resolves.toEqual({ etat: 'non_configure' })
    delete process.env['SUPABASE_URL']
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = CLE
    await expect(new SupabaseMetricsClient().lire()).resolves.toEqual({ etat: 'non_configure' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('appelle /customer/v1/privileged/metrics en Basic service_role:<clé>, et ne garde que les noms autorisés', async () => {
    configurer()
    fetchSpy.mockResolvedValue(new Response(CORPS, { status: 200 }))
    const r = await new SupabaseMetricsClient().lire()
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://projet.supabase.test/customer/v1/privileged/metrics')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${Buffer.from(`service_role:${CLE}`).toString('base64')}`,
    )
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.echantillons.map(e => e.nom)).toEqual(['node_load1', 'pg_database_size_bytes'])
  })

  it('cache 30 s : un second appel ne refait pas de requête', async () => {
    configurer()
    fetchSpy.mockImplementation(() => Promise.resolve(new Response(CORPS, { status: 200 })))
    const c = new SupabaseMetricsClient()
    const a = await c.lire()
    const b = await c.lire()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(b).toEqual(a)
  })

  it('res.ok faux ⇒ injoignable "HTTP 401", jamais mis en cache', async () => {
    configurer()
    fetchSpy.mockImplementationOnce(() => Promise.resolve(new Response('no', { status: 401 })))
    const c = new SupabaseMetricsClient()
    await expect(c.lire()).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
    fetchSpy.mockImplementationOnce(() => Promise.resolve(new Response(CORPS, { status: 200 })))
    expect((await c.lire()).etat).toBe('mesure')
  })

  it('délai dépassé et erreur réseau : raisons fixes, la clé n’apparaît ni dans le résultat ni dans les journaux', async () => {
    configurer()
    const delai = Object.assign(new Error(`timeout ${CLE}`), { name: 'TimeoutError' })
    fetchSpy.mockRejectedValueOnce(delai)
    const c = new SupabaseMetricsClient()
    const r1 = await c.lire()
    fetchSpy.mockRejectedValueOnce(new Error(`connect https://x?k=${CLE}`))
    const r2 = await c.lire()
    expect(r1).toEqual({ etat: 'injoignable', raison: 'délai dépassé (5 s)' })
    expect(r2).toEqual({ etat: 'injoignable', raison: 'erreur réseau' })
    expect(JSON.stringify([r1, r2]) + logs.join('\n')).not.toContain(CLE)
    expect(logs.length).toBeGreaterThan(0)
  })

  it('corps vide illisible ⇒ injoignable "réponse illisible"', async () => {
    configurer()
    fetchSpy.mockResolvedValue(new Response('<html>pas des métriques</html>', { status: 200 }))
    await expect(new SupabaseMetricsClient().lire()).resolves.toEqual({
      etat: 'injoignable',
      raison: 'réponse illisible',
    })
  })
})
