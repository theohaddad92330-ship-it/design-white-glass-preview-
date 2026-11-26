import type { IdRequete, PrometheusClient, ResultatPrometheus, SerieMesuree } from './prometheus.client'
import { SupervisionService } from './supervision.service'

function inst(labels: Record<string, string>, v: number | null): SerieMesuree {
  return { labels, points: [{ t: 1, v }] }
}

function client(reponses: Partial<Record<IdRequete, ResultatPrometheus>>, parDefaut?: ResultatPrometheus) {
  const interroger = jest.fn(async (id: IdRequete) => reponses[id] ?? parDefaut ?? { etat: 'mesure', series: [] })
  return { interroger } as unknown as PrometheusClient & { interroger: jest.Mock }
}

describe('SupervisionService.runners', () => {
  it('non_configure quand le client ne l’est pas', async () => {
    const svc = new SupervisionService(client({}, { etat: 'non_configure' }))
    await expect(svc.runners()).resolves.toEqual({ etat: 'non_configure' })
  })

  it('injoignable quand TOUTES les requêtes échouent', async () => {
    const svc = new SupervisionService(client({}, { etat: 'injoignable', raison: 'HTTP 401' }))
    await expect(svc.runners()).resolves.toEqual({ etat: 'injoignable', raison: 'HTTP 401' })
  })

  it('assemble hôtes, conteneurs, flotte et séries', async () => {
    const svc = new SupervisionService(
      client({
        hote_coeurs: { etat: 'mesure', series: [inst({ host: 'r1' }, 8), inst({ host: 'r2' }, 16)] },
        hote_cpu_pct: { etat: 'mesure', series: [inst({ host: 'r1' }, 42.5)] },
        hote_fraicheur_sec: { etat: 'mesure', series: [inst({ host: 'r1' }, 15), inst({ host: 'r2' }, 300)] },
        conteneur_cpu_coeurs: { etat: 'mesure', series: [inst({ host: 'r1', name: 'ci-runner-vps-runner-1' }, 1.2)] },
        conteneur_oom_24h: { etat: 'mesure', series: [inst({ host: 'r1', name: 'ci-runner-vps-runner-1' }, 0)] },
        flotte_runners_vus: { etat: 'mesure', series: [inst({}, 10)] },
        serie_cpu_pct_24h: {
          etat: 'mesure',
          series: [
            {
              labels: { host: 'r1' },
              points: [
                { t: 1, v: 10 },
                { t: 2, v: null },
              ],
            },
          ],
        },
      }),
    )
    const r = await svc.runners()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.hotes.map(h => h.host)).toEqual(['r1', 'r2'])
    const r1 = r.hotes[0]!
    expect(r1).toMatchObject({ coeurs: 8, cpuPct: 42.5, fraicheurSec: 15, perime: false })
    expect(r1.conteneurs).toEqual([
      {
        host: 'r1',
        name: 'ci-runner-vps-runner-1',
        cpuCoeurs: 1.2,
        cpuLimiteCoeurs: null,
        memOctets: null,
        memLimiteOctets: null,
        disqueOctets: null,
        // Un compteur OOM mesuré à 0 EST une mesure : il reste 0.
        oom24h: 0,
      },
    ])
    expect(r.flotte).toEqual({ runnersVus: 10, coeurs: null })
    expect(r.series.cpuPct).toEqual([
      {
        host: 'r1',
        points: [
          { t: 1, v: 10 },
          { t: 2, v: null },
        ],
      },
    ])
    expect(r.series.memPct).toEqual([])
  })

  it('null ≠ 0 : une série absente rend null, jamais 0', async () => {
    const svc = new SupervisionService(client({ hote_coeurs: { etat: 'mesure', series: [inst({ host: 'r1' }, 8)] } }))
    const r = await svc.runners()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    const h = r.hotes[0]!
    for (const champ of ['cpuPct', 'load1', 'memPct', 'disquePct', 'disqueLibreOctets', 'fraicheurSec'] as const) {
      expect(h[champ]).toBeNull()
    }
    expect(r.flotte.runnersVus).toBeNull()
  })

  it('perime au-delà de 120 s (et quand la fraîcheur est inconnue)', async () => {
    const svc = new SupervisionService(
      client({
        hote_coeurs: {
          etat: 'mesure',
          series: [inst({ host: 'a' }, 8), inst({ host: 'b' }, 8), inst({ host: 'c' }, 8)],
        },
        hote_fraicheur_sec: { etat: 'mesure', series: [inst({ host: 'a' }, 120), inst({ host: 'b' }, 121)] },
      }),
    )
    const r = await svc.runners()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.hotes.map(h => [h.host, h.perime])).toEqual([
      ['a', false],
      ['b', true],
      ['c', true],
    ])
  })

  it('une limite de conteneur ≤ 0 (illimitée) est non mesurée, pas 0', async () => {
    const svc = new SupervisionService(
      client({
        conteneur_mem_limite_octets: { etat: 'mesure', series: [inst({ host: 'r1', name: 'n' }, 0)] },
        conteneur_cpu_limite_coeurs: { etat: 'mesure', series: [inst({ host: 'r1', name: 'n' }, -0.00001)] },
      }),
    )
    const r = await svc.runners()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.hotes[0]!.conteneurs[0]).toMatchObject({ memLimiteOctets: null, cpuLimiteCoeurs: null })
  })

  it('une panne PARTIELLE se nomme, les valeurs touchées restent null', async () => {
    const svc = new SupervisionService(
      client({
        hote_coeurs: { etat: 'mesure', series: [inst({ host: 'r1' }, 8)] },
        hote_mem_pct: { etat: 'injoignable', raison: 'HTTP 503' },
      }),
    )
    const r = await svc.runners()
    if (r.etat !== 'mesure') throw new Error('attendu : mesure')
    expect(r.requetesEnEchec).toEqual(['hote_mem_pct'])
    expect(r.hotes[0]!.memPct).toBeNull()
  })
})
