import type { DataSource } from 'typeorm'
import { LauraProbeService } from './laura-probe.service'

/**
 * perf P3 (29/09/2026) — `POST /laura/plan` part sur CHAQUE page et lisait les
 * neuf axes de santé (≈ 12 requêtes SQL, contre un pool de 10) à chaque appel.
 * Ces axes sont des ratios sur 14 jours : un cache de 2 min, par ESPACE, ne
 * change aucun verdict. `measure` (back-office, pont copilote) reste frais.
 */
function build() {
  const query = jest.fn().mockResolvedValue([{ n: 1, total: 1, healthy: 1 }])
  const service = new LauraProbeService({ query } as unknown as DataSource)
  const measure = jest.spyOn(service, 'measure')
  return { service, measure }
}

describe('LauraProbeService.measureCached', () => {
  afterEach(() => jest.useRealTimers())

  it('deux appels rapprochés pour le même espace = UNE mesure', async () => {
    const { service, measure } = build()
    await service.measureCached('w1')
    await service.measureCached('w1')
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('la clé est l’espace : un autre espace mesure pour lui-même', async () => {
    const { service, measure } = build()
    await service.measureCached('w1')
    await service.measureCached('w2')
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('expire après 2 minutes', async () => {
    jest.useFakeTimers()
    const { service, measure } = build()
    await service.measureCached('w1')
    jest.advanceTimersByTime(121_000)
    await service.measureCached('w1')
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('deux appels SIMULTANÉS partagent la même mesure en vol', async () => {
    const { service, measure } = build()
    await Promise.all([service.measureCached('w1'), service.measureCached('w1')])
    expect(measure).toHaveBeenCalledTimes(1)
  })

  it('`measure` lui-même reste frais (back-office, pont copilote)', async () => {
    const { service, measure } = build()
    await service.measure('w1')
    await service.measure('w1')
    expect(measure).toHaveBeenCalledTimes(2)
  })
})
