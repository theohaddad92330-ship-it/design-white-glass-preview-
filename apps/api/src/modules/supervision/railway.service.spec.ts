import { RailwayClient, type ResultatRailway } from './railway.client'
import { RailwaySupervisionService } from './railway.service'

type Serie = Extract<ResultatRailway, { etat: 'mesure' }>['series'][number]

const pts = (...v: Array<number | null>) => v.map((valeur, i) => ({ t: 1000 * (i + 1), v: valeur }))
const serie = (mesure: Serie['mesure'], serviceId: string, ...v: Array<number | null>): Serie => ({
  mesure,
  serviceId,
  points: pts(...v),
})

function service(r: ResultatRailway) {
  const lire = jest.fn().mockResolvedValue(r)
  return { svc: new RailwaySupervisionService({ lire } as unknown as RailwayClient), lire }
}

const mesure = (series: Serie[], noms: Record<string, string> = {}): ResultatRailway => ({
  etat: 'mesure',
  lueA: 1_700_000_000_000,
  series,
  noms,
})

describe('RailwaySupervisionService', () => {
  it('relaie non_configure et injoignable tels quels', async () => {
    await expect(service({ etat: 'non_configure' }).svc.railway('24h')).resolves.toEqual({ etat: 'non_configure' })
    await expect(service({ etat: 'injoignable', raison: 'HTTP 401' }).svc.railway('24h')).resolves.toEqual({
      etat: 'injoignable',
      raison: 'HTTP 401',
    })
  })

  it('refuse une fenêtre hors liste blanche (retombe sur 24h)', async () => {
    const { svc, lire } = service({ etat: 'non_configure' })
    await svc.railway('999j')
    expect(lire).toHaveBeenCalledWith('24h')
    await svc.railway(undefined)
    expect(lire).toHaveBeenLastCalledWith('24h')
    await svc.railway('7j')
    expect(lire).toHaveBeenLastCalledWith('7j')
  })

  it('agrège moyenne/max, limites et coût estimé par service', async () => {
    const { svc } = service(
      mesure(
        [
          serie('CPU_USAGE', 's1', 0.5, 1.5),
          serie('MEMORY_USAGE_GB', 's1', 1, 3),
          serie('CPU_LIMIT', 's1', 24, 24),
          serie('MEMORY_LIMIT_GB', 's1', 24, 24),
        ],
        { s1: 'api' },
      ),
    )
    const r = await svc.railway('24h')
    if (r.etat !== 'mesure') throw new Error('mesure attendue')
    expect(r.services).toEqual([
      {
        id: 's1',
        nom: 'api',
        cpuMoyen: 1,
        cpuMax: 1.5,
        memMoyenneGo: 2,
        memMaxGo: 3,
        limiteCpu: 24,
        limiteMemGo: 24,
        // 1 × 20 + 2 × 10
        coutMensuelEstimeUsd: 40,
        points: { cpu: pts(0.5, 1.5), mem: pts(1, 3) },
      },
    ])
    expect(r.totalEstimeUsd).toBe(40)
    expect(r.totalPartiel).toBe(false)
    expect(r.tarifs.source).toContain('railway.com/pricing')
  })

  it('un service sans nom porte son id COURT, jamais un nom deviné', async () => {
    const { svc } = service(mesure([serie('CPU_USAGE', '35efdac2-af65-42a5-88f8-35ed9c40a254', 1)]))
    const r = await svc.railway('24h')
    if (r.etat !== 'mesure') throw new Error('mesure attendue')
    expect(r.services[0]!.nom).toBe('35efdac2')
  })

  it('null ≠ 0 : mesure absente ⇒ null, coût null ; un vrai 0 reste 0', async () => {
    const { svc } = service(
      mesure([serie('CPU_USAGE', 'a', 0, 0), serie('CPU_USAGE', 'b', 1), serie('MEMORY_USAGE_GB', 'b', null, null)]),
    )
    const r = await svc.railway('24h')
    if (r.etat !== 'mesure') throw new Error('mesure attendue')
    const a = r.services.find(s => s.id === 'a')!
    const b = r.services.find(s => s.id === 'b')!
    expect(a.cpuMoyen).toBe(0)
    expect(a.memMoyenneGo).toBeNull()
    expect(a.coutMensuelEstimeUsd).toBeNull()
    expect(b.memMoyenneGo).toBeNull()
    expect(b.memMaxGo).toBeNull()
    expect(b.limiteCpu).toBeNull()
    expect(b.coutMensuelEstimeUsd).toBeNull()
    // Aucun coût connu : total null, jamais 0.
    expect(r.totalEstimeUsd).toBeNull()
  })

  it('total partiel : somme des coûts connus, signalée partielle', async () => {
    const { svc } = service(
      mesure([serie('CPU_USAGE', 'a', 1), serie('MEMORY_USAGE_GB', 'a', 1), serie('CPU_USAGE', 'b', 1)]),
    )
    const r = await svc.railway('24h')
    if (r.etat !== 'mesure') throw new Error('mesure attendue')
    expect(r.totalEstimeUsd).toBe(30)
    expect(r.totalPartiel).toBe(true)
  })

  it('nomme ce qui n’est pas évalué (réseau, disque)', async () => {
    const { svc } = service(mesure([]))
    const r = await svc.railway('24h')
    if (r.etat !== 'mesure') throw new Error('mesure attendue')
    expect(r.services).toEqual([])
    expect(r.nonEvalue).toEqual(['réseau', 'disque éphémère'])
  })
})
