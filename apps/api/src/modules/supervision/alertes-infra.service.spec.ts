import type { ConfigService } from '@nestjs/config'
import { AlertesInfraService, REGLES_ALERTES } from './alertes-infra.service'
import type { LectureDeFondService, SupabaseServi } from './lecture-de-fond.service'
import type { PrometheusClient, ResultatPrometheus } from './prometheus.client'

const envoyer = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: (...a: unknown[]) => envoyer(...a) } })),
}))

const ENV = [
  'GRAFANA_PROM_URL',
  'GRAFANA_PROM_USER',
  'GRAFANA_PROM_READ_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RAILWAY_METRICS_TOKEN',
  'BACKOFFICE_ALERT_EMAILS',
  'NODE_ENV',
  'DASHBOARD_MANAGER_URL',
] as const

/** Redis en mémoire : SET NX, GET, DEL (rend le nombre supprimé), ensembles. TTL ignoré. */
function faux() {
  const kv = new Map<string, string>()
  const sets = new Map<string, Set<string>>()
  return {
    kv,
    panne: false,
    async set(k: string, v: string, ...args: unknown[]) {
      if (this.panne) throw new Error('redis down')
      if (args.includes('NX') && kv.has(k)) return null
      kv.set(k, v)
      return 'OK'
    },
    async get(k: string) {
      if (this.panne) throw new Error('redis down')
      return kv.get(k) ?? null
    },
    async del(k: string) {
      return kv.delete(k) ? 1 : 0
    },
    async sadd(k: string, m: string) {
      const s = sets.get(k) ?? new Set<string>()
      s.add(m)
      sets.set(k, s)
      return 1
    },
    async srem(k: string, m: string) {
      return sets.get(k)?.delete(m) ? 1 : 0
    },
    async smembers(k: string) {
      if (this.panne) throw new Error('redis down')
      return [...(sets.get(k) ?? [])]
    },
    async quit() {
      return 'OK'
    },
  }
}

const serie = (label: string, valeurs: Record<string, number | null>): ResultatPrometheus => ({
  etat: 'mesure',
  series: Object.entries(valeurs).map(([n, v]) => ({ labels: { [label]: n }, points: [{ t: 1, v }] })),
})

type Donnees = Partial<Record<string, ResultatPrometheus>>

function monter(
  donnees: () => Donnees,
  supabase: () => SupabaseServi = () => ({ etat: 'non_configure' }),
  redis = faux(),
) {
  const prometheus = {
    interroger: jest.fn(async (id: string) => donnees()[id] ?? ({ etat: 'mesure', series: [] } as ResultatPrometheus)),
  } as unknown as PrometheusClient
  const lecture = { supabase: jest.fn(async () => supabase()) } as unknown as LectureDeFondService
  const config = {
    get: (k: string) => (k === 'resendApiKey' ? 're_x' : k === 'resendFrom' ? 'infra@bellum.test' : undefined),
  } as unknown as ConfigService
  const svc = new AlertesInfraService(prometheus, lecture, config, redis as never)
  /** Un tour complet : le verrou d'évaluation expire entre deux tours de 5 min. */
  const tour = async () => {
    redis.kv.delete('bellum:supervision-alertes:verrou')
    await svc.evaluer()
  }
  return { svc, redis, tour, prometheus }
}

