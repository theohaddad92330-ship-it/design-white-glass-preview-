import { Logger } from '@nestjs/common'
import type { DataSource } from 'typeorm'
import { LectureDeFondService } from './lecture-de-fond.service'
import { TARIFS_RAILWAY } from './railway-tarifs'
import type { RailwaySupervisionService, SupervisionRailway } from './railway.service'
import type { ResultatMetriquesSupabase, SupabaseMetricsClient } from './supabase-metrics.client'
import type { Echantillon } from './supabase-metrics.parser'
import { SupabaseSupervisionService } from './supabase.service'

const ENV_KEYS = [
  'RAILWAY_METRICS_TOKEN',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_ENVIRONMENT_ID',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const
const UUID = '35efdac2-af65-42a5-88f8-35ed9c40a254'

function configurer(quoi: 'railway' | 'supabase'): void {
  if (quoi === 'railway') {
    process.env['RAILWAY_METRICS_TOKEN'] = 'jeton'
    process.env['RAILWAY_PROJECT_ID'] = UUID
    process.env['RAILWAY_ENVIRONMENT_ID'] = UUID
  } else {
    process.env['SUPABASE_URL'] = 'https://x.supabase.co'
    process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'cle'
  }
}

const railwayMesure = (n: number): SupervisionRailway => ({
  etat: 'mesure',
  mesureA: new Date(Date.now()).toISOString(),
  fenetre: '24h',
  services: [
    {
      id: `s${n}`,
      nom: 'api',
      cpuMoyen: n,
      cpuMax: n,
      memMoyenneGo: 1,
      memMaxGo: 1,
      limiteCpu: null,
      limiteMemGo: null,
      coutMensuelEstimeUsd: null,
      points: { cpu: [], mem: [] },
    },
  ],
  totalEstimeUsd: null,
  totalPartiel: true,
  tarifs: TARIFS_RAILWAY,
  nonEvalue: [],
})

function fauxRailway(...reponses: Array<SupervisionRailway | Error>): {
  svc: RailwaySupervisionService
  railway: jest.Mock
} {
  const railway = jest.fn()
  for (const r of reponses) {
    if (r instanceof Error) railway.mockRejectedValueOnce(r)
    else railway.mockResolvedValueOnce(r)
  }
  return { svc: { railway } as unknown as RailwaySupervisionService, railway }
}

const e = (nom: string, valeur: number | null, labels: Record<string, string> = {}): Echantillon => ({
  nom,
  labels,
  valeur,
})
const cpuEch = (idle: number, user: number): Echantillon[] => [
  e('node_cpu_seconds_total', idle, { cpu: '0', mode: 'idle' }),
  e('node_cpu_seconds_total', user, { cpu: '0', mode: 'user' }),
]
const lecture = (lueA: number, echantillons: Echantillon[]): ResultatMetriquesSupabase => ({
  etat: 'mesure',
  lueA,
  echantillons,
})

function fauxSupabase(...lectures: ResultatMetriquesSupabase[]): {
  svc: SupabaseSupervisionService
  lire: jest.Mock
} {
  const lire = jest.fn()
  for (const l of lectures) lire.mockResolvedValueOnce(l)
  return { svc: new SupabaseSupervisionService({ lire } as unknown as SupabaseMetricsClient), lire }
}

describe('LectureDeFondService', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
    jest.useFakeTimers()
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('NO-OP strict : sans configuration le minuteur ne démarre pas et rien n’est lu', async () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval')
    const r = fauxRailway()
    const s = fauxSupabase()
    const svc = new LectureDeFondService(r.svc, s.svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(180_000)
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(r.railway).not.toHaveBeenCalled()
    expect(s.lire).not.toHaveBeenCalled()
    await expect(svc.railway()).resolves.toEqual({ etat: 'non_configure' })
    await expect(svc.supabase()).resolves.toEqual({ etat: 'non_configure' })
    svc.onModuleDestroy()
  })

  it('lit au démarrage puis toutes les 60 s ; onModuleDestroy arrête le minuteur', async () => {
    configurer('railway')
    const r = fauxRailway(railwayMesure(1), railwayMesure(2), railwayMesure(3))
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    expect(r.railway).toHaveBeenCalledTimes(1)
    expect(r.railway).toHaveBeenCalledWith('24h')
    await jest.advanceTimersByTimeAsync(60_000)
    expect(r.railway).toHaveBeenCalledTimes(2)
    svc.onModuleDestroy()
    await jest.advanceTimersByTimeAsync(300_000)
    expect(r.railway).toHaveBeenCalledTimes(2)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('la route sert l’état SANS appel réseau : mesure + lueA + ageSec, perime faux', async () => {
    configurer('railway')
    const r = fauxRailway(railwayMesure(1))
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(12_000)
    const a = await svc.railway('24h')
    const b = await svc.railway()
    expect(r.railway).toHaveBeenCalledTimes(1)
    if (a.etat !== 'mesure' || b.etat !== 'mesure') throw new Error('mesure attendue')
    expect(a.ageSec).toBe(12)
    expect(a.perime).toBe(false)
    expect(a.derniereErreur).toBeUndefined()
    expect(a.services[0]?.id).toBe('s1')
    svc.onModuleDestroy()
  })

  it('avant toute lecture achevée : en_attente (première lecture en cours)', async () => {
    configurer('railway')
    let fini: (v: SupervisionRailway) => void = () => undefined
    const railway = jest.fn().mockReturnValue(new Promise<SupervisionRailway>(res => (fini = res)))
    const svc = new LectureDeFondService({ railway } as unknown as RailwaySupervisionService, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    await expect(svc.railway()).resolves.toEqual({ etat: 'en_attente' })
    fini(railwayMesure(1))
    await jest.advanceTimersByTimeAsync(0)
    expect((await svc.railway()).etat).toBe('mesure')
    svc.onModuleDestroy()
  })

  it('première tentative en échec, aucune mesure : injoignable nommé (pas d’attente éternelle)', async () => {
    configurer('railway')
    const r = fauxRailway({ etat: 'injoignable', raison: 'HTTP 500' })
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    await expect(svc.railway()).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 500' })
    svc.onModuleDestroy()
  })

  it('la mesure est GARDÉE si la tentative suivante échoue : etat mesure + derniereErreur fixe', async () => {
    configurer('railway')
    const r = fauxRailway(
      railwayMesure(1),
      { etat: 'injoignable', raison: 'délai dépassé (20 s)' },
      new Error('secret'),
    )
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    await jest.advanceTimersByTimeAsync(60_000)
    const a = await svc.railway()
    if (a.etat !== 'mesure') throw new Error('mesure attendue')
    expect(a.derniereErreur).toBe('délai dépassé (20 s)')
    expect(a.services[0]?.id).toBe('s1')
    expect(a.ageSec).toBe(60)
    // une exception ne fuit pas son message
    await jest.advanceTimersByTimeAsync(60_000)
    const b = await svc.railway()
    if (b.etat !== 'mesure') throw new Error('mesure attendue')
    expect(b.derniereErreur).toBe('lecture impossible')
    expect(JSON.stringify(b)).not.toContain('secret')
    svc.onModuleDestroy()
  })

  it('une lecture réussie efface derniereErreur', async () => {
    configurer('railway')
    const r = fauxRailway(railwayMesure(1), { etat: 'injoignable', raison: 'HTTP 502' }, railwayMesure(2))
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(120_000)
    const a = await svc.railway()
    if (a.etat !== 'mesure') throw new Error('mesure attendue')
    expect(a.derniereErreur).toBeUndefined()
    expect(a.services[0]?.id).toBe('s2')
    svc.onModuleDestroy()
  })

  it('perime : vrai au-delà de 300 s sans lecture réussie', async () => {
    configurer('railway')
    const echec: SupervisionRailway = { etat: 'injoignable', raison: 'HTTP 500' }
    const r = fauxRailway(railwayMesure(1), echec, echec, echec, echec, echec, echec)
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(300_000)
    const a = await svc.railway()
    if (a.etat !== 'mesure') throw new Error('mesure attendue')
    expect(a.ageSec).toBe(300)
    expect(a.perime).toBe(false)
    await jest.advanceTimersByTimeAsync(1_000)
    const b = await svc.railway()
    if (b.etat !== 'mesure') throw new Error('mesure attendue')
    expect(b.perime).toBe(true)
    svc.onModuleDestroy()
  })

  it('autre fenêtre (?fenetre=7j) : à la demande, hors état de fond', async () => {
    configurer('railway')
    const r = fauxRailway(railwayMesure(1), railwayMesure(7))
    const svc = new LectureDeFondService(r.svc, fauxSupabase().svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    const sept = await svc.railway('7j')
    expect(r.railway).toHaveBeenLastCalledWith('7j')
    if (sept.etat !== 'mesure') throw new Error('mesure attendue')
    expect(sept.services[0]?.id).toBe('s7')
    svc.onModuleDestroy()
  })

  it('CPU Supabase : null à la 1re lecture de fond, calculé à la 2e (~60 s après)', async () => {
    configurer('supabase')
    const s = fauxSupabase(
      lecture(1_000, cpuEch(100, 0)),
      // Δidle 60, Δtotal 100 ⇒ 40 %
      lecture(61_000, cpuEch(160, 40)),
    )
    const svc = new LectureDeFondService(fauxRailway().svc, s.svc)
    svc.onModuleInit()
    await jest.advanceTimersByTimeAsync(0)
    const a = await svc.supabase()
    if (a.etat !== 'mesure') throw new Error('mesure attendue')
    expect(a.instance.cpuPct).toBeNull()
    expect(a.instance.cpuPremiereLecture).toBe(true)
    await jest.advanceTimersByTimeAsync(60_000)
    const b = await svc.supabase()
    if (b.etat !== 'mesure') throw new Error('mesure attendue')
    expect(b.instance.cpuPct).toBeCloseTo(40, 5)
    expect(b.instance.cpuPremiereLecture).toBe(false)
    // la route n'a pas lu : seulement les deux lectures de fond
    expect(s.lire).toHaveBeenCalledTimes(2)
    svc.onModuleDestroy()
  })

  describe('max_connections en repli (SHOW max_connections)', () => {
    it('métrique absente ⇒ SHOW une seule fois, valeur mémorisée', async () => {
      configurer('supabase')
      const query = jest.fn().mockResolvedValue([{ max_connections: '60' }])
      const s = fauxSupabase(lecture(1_000, cpuEch(1, 1)), lecture(61_000, cpuEch(2, 2)))
      const svc = new LectureDeFondService(fauxRailway().svc, s.svc, { query } as unknown as DataSource)
      svc.onModuleInit()
      await jest.advanceTimersByTimeAsync(60_000)
      const a = await svc.supabase()
      if (a.etat !== 'mesure') throw new Error('mesure attendue')
      expect(a.connexions.maxConnections).toBe(60)
      expect(query).toHaveBeenCalledTimes(1)
      expect(query).toHaveBeenCalledWith('SHOW max_connections')
      // Le repli a MESURÉ la valeur : elle n'est plus absente, sinon l'écran
      // afficherait « mesure partielle » sur une mesure complète.
      expect(a.absentes).not.toContain('pg_settings_max_connections')
      svc.onModuleDestroy()
    })

    it('métrique présente ⇒ pas de SHOW', async () => {
      configurer('supabase')
      const query = jest.fn()
      const s = fauxSupabase(lecture(1_000, [e('pg_settings_max_connections', 90)]))
      const svc = new LectureDeFondService(fauxRailway().svc, s.svc, { query } as unknown as DataSource)
      svc.onModuleInit()
      await jest.advanceTimersByTimeAsync(0)
      const a = await svc.supabase()
      if (a.etat !== 'mesure') throw new Error('mesure attendue')
      expect(a.connexions.maxConnections).toBe(90)
      expect(query).not.toHaveBeenCalled()
      svc.onModuleDestroy()
    })

    it('SHOW en échec ⇒ null, jamais 0, message non propagé', async () => {
      configurer('supabase')
      const query = jest.fn().mockRejectedValue(new Error('password=hunter2'))
      const s = fauxSupabase(lecture(1_000, cpuEch(1, 1)))
      const svc = new LectureDeFondService(fauxRailway().svc, s.svc, { query } as unknown as DataSource)
      svc.onModuleInit()
      await jest.advanceTimersByTimeAsync(0)
      const a = await svc.supabase()
      if (a.etat !== 'mesure') throw new Error('mesure attendue')
      expect(a.connexions.maxConnections).toBeNull()
      expect(a.absentes).toContain('pg_settings_max_connections')
      expect(JSON.stringify(a)).not.toContain('hunter2')
      svc.onModuleDestroy()
    })
  })
})
