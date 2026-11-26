import { BoondCallGate } from './boond-call-gate'
import { BoondDictionaryCache, parseDictionary, selectableStates } from './boond-dictionary'
import { requiredScopeFor, REQUESTED_BOOND_SCOPES, UndeclaredBoondRouteError } from './boond-scopes'
import { BoondWebhookRefetcher, mergeResynced } from './boond-sync'
import { BoondManagerClient } from './boondmanager.client'

/** Fixtures d'instance : les seuls endroits où un identifiant de référentiel Boond peut s'écrire. */
const dictOf = (version: string, actionValue: string, states: unknown[] = []) => ({
  data: {
    setting: {
      version,
      timezone: 'Europe/Paris',
      action: { contact: [{ value: actionValue, isEnabled: true, types: [] }] },
      state: { opportunity: states },
    },
  },
})

const ACTION = (typeOf: string) => ({
  typeOf,
  title: 't',
  text: 'x',
  startDate: '2026-11-02T11:00:00.000Z',
  contactId: '1',
  mainManagerId: null,
  companyId: null,
})

function res(status: number, body = '{}', headers: Record<string, string> = {}): Response {
  return {
    ok: status < 300,
    status,
    text: () => Promise.resolve(body),
    headers: { get: (k: string) => headers[k] ?? null },
  } as unknown as Response
}

