import type { Echantillon } from './supabase-metrics.parser'
import type { ResultatMetriquesSupabase, SupabaseMetricsClient } from './supabase-metrics.client'
import { SupabaseSupervisionService } from './supabase.service'

const e = (nom: string, valeur: number | null, labels: Record<string, string> = {}): Echantillon => ({
  nom,
  labels,
  valeur,
})

function cpu(idle0: number, idle1: number, autre0: number, autre1: number): Echantillon[] {
  return [
    e('node_cpu_seconds_total', idle0, { cpu: '0', mode: 'idle' }),
    e('node_cpu_seconds_total', autre0, { cpu: '0', mode: 'user' }),
    e('node_cpu_seconds_total', idle1, { cpu: '1', mode: 'idle' }),
    e('node_cpu_seconds_total', autre1, { cpu: '1', mode: 'system' }),
  ]
}

function client(...lectures: ResultatMetriquesSupabase[]): SupabaseMetricsClient {
  const lire = jest.fn()
  for (const l of lectures) lire.mockResolvedValueOnce(l)
  return { lire } as unknown as SupabaseMetricsClient
}

const mesure = (lueA: number, echantillons: Echantillon[]): ResultatMetriquesSupabase => ({
  etat: 'mesure',
  lueA,
  echantillons,
})

