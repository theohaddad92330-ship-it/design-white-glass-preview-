import type { DataSource } from 'typeorm'
import type { DependencySample } from './dependency-health.logic'
import { DependencyProbeService } from './dependency-probe.service'
import { DEPENDENCIES, DEPENDENCY_IDS, isConfigured, type DependencyId } from './dependency-registry'
import type { WorkerReadinessRegistry } from '../worker-readiness/worker-readiness.registry'

/**
 * Un double qui n'ouvre NI base NI réseau NI Redis : on observe ce que la passe
 * DÉCIDE de sonder, et ce qu'elle range.
 */
class ProbeSpy extends DependencyProbeService {
  readonly probed: DependencyId[] = []
  written: { id: DependencyId; sample: DependencySample }[] = []
  echouent = new Set<DependencyId>()

  constructor(workerLive = true) {
    super(
      { query: async () => [{ '?column?': 1 }] } as unknown as DataSource,
      { isLive: () => workerLive, snapshot: () => ({}) } as unknown as WorkerReadinessRegistry,
    )
  }

  /**
   * ⚠️ Elle DÉLÈGUE à la vraie sonde plutôt que de la remplacer. Une doublure
   * qui rendrait `true` sans exécuter le code réel testerait la doublure : c'est
   * ainsi que le cas « worker mort » restait vert quoi qu'il arrive. Seuls les
   * DEUX accès au monde extérieur sont neutralisés, plus bas.
   */
  protected override async probe(id: DependencyId): Promise<boolean> {
    this.probed.push(id)
    if (this.echouent.has(id)) throw new Error(`sonde ${id} en échec`)
    return super.probe(id)
  }

  /** Aucun réseau en test. */
  protected override async fetchOk(): Promise<void> {}

  /** Aucun Redis en test. */
  protected override async pingRedis(): Promise<void> {}

  protected override async write(entries: readonly { id: DependencyId; sample: DependencySample }[]): Promise<void> {
    this.written = [...entries]
  }

  protected override redis(): null {
    return null
  }
}

/** Les clés que le registre exige pour les sondes synthétiques. */
const CLES_DE_SONDE = DEPENDENCY_IDS.filter(id => DEPENDENCIES[id].measuredBy === 'probe').flatMap(
  id => DEPENDENCIES[id].envKeys,
)

describe('DependencyProbeService — ce qu’on sonde, et ce qu’on ne sonde pas', () => {
  const memorise = { ...process.env }

  afterEach(() => {
    process.env = { ...memorise }
  })

  it('LIT quelque chose — le registre déclare bien deux régimes de mesure', () => {
    // Un registre où tout serait `usage` rendrait vert un test qui ne sonde rien.
    expect(DEPENDENCY_IDS.filter(id => DEPENDENCIES[id].measuredBy === 'probe').length).toBeGreaterThan(3)
    expect(DEPENDENCY_IDS.filter(id => DEPENDENCIES[id].measuredBy === 'usage').length).toBeGreaterThan(3)
    expect(CLES_DE_SONDE.length).toBeGreaterThan(0)
  })

  it('ne sonde JAMAIS un fournisseur mesuré à l’usage — il est facturé à l’appel', async () => {
    for (const key of CLES_DE_SONDE) process.env[key] = 'posee'
    const spy = new ProbeSpy()
    await spy.probeAndRecord(1_000)

    const usage = DEPENDENCY_IDS.filter(id => DEPENDENCIES[id].measuredBy === 'usage')
    for (const id of usage) expect(spy.probed).not.toContain(id)
    expect(usage.length).toBeGreaterThan(0)
  })

  it('sans clé = AUCUN appel : une dépendance non configurée n’est pas sondée', async () => {
    // ⚠️ « Sans clé = no-op strict » : zéro appel réseau. La tuile dira
    // « éteinte », et c'est la dérivation qui le décide, pas la sonde.
    for (const key of CLES_DE_SONDE) delete process.env[key]
    const spy = new ProbeSpy()
    await spy.probeAndRecord(1_000)

    for (const id of DEPENDENCY_IDS) {
      if (isConfigured(DEPENDENCIES[id], process.env)) continue
      expect(spy.probed).not.toContain(id)
    }
    // Et celles qui n'exigent rien sont bien sondées : sinon ce test serait
    // vert parce qu'il ne sonde RIEN.
    expect(spy.probed).toContain('postgres')
    expect(spy.probed).toContain('redis')
  })

  it('une sonde en échec est ENREGISTRÉE — l’historique se creuserait sinon pendant les pannes', async () => {
    for (const key of CLES_DE_SONDE) delete process.env[key]
    const spy = new ProbeSpy()
    spy.echouent.add('postgres')
    await spy.probeAndRecord(5_000)

    const postgres = spy.written.find(entry => entry.id === 'postgres')
    expect(postgres?.sample).toEqual({ at: 5_000, ok: false, latencyMs: null })
  })

  it('une sonde en échec n’emporte pas les autres', async () => {
    for (const key of CLES_DE_SONDE) delete process.env[key]
    const spy = new ProbeSpy()
    spy.echouent.add('postgres')
    await spy.probeAndRecord(5_000)
    expect(spy.written.find(entry => entry.id === 'redis')?.sample.ok).toBe(true)
  })

  it('une sonde sans aller-retour range `null` et JAMAIS 0 ms', async () => {
    for (const key of CLES_DE_SONDE) delete process.env[key]
    const spy = new ProbeSpy()
    await spy.probeAndRecord(5_000)

    for (const id of ['api', 'worker'] as const) {
      const entree = spy.written.find(entry => entry.id === id)
      expect(entree?.sample.latencyMs).toBeNull()
      expect(entree?.sample.latencyMs).not.toBe(0)
    }
  })

  it('un worker mort produit une sonde en ÉCHEC, pas une sonde silencieuse', async () => {
    for (const key of CLES_DE_SONDE) delete process.env[key]
    const spy = new ProbeSpy(false)
    await spy.probeAndRecord(5_000)
    expect(spy.written.find(entry => entry.id === 'worker')?.sample.ok).toBe(false)
  })

  it('sans Redis, l’historique est VIDE — l’appelant en dérive « inconnu », jamais « sain »', async () => {
    const spy = new ProbeSpy()
    expect(await spy.history(1_000)).toEqual({})
  })
})