describe('BOOND-B', () => {
  const fetchMock = jest.fn()
  const real = global.fetch
  const sleeps: number[] = []
  const sleep = (ms: number) => {
    sleeps.push(ms)
    return Promise.resolve()
  }
  const base = { baseUrl: 'https://erp.test/api', searchParam: 'keywords', accessToken: 't', connectionKey: 'ws1:prod' }
  const mk = (cfg = {}, gate = new BoondCallGate({ now: () => 0, sleep })) =>
    new BoondManagerClient({ ...base, ...cfg }, { gate, sleep, random: () => 0.5 })

  beforeEach(() => {
    fetchMock.mockReset()
    sleeps.length = 0
    global.fetch = fetchMock as unknown as typeof fetch
  })
  afterAll(() => {
    global.fetch = real
  })

  it('1. deux dictionnaires → deux mappings distincts, jamais partagés entre connexions', async () => {
    const cache = new BoondDictionaryCache()
    const a = await cache.get('wsA:test', async () => parseDictionary(dictOf('v1', '11')))
    const b = await cache.get('wsB:prod', async () => parseDictionary(dictOf('v9', '42')))
    expect(a?.actions['contact']?.[0]?.value).toBe('11')
    expect(b?.actions['contact']?.[0]?.value).toBe('42')
    expect(cache.versionOf('wsA:test')).toBe('v1')
  })

  it('1b. un changement de setting.version invalide le cache', async () => {
    const cache = new BoondDictionaryCache()
    const fetcher = jest.fn(async () => parseDictionary(dictOf('v1', '1')))
    await cache.get('k', fetcher)
    await cache.get('k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    cache.noteVersion('k', 'v2')
    await cache.get('k', fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('1c. un état désactivé ou inactif n’est jamais proposé', () => {
    const d = parseDictionary(
      dictOf('v', '1', [
        { value: 'a', isEnabled: true, active: true },
        { value: 'b', isEnabled: false },
        { value: 'c', active: false },
      ]),
    )
    expect(selectableStates(d!, 'opportunity').map(s => s.value)).toEqual(['a'])
  })

  it('2. typeOf absent du dictionnaire → refus AVANT le réseau', async () => {
    const d = parseDictionary(dictOf('v', '11'))
    const out = await mk().createAction(d, ACTION('999'))
    expect(out.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('2b. typeOf présent → l’écriture part', async () => {
    fetchMock.mockResolvedValue(res(201))
    const out = await mk().createAction(parseDictionary(dictOf('v', '11')), ACTION('11'))
    expect(out.ok).toBe(true)
  })

  it('3. sans actions:write la capacité est ABSENTE (refus nommé, zéro réseau)', async () => {
    const c = mk({ grantedScopes: ['actions:read'] })
    expect(c.refusalFor('POST', '/actions')).toContain('actions:write')
    expect(c.refusalFor('GET', '/actions')).toBeNull()
    const out = await c.create('/actions', {})
    expect(out.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('3b. garde : route non déclarée ou scope non demandé → échec, aucun admin:*', () => {
    expect(() => requiredScopeFor('GET', '/billing')).toThrow(UndeclaredBoondRouteError)
    expect(() => requiredScopeFor('POST', '/companies')).toThrow(UndeclaredBoondRouteError)
    expect(REQUESTED_BOOND_SCOPES.some(s => s.startsWith('admin'))).toBe(false)
  })

  it('4. 429 + Retry-After 7 → la tentative suivante attend 7 s', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, '{}', { 'Retry-After': '7' }))
      .mockResolvedValueOnce(res(200, '{"data":[{"id":"1","name":"Acme"}]}'))
    const rows = await mk().listRecords('/resources')
    expect(sleeps).toEqual([7000])
    expect(rows).toHaveLength(1)
  })

  it('4b. 5xx → back-off 1 s avec jitter puis 2 s, plafonné', async () => {
    fetchMock.mockResolvedValue(res(503))
    await mk().listRecords('/resources')
    expect(sleeps).toEqual([1000, 2000])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('5. 101 appels Tier 2 en 10 s → le 101e est retenu par NOTRE limiteur', async () => {
    let t = 0
    const waits: number[] = []
    const gate = new BoondCallGate({
      now: () => t,
      sleep: async ms => {
        waits.push(ms)
        t += ms
      },
    })
    for (let i = 0; i < 100; i++) await gate.acquire('k', 2)
    expect(waits).toEqual([])
    await gate.acquire('k', 2)
    expect(waits).toEqual([10_000])
    expect(gate.callCount('k')).toBe(101)
    expect(gate.callCount('autre')).toBe(0)
  })

  it('5b. coupe-circuit par connexion : une instance morte ne ralentit pas une autre', () => {
    const gate = new BoondCallGate({ now: () => 0, sleep })
    for (let i = 0; i < 5; i++) gate.recordFailure('morte')
    expect(gate.isOpen('morte')).toBe(true)
    expect(gate.isOpen('vivante')).toBe(false)
  })

  it('6. webhook reçu deux fois → un seul refetch, le payload n’écrit rien', async () => {
    const r = new BoondWebhookRefetcher(() => 0)
    const refetch = jest.fn(async () => undefined)
    await r.receive('k', { resource: 'opportunities', id: '5' }, refetch)
    await r.receive('k', { resource: 'opportunities', id: '5' }, refetch)
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('6b. une correction humaine gagne toujours sur la resynchro', () => {
    expect(mergeResynced({ value: 'main', correctedByHuman: true }, 'boond').value).toBe('main')
    expect(mergeResynced({ value: 'x', correctedByHuman: false }, 'boond').value).toBe('boond')
  })

  it('7. 501 → refus de déclaration, ZÉRO nouvelle tentative', async () => {
    fetchMock.mockResolvedValue(res(501, 'This application does not have the rights to access this route'))
    const out = await mk().update('/deliveries', '3', {})
    expect(out.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sleeps).toEqual([])
  })

  it('8. timeout d’une écriture → unknown, aucune reprise', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchMock.mockRejectedValue(abort)
    const out = await mk().create('/deliveries', {})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(out).toMatchObject({ ok: false, outcome: 'unknown' })
  })

  it('9. Accept-Encoding gzip posé, meta.warnings remontés, sonde = current-user', async () => {
    fetchMock.mockResolvedValue(res(200, '{"meta":{"warnings":[{"code":"appOauthRedirection"}]}}'))
    const c = mk()
    expect(await c.probeCurrentUser()).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/application/current-user')
    expect((init.headers as Record<string, string>)['Accept-Encoding']).toBe('gzip')
    expect(c.responseWarnings).toEqual(['appOauthRedirection'])
  })
})

describe('BOOND-B — garde : aucun identifiant de référentiel en dur', () => {
  it('aucun littéral numérique de typeOf / d’état Boond hors fixtures de test', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs')
    const dir = __dirname
    const files = fs.readdirSync(dir).filter(f => /^boond.*\.ts$/.test(f) && !f.endsWith('.spec.ts'))
    expect(files.length).toBeGreaterThan(3)
    for (const f of files) {
      const code = fs.readFileSync(`${dir}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(code).not.toMatch(/typeOf['"]?\s*[:=]\s*['"]?\d/)
      expect(code).not.toMatch(/\bstate['"]?\s*[:=]\s*['"]?\d/)
    }
  })
})
