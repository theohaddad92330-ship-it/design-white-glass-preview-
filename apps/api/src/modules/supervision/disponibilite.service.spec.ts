import type { IaClient } from '../ia/ia.client'
import { REQUETES, type IdRequete, type PrometheusClient, type ResultatPrometheus } from './prometheus.client'
import { DisponibiliteService } from './disponibilite.service'

const ENV_SAUVEE = { ...process.env }

function inst(cible: string, v: number | null) {
  return { labels: { cible }, points: [{ t: 1, v }] }
}

function client(reponses: Partial<Record<IdRequete, ResultatPrometheus>>, parDefaut?: ResultatPrometheus) {
  const interroger = jest.fn(async (id: IdRequete) => reponses[id] ?? parDefaut ?? { etat: 'mesure', series: [] })
  return { interroger } as unknown as PrometheusClient & { interroger: jest.Mock }
}

function ia(commit: string | null): IaClient {
  return {
    version: jest.fn(async () => (commit ? { commit, environment: 'production' } : null)),
  } as unknown as IaClient
}

afterEach(() => {
  process.env = { ...ENV_SAUVEE }
})

describe('les requêtes de disponibilité sont en liste blanche', () => {
  it('chaque id a une PromQL sur probe_* filtrée role="ci-runner"', () => {
    const ids = [
      'dispo_hotes_ok',
      'dispo_hotes_total',
      'dispo_24h_pct',
      'dispo_latence_p50_ms',
      'dispo_latence_max_ms',
      'dispo_tls_jours',
      'serie_dispo_24h',
    ] as const
    for (const id of ids) {
      expect(REQUETES).toHaveProperty(id)
      expect(REQUETES[id].promql).toContain('probe_')
      expect(REQUETES[id].promql).toContain('by (cible)')
    }
    expect(REQUETES.serie_dispo_24h.type).toBe('range')
  })
})

describe('DisponibiliteService.disponibilite', () => {
  it('non_configure quand le client ne l’est pas', async () => {
    const svc = new DisponibiliteService(client({}, { etat: 'non_configure' }), ia(null))
    await expect(svc.disponibilite()).resolves.toEqual({ etat: 'non_configure' })
  })

  it('injoignable quand TOUTES les requêtes échouent', async () => {
    const svc = new DisponibiliteService(client({}, { etat: 'injoignable', raison: 'HTTP 401' }), ia(null))
    await expect(svc.disponibilite()).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
  })

  it('aucune série probe_* ⇒ sondesDeployees=false et TOUT est null (jamais 0)', async () => {
    const svc = new DisponibiliteService(client({}), ia(null))
    const r = await svc.disponibilite()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.sondesDeployees).toBe(false)
    expect(r.cibles.length).toBeGreaterThan(0)
    for (const c of r.cibles) {
      expect(c).toEqual({
        cible: c.cible,
        hotesOk: null,
        hotesTotal: null,
        dispo24hPct: null,
        latenceP50Ms: null,
        latenceMaxMs: null,
        tlsJours: null,
        serie: [],
      })
    }
  })

  it('assemble les mesures par cible ; un hôte KO reste visible (hotesOk < hotesTotal)', async () => {
    const svc = new DisponibiliteService(
      client({
        dispo_hotes_ok: { etat: 'mesure', series: [inst('api', 3), inst('web', 4)] },
        dispo_hotes_total: { etat: 'mesure', series: [inst('api', 4), inst('web', 4)] },
        dispo_24h_pct: { etat: 'mesure', series: [inst('api', 99.5), inst('web', 0)] },
        dispo_latence_p50_ms: { etat: 'mesure', series: [inst('api', 120)] },
        dispo_latence_max_ms: { etat: 'mesure', series: [inst('api', 480)] },
        dispo_tls_jours: { etat: 'mesure', series: [inst('api', 45.4)] },
        serie_dispo_24h: {
          etat: 'mesure',
          series: [
            {
              labels: { cible: 'api' },
              points: [
                { t: 1, v: 1 },
                { t: 2, v: null },
              ],
            },
          ],
        },
      }),
      ia(null),
    )
    const r = await svc.disponibilite()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.sondesDeployees).toBe(true)
    const api = r.cibles.find(c => c.cible === 'api')
    expect(api).toEqual({
      cible: 'api',
      hotesOk: 3,
      hotesTotal: 4,
      dispo24hPct: 99.5,
      latenceP50Ms: 120,
      latenceMaxMs: 480,
      tlsJours: 45.4,
      serie: [
        { t: 1, v: 1 },
        { t: 2, v: null },
      ],
    })
    // Un 0 mesuré (site à 0 % de dispo 24 h) reste 0 ; l'absence reste null.
    const web = r.cibles.find(c => c.cible === 'web')
    expect(web).toMatchObject({ hotesOk: 4, dispo24hPct: 0, latenceP50Ms: null, tlsJours: null })
  })

  it('commit servi : API lue sur l’env, IA sur son /version, main « non mesuré » (null)', async () => {
    delete process.env['SENTRY_RELEASE']
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'abc1234'
    const svc = new DisponibiliteService(client({}), ia('def5678'))
    const r = await svc.disponibilite()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.commits).toEqual({ api: 'abc1234', ia: 'def5678', main: null })
  })

  it('commit servi : env absent et IA muette ⇒ null, jamais « unknown »', async () => {
    delete process.env['SENTRY_RELEASE']
    delete process.env['RAILWAY_GIT_COMMIT_SHA']
    delete process.env['GIT_COMMIT']
    const svc = new DisponibiliteService(client({}), ia(null))
    const r = await svc.disponibilite()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.commits).toEqual({ api: null, ia: null, main: null })
  })
})