/**
 * #1840 — la sonde Supabase criait au loup : elle appelait `/auth/v1/health`
 * SANS authentification, Kong répondait 401 « No API key found in request »,
 * et ce 401 était lu comme « le service est en panne ». Mesuré en recette le
 * 10/09 : sans authentification, `http=401` en 0,46 s ; le service, LUI, est
 * debout.
 *
 * ⚠️ Aucun test ci-dessus ne pouvait attraper ce défaut : `ProbeSpy` neutralise
 * `fetchOk` en no-op (ligne 36), donc rien n'observe jamais ce qu'il envoie
 * réellement au réseau. Cette suite délègue au contraire à la VRAIE `probe()`
 * ET au VRAI `fetchOk()`, et ne remplace que `global.fetch` — le seul point où
 * le réseau part pour de vrai.
 */
class RealHttpProbe extends DependencyProbeService {
  constructor() {
    super(
      { query: async () => [{ '?column?': 1 }] } as unknown as DataSource,
      { isLive: () => true, snapshot: () => ({}) } as unknown as WorkerReadinessRegistry,
    )
  }

  /** Expose la sonde RÉELLE — `probe` est `protected` sur la classe mère. */
  run(id: DependencyId): Promise<boolean> {
    return this.probe(id)
  }
}

describe('DependencyProbeService — les sondes HTTP authentifiées portent leur clé (#1840)', () => {
  const memorise = { ...process.env }
  const realFetch = global.fetch
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = realFetch
    process.env = { ...memorise }
    jest.clearAllMocks()
  })

  it('Supabase : l’en-tête `apikey` part avec la requête, comme Kong l’exige', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-test-key'
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)

    const ok = await new RealHttpProbe().run('supabase')

    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string> }]
    expect(url).toBe('https://x.supabase.co/auth/v1/health')
    expect(init.headers?.apikey).toBe('anon-test-key')
    // Jamais la clé de service : une sonde de vivacité n'a besoin d'aucun
    // privilège d'administration.
    expect(JSON.stringify(init)).not.toMatch(/service.?role/i)
  })

  it('⚠️ LE défaut EXACT du 10/09 : la vraie réponse de Kong sans authentification est un 401, jamais un service mort', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-test-key'
    // La réponse mesurée en recette, telle quelle. Le mock ne rend « sain » que
    // si la requête PORTE la clé — exactement le point qui manquait.
    fetchMock.mockImplementation((_url: string, init: { headers?: Record<string, string> }) => {
      if (init?.headers?.apikey) return Promise.resolve({ ok: true, status: 200 } as Response)
      return Promise.resolve({
        ok: false,
        status: 401,
        json: async () => ({
          message: 'No API key found in request',
          hint: 'No `apikey` request header or url param was found.',
        }),
      } as unknown as Response)
    })

    // Si `case 'supabase'` régressait vers l'ancien appel sans en-tête, ce test
    // rougirait exactement comme la tuile de recette du 10/09.
    await expect(new RealHttpProbe().run('supabase')).resolves.toBe(true)
  })

  it('Stripe reste la référence : `Authorization: Bearer …` part déjà, et continue de partir', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk-test'
    fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response)

    await new RealHttpProbe().run('stripe')

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers?: Record<string, string> }]
    expect(url).toBe('https://api.stripe.com/v1/balance')
    expect(init.headers?.Authorization).toBe('Bearer sk-test')
  })

  it('SUPABASE_ANON_KEY absente : la dépendance n’est PAS configurée — « éteinte », jamais « en panne »', () => {
    const sansAnon: NodeJS.ProcessEnv = { ...memorise, SUPABASE_URL: 'https://x.supabase.co' }
    delete sansAnon.SUPABASE_ANON_KEY
    expect(isConfigured(DEPENDENCIES.supabase, sansAnon)).toBe(false)

    const avecAnon: NodeJS.ProcessEnv = { ...sansAnon, SUPABASE_ANON_KEY: 'anon-test-key' }
    expect(isConfigured(DEPENDENCIES.supabase, avecAnon)).toBe(true)
  })

  it('sans SUPABASE_ANON_KEY, on ne sonde PAS du tout — zéro appel, comme tout fournisseur sans clé', async () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    delete process.env.SUPABASE_ANON_KEY
    for (const key of CLES_DE_SONDE)
      if (key !== 'SUPABASE_URL' && key !== 'SUPABASE_ANON_KEY') process.env[key] = 'posee'

    const spy = new ProbeSpy()
    await spy.probeAndRecord(1_000)

    expect(spy.probed).not.toContain('supabase')
  })
})