describe('SupabaseSupervisionService', () => {
  it('relaie non_configure et injoignable tels quels', async () => {
    await expect(new SupabaseSupervisionService(client({ etat: 'non_configure' })).supabase()).resolves.toEqual({
      etat: 'non_configure',
    })
    await expect(
      new SupabaseSupervisionService(client({ etat: 'injoignable', raison: 'HTTP 500' })).supabase(),
    ).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 500' })
  })

  it('CPU : null à la 1re lecture (marquée), calculé à la 2e sur le delta, cœurs = cpu distincts', async () => {
    const svc = new SupabaseSupervisionService(
      client(
        mesure(1_000, cpu(100, 100, 0, 0)),
        // Δidle = 60+60 = 120 ; Δtotal = 120 + 40 + 40 = 200 ⇒ CPU 40 %
        mesure(11_000, cpu(160, 160, 40, 40)),
      ),
    )
    const r1 = await svc.supabase()
    if (r1.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r1.instance.cpuPct).toBeNull()
    expect(r1.instance.cpuPremiereLecture).toBe(true)
    expect(r1.instance.coeurs).toBe(2)
    const r2 = await svc.supabase()
    if (r2.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r2.instance.cpuPct).toBeCloseTo(40, 5)
    expect(r2.instance.cpuPremiereLecture).toBe(false)
  })

  it('CPU : même lecture (cache) ⇒ garde la référence précédente, pas de division par zéro', async () => {
    const lecture = mesure(11_000, cpu(160, 160, 40, 40))
    const svc = new SupabaseSupervisionService(client(mesure(1_000, cpu(100, 100, 0, 0)), lecture, lecture))
    await svc.supabase()
    const a = await svc.supabase()
    const b = await svc.supabase()
    if (a.etat !== 'mesure' || b.etat !== 'mesure') throw new Error('attendu mesure')
    expect(b.instance.cpuPct).toBeCloseTo(a.instance.cpuPct as number, 5)
  })

  it('CPU : compteur qui recule (redémarrage) ⇒ null, jamais négatif', async () => {
    const svc = new SupabaseSupervisionService(
      client(mesure(1_000, cpu(500, 500, 100, 100)), mesure(11_000, cpu(10, 10, 5, 5))),
    )
    await svc.supabase()
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.instance.cpuPct).toBeNull()
  })

  it('métriques absentes ⇒ null et NOMMÉES dans absentes, jamais 0', async () => {
    const svc = new SupabaseSupervisionService(client(mesure(1, [e('node_load1', 0.3)])))
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.instance.load1).toBe(0.3)
    expect(r.instance.memPct).toBeNull()
    expect(r.instance.disques).toEqual([])
    expect(r.connexions.backendsTotal).toBeNull()
    expect(r.connexions.maxConnections).toBeNull()
    expect(r.connexions.pgbouncer).toEqual([])
    expect(r.volumes).toEqual([])
    expect(r.absentes).toEqual(
      expect.arrayContaining([
        'node_cpu_seconds_total',
        'node_memory_MemTotal_bytes',
        'node_filesystem_size_bytes',
        'pg_stat_database_num_backends',
        'pg_settings_max_connections',
        'pg_database_size_bytes',
        'pgbouncer_pools_client_active_connections',
      ]),
    )
    expect(r.absentes).not.toContain('node_load1')
  })

  it('mémoire %, disques PAR point de montage, connexions et volumes par base', async () => {
    const svc = new SupabaseSupervisionService(
      client(
        mesure(1, [
          e('node_memory_MemTotal_bytes', 1000),
          e('node_memory_MemAvailable_bytes', 250),
          e('node_filesystem_size_bytes', 100, { mountpoint: '/data' }),
          e('node_filesystem_avail_bytes', 40, { mountpoint: '/data' }),
          e('node_filesystem_size_bytes', 10, { mountpoint: '/' }),
          e('node_filesystem_avail_bytes', 0, { mountpoint: '/' }),
          e('pg_stat_database_num_backends', 5, { datname: 'postgres' }),
          e('pg_stat_database_num_backends', 2, { datname: 'auth' }),
          e('pg_settings_max_connections', 60),
          e('pg_database_size_bytes', 111, { datname: 'postgres' }),
          e('pgbouncer_pools_client_active_connections', 3, { database: 'pgb', user: 'u' }),
          e('pgbouncer_pools_client_waiting_connections', 0, { database: 'pgb', user: 'u' }),
          e('pgbouncer_pools_server_active_connections', 2, { database: 'pgb', user: 'u' }),
          e('pgbouncer_databases_pool_size', 15, { database: 'pgb' }),
        ]),
      ),
    )
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.instance.memPct).toBeCloseTo(75, 5)
    expect(r.instance.disques).toEqual([
      { mountpoint: '/', tailleOctets: 10, libreOctets: 0, usagePct: 100 },
      { mountpoint: '/data', tailleOctets: 100, libreOctets: 40, usagePct: 60 },
    ])
    expect(r.connexions.backendsTotal).toBe(7)
    expect(r.connexions.backendsParBase).toEqual([
      { base: 'auth', backends: 2 },
      { base: 'postgres', backends: 5 },
    ])
    expect(r.connexions.maxConnections).toBe(60)
    expect(r.volumes).toEqual([{ base: 'postgres', octets: 111 }])
    expect(r.connexions.pgbouncer).toEqual([
      { base: 'pgb', utilisateur: 'u', clientsActifs: 3, clientsEnAttente: 0, serveursActifs: 2, taillePool: 15 },
    ])
    expect(r.absentes).not.toContain('pg_settings_max_connections')
  })

  it('une valeur NaN (null) n’est pas comptée comme 0 dans le total des backends', async () => {
    const svc = new SupabaseSupervisionService(
      client(
        mesure(1, [
          e('pg_stat_database_num_backends', null, { datname: 'a' }),
          e('pg_stat_database_num_backends', null, { datname: 'b' }),
        ]),
      ),
    )
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.connexions.backendsTotal).toBeNull()
  })

  // Lecture de fond 30/09 : le label de base n'est pas garanti sur l'endpoint.
  it.each(['datname', 'database', 'db', 'datid'])('nom de base : prend le label %s', async label => {
    const svc = new SupabaseSupervisionService(
      client(mesure(1, [e('pg_stat_database_num_backends', 4, { [label]: 'postgres' })])),
    )
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.connexions.backendsParBase).toEqual([{ base: 'postgres', backends: 4 }])
  })

  it('nom de base : aucun label connu ⇒ « (sans nom) »', async () => {
    const svc = new SupabaseSupervisionService(
      client(mesure(1, [e('pg_stat_database_num_backends', 4, { autre: 'x' })])),
    )
    const r = await svc.supabase()
    if (r.etat !== 'mesure') throw new Error('attendu mesure')
    expect(r.connexions.backendsParBase).toEqual([{ base: '(sans nom)', backends: 4 }])
  })
})