describe('AlertesInfraService', () => {
  const sauve: Record<string, string | undefined> = {}
  let maintenant = 1_800_000_000_000

  beforeEach(() => {
    for (const k of ENV) sauve[k] = process.env[k]
    process.env['GRAFANA_PROM_URL'] = 'https://prom.test'
    process.env['GRAFANA_PROM_USER'] = '1'
    process.env['GRAFANA_PROM_READ_TOKEN'] = 'jeton'
    process.env['NODE_ENV'] = 'production'
    process.env['BACKOFFICE_ALERT_EMAILS'] = 'equipe@bellum.test, autre@bellum.test'
    delete process.env['SUPABASE_URL']
    delete process.env['SUPABASE_SERVICE_ROLE_KEY']
    delete process.env['RAILWAY_METRICS_TOKEN']
    maintenant = 1_800_000_000_000
    jest.spyOn(Date, 'now').mockImplementation(() => maintenant)
    envoyer.mockReset().mockResolvedValue({ error: null })
  })

  afterEach(() => {
    jest.restoreAllMocks()
    for (const k of ENV) {
      if (sauve[k] === undefined) delete process.env[k]
      else process.env[k] = sauve[k]
    }
  })

  const avance = (min: number) => {
    maintenant += min * 60_000
  }
  const sujets = () => envoyer.mock.calls.map(c => (c[0] as { subject: string }).subject)

  it('LIT la table : sept règles, chacune avec seuil, durée et message', () => {
    expect(REGLES_ALERTES.map(r => r.id)).toEqual([
      'runner_muet',
      'runner_disque',
      'supabase_disque',
      'supabase_connexions',
      'dispo_cible',
      'tls_expire',
      'supervision_injoignable',
    ])
    for (const r of REGLES_ALERTES) expect(r.message.length).toBeGreaterThan(10)
  })

  it('seuil SANS durée ⇒ pas d’alerte ; le seuil tenu 15 min ⇒ une alerte', async () => {
    const { tour } = monter(() => ({ hote_disque_pct: serie('host', { 'runner-1': 90 }) }))
    await tour()
    avance(5)
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
    avance(10)
    await tour()
    expect(envoyer).toHaveBeenCalledTimes(2) // 2 destinataires, UN incident
    expect(sujets()[0]).toMatch(/^\[Infra\] ouvert — runner_disque \(runner-1\)$/)
  })

  it('retour sous le seuil avant la durée ⇒ le compteur repart de zéro', async () => {
    let v = 90
    const { tour } = monter(() => ({ hote_disque_pct: serie('host', { r1: v }) }))
    await tour()
    avance(10)
    v = 50
    await tour()
    v = 90
    avance(10)
    await tour()
    avance(10)
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
  })

  it('ouverture ⇒ 1 envoi ; répétition ⇒ 0 ; résolution ⇒ 1', async () => {
    let fraicheur = 900
    const { tour } = monter(() => ({ hote_silence_sec: serie('host', { 'runner-2': fraicheur }) }))
    await tour()
    expect(envoyer).toHaveBeenCalledTimes(2)
    const corps = (envoyer.mock.calls[0]![0] as { text: string }).text
    expect(corps).toContain('runner_muet')
    expect(corps).toContain('runner-2')
    expect(corps).toContain('900')
    expect(corps).toContain('600')
    expect(corps).toContain('/supervision?onglet=runners')
    envoyer.mockClear()
    avance(5)
    await tour()
    avance(5)
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
    fraicheur = 20
    avance(5)
    await tour()
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(sujets()[0]).toMatch(/^\[Infra\] résolu — runner_muet/)
    envoyer.mockClear()
    avance(5)
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
  })

  it('le destinataire est BACKOFFICE_ALERT_EMAILS seulement ; sans elle, rien ne part', async () => {
    const donnees = () => ({ hote_silence_sec: serie('host', { r: 999 }) })
    const a = monter(donnees)
    await a.tour()
    expect(envoyer.mock.calls.map(c => (c[0] as { to: string[] }).to)).toEqual([
      ['equipe@bellum.test'],
      ['autre@bellum.test'],
    ])
    envoyer.mockClear()
    delete process.env['BACKOFFICE_ALERT_EMAILS']
    const b = monter(donnees)
    await b.tour()
    expect(envoyer).not.toHaveBeenCalled()
  })

  it('hors production ou interrupteur coupé ⇒ calculé, rien n’est envoyé', async () => {
    process.env['NODE_ENV'] = 'test'
    const { tour, svc } = monter(() => ({ hote_silence_sec: serie('host', { r: 999 }) }))
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
    const lus = await svc.incidents()
    expect(lus.etat === 'mesure' && lus.incidents).toHaveLength(1)
  })

  it('deux évaluations CONCURRENTES (deux réplicas) ⇒ un seul envoi', async () => {
    const redis = faux()
    const donnees = () => ({ hote_silence_sec: serie('host', { r: 999 }) })
    const a = monter(donnees, undefined, redis)
    const b = monter(donnees, undefined, redis)
    await Promise.all([a.svc.evaluer(), b.svc.evaluer()])
    expect(envoyer).toHaveBeenCalledTimes(2) // 1 incident × 2 destinataires, pas 4
    // Même sans le verrou d’évaluation, l’ouverture reste atomique (SET NX).
    redis.kv.delete('bellum:supervision-alertes:verrou')
    await b.svc.evaluer()
    expect(envoyer).toHaveBeenCalledTimes(2)
  })

  it('valeur absente (null) ⇒ NON ÉVALUABLE : ni ouverture, ni résolution', async () => {
    let v: number | null = null
    const { tour, svc } = monter(() => ({ hote_silence_sec: serie('host', { r: v }) }))
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
    v = 999
    avance(5)
    await tour()
    expect(envoyer).toHaveBeenCalledTimes(2)
    envoyer.mockClear()
    v = null
    avance(5)
    await tour()
    expect(envoyer).not.toHaveBeenCalled() // pas de « résolu » sur un null
    const lus = await svc.incidents()
    expect(lus.etat === 'mesure' && lus.incidents).toHaveLength(1)
  })

  it('un hôte qui DISPARAÎT de la mesure garde son incident ouvert', async () => {
    let d: Donnees = { hote_silence_sec: serie('host', { r: 999 }) }
    const { tour, svc } = monter(() => d)
    await tour()
    envoyer.mockClear()
    d = { hote_silence_sec: serie('host', {}) }
    avance(5)
    await tour()
    expect(envoyer).not.toHaveBeenCalled()
    const lus = await svc.incidents()
    expect(lus.etat === 'mesure' && lus.incidents).toHaveLength(1)
  })

  it('dispo_cible : ≥ 2 runners en échec sur 2 évaluations consécutives ; 1 seul runner ⇒ jamais', async () => {
    let ok = 2
    const { tour } = monter(() => ({
      dispo_hotes_ok: serie('cible', { api: ok, web: 3 }),
      dispo_hotes_total: serie('cible', { api: 4, web: 4 }),
    }))
    await tour() // api : 2 en échec, 1re évaluation
    expect(envoyer).not.toHaveBeenCalled()
    avance(5)
    await tour() // 2e évaluation consécutive
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(sujets()[0]).toContain('dispo_cible (api)') // web : 1 runner sur 4 ⇒ rien
    envoyer.mockClear()
    ok = 4
    avance(5)
    await tour()
    expect(sujets()[0]).toMatch(/résolu — dispo_cible \(api\)/)
  })

  it('tls_expire : certificat à moins de 14 jours', async () => {
    const { tour } = monter(() => ({ dispo_tls_jours: serie('cible', { site: 10, web: 40 }) }))
    await tour()
    expect(envoyer).toHaveBeenCalledTimes(2)
    expect(sujets()[0]).toContain('tls_expire (site)')
  })

  it('supervision_injoignable : UN incident, et les règles Grafana sont SUSPENDUES', async () => {
    let grafana: 'ok' | 'panne' = 'ok'
    const { tour } = monter(() => ({
      hote_silence_sec: grafana === 'ok' ? serie('host', { r: 999 }) : { etat: 'injoignable', raison: 'HTTP 502' },
      hote_disque_pct: grafana === 'ok' ? serie('host', { r: 10 }) : { etat: 'injoignable', raison: 'HTTP 502' },
      dispo_tls_jours: serie('cible', { site: 3 }), // mesuré mais Grafana KO ailleurs
    }))
    // Grafana répond : on s'enregistre comme « vu », et le runner muet s'ouvre.
    await tour()
    expect(sujets()[0]).toContain('runner_muet')
    envoyer.mockClear()
    grafana = 'panne'
    for (let i = 0; i < 5; i++) {
      avance(5)
      await tour()
    }
    const s = sujets()
    expect(s.filter(x => x.includes('supervision_injoignable'))).toHaveLength(2) // 1 incident × 2 destinataires
    expect(s.filter(x => !x.includes('supervision_injoignable'))).toHaveLength(0) // aucune autre règle
    envoyer.mockClear()
    grafana = 'ok'
    avance(5)
    await tour()
    expect(sujets().some(x => x.includes('résolu — supervision_injoignable'))).toBe(true)
  })

  it('Grafana non configuré alors qu’il l’était ⇒ incident ; jamais configuré ⇒ silence', async () => {
    process.env['SUPABASE_URL'] = 'https://x.supabase.co'
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'cle'
    const nc: ResultatPrometheus = { etat: 'non_configure' }
    const donnees = () => ({
      hote_silence_sec: nc,
      hote_disque_pct: nc,
      dispo_hotes_ok: nc,
      dispo_hotes_total: nc,
      dispo_tls_jours: nc,
    })
    const jamais = monter(donnees)
    await jamais.tour()
    avance(5)
    await jamais.tour()
    expect(envoyer).not.toHaveBeenCalled()
    const vu = monter(donnees)
    await vu.redis.set('bellum:supervision-alertes:grafana-vu', 'x')
    await vu.tour()
    avance(5)
    await vu.tour()
    expect(sujets()[0]).toContain('supervision_injoignable')
  })

  describe('Supabase', () => {
    const mesure = (over: {
      usage?: number | null
      total?: number | null
      max?: number | null
      perime?: boolean
    }): SupabaseServi =>
      ({
        etat: 'mesure',
        mesureA: 'x',
        lueA: 1,
        ageSec: 0,
        perime: over.perime ?? false,
        instance: {
          coeurs: 2,
          cpuPct: 1,
          cpuPremiereLecture: false,
          load1: 1,
          memPct: 1,
          memTotalOctets: 1,
          disques: [{ mountpoint: '/data', tailleOctets: 1, libreOctets: 1, usagePct: over.usage ?? null }],
        },
        connexions: {
          backendsTotal: over.total ?? null,
          backendsParBase: [],
          maxConnections: over.max ?? null,
          pgbouncer: [],
        },
        volumes: [],
        absentes: [],
      }) as SupabaseServi

    beforeEach(() => {
      process.env['SUPABASE_URL'] = 'https://x.supabase.co'
      process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'cle'
    })

    it('supabase_disque : un point de montage > 85 %', async () => {
      const { tour } = monter(
        () => ({}),
        () => mesure({ usage: 91 }),
      )
      await tour()
      expect(sujets()[0]).toContain('supabase_disque (/data)')
    })

    it('supabase_connexions : > 80 % de max_connections pendant 10 min', async () => {
      const { tour } = monter(
        () => ({}),
        () => mesure({ total: 90, max: 100 }),
      )
      await tour()
      avance(5)
      await tour()
      expect(envoyer).not.toHaveBeenCalled()
      avance(5)
      await tour()
      expect(sujets()[0]).toContain('supabase_connexions (postgres)')
    })

    it('mesure périmée, max_connections inconnu ou disque inconnu ⇒ non évaluable', async () => {
      const a = monter(
        () => ({}),
        () => mesure({ usage: 99, total: 99, max: 100, perime: true }),
      )
      await a.tour()
      const b = monter(
        () => ({}),
        () => mesure({ usage: null, total: 99, max: null }),
      )
      await b.tour()
      expect(envoyer).not.toHaveBeenCalled()
    })
  })

  describe('incidents() et minuteur', () => {
    it('Redis injoignable ⇒ « illisible », jamais une liste vide', async () => {
      const { svc, redis } = monter(() => ({}))
      expect(await svc.incidents()).toEqual({ etat: 'mesure', incidents: [] })
      redis.panne = true
      expect(await svc.incidents()).toEqual({ etat: 'illisible' })
    })

    it('aucun minuteur sans Grafana, Railway ni Supabase ; un minuteur dès qu’un est configuré', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval')
      for (const k of ['GRAFANA_PROM_URL', 'GRAFANA_PROM_USER', 'GRAFANA_PROM_READ_TOKEN']) delete process.env[k]
      const { svc } = monter(() => ({}))
      svc.onModuleInit()
      expect(setIntervalSpy).not.toHaveBeenCalled()
      process.env['SUPABASE_URL'] = 'https://x.supabase.co'
      process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'cle'
      svc.onModuleInit()
      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
      void svc.onModuleDestroy()
    })

    it('rien n’est évalué ni lu sans configuration', async () => {
      for (const k of ['GRAFANA_PROM_URL', 'GRAFANA_PROM_USER', 'GRAFANA_PROM_READ_TOKEN']) delete process.env[k]
      const { svc, prometheus } = monter(() => ({}))
      await svc.evaluer()
      expect(prometheus.interroger).not.toHaveBeenCalled()
    })
  })
})
