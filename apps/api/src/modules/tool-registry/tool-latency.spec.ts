import { measureToolLatency, type LatencyObservation } from './tool-latency'

/**
 * #2261.13 (décision Louis 19/09) — la latence MESURÉE sur les
 * synchronisations RÉELLES de l'espace, jamais une moyenne inventée.
 *
 * Pure : `now` est un paramètre, jamais `Date.now()` lu à l'intérieur — sinon
 * le test daterait sa propre exécution plutôt que le comportement.
 */
const NOW = new Date('2026-09-19T12:00:00.000Z')

function obs(sourceMinutesAgo: number, arrivedMinutesAgo: number): LatencyObservation {
  return {
    sourceAt: new Date(NOW.getTime() - sourceMinutesAgo * 60_000),
    arrivedAt: new Date(NOW.getTime() - arrivedMinutesAgo * 60_000),
  }
}

describe('measureToolLatency — #2261.13', () => {
  it('outil non câblé (Bellum ne capture pas encore l’horodatage source) : non mesuré, raison distincte', () => {
    const result = measureToolLatency([], NOW, false)
    expect(result.source).toBe('not_measured')
    if (result.source !== 'not_measured') throw new Error('unreachable')
    expect(result.reason.fr.length).toBeGreaterThan(0)
    expect(result.reason.en.length).toBeGreaterThan(0)
    expect(result.reason.fr).toMatch(/capture pas/)
  })

  it('outil câblé mais moins de 3 synchronisations réelles sur 7 jours : non mesuré, raison différente (compte visible)', () => {
    const result = measureToolLatency([obs(20, 18), obs(15, 10)], NOW, true)
    expect(result.source).toBe('not_measured')
    if (result.source !== 'not_measured') throw new Error('unreachable')
    expect(result.reason.fr).toMatch(/2/)
    expect(result.reason.fr).not.toMatch(/capture pas/)
  })

  it('outil câblé, au moins 3 synchronisations réelles sur 7 jours : mesuré, moyenne réelle, datée', () => {
    // Trois observations, délai moyen = (20+10+30)/3 = 20 min.
    const result = measureToolLatency([obs(30, 10), obs(20, 10), obs(40, 10)], NOW, true)
    expect(result.source).toBe('measured')
    if (result.source !== 'measured') throw new Error('unreachable')
    expect(result.value.fr).toMatch(/20/)
    expect(result.as_of).toBe(NOW.toISOString())
    expect(result.window_days).toBe(7)
    expect(result.sample_count).toBe(3)
  })

  it('ignore les synchronisations hors de la fenêtre de 7 jours', () => {
    const old = obs(8 * 24 * 60 + 20, 8 * 24 * 60) // arrivée il y a 8 jours — hors fenêtre
    const recent = [obs(20, 10), obs(20, 10), obs(20, 10)]
    const result = measureToolLatency([old, ...recent], NOW, true)
    expect(result.source).toBe('measured')
    if (result.source !== 'measured') throw new Error('unreachable')
    expect(result.sample_count).toBe(3)
  })

  it('ignore une observation où la source est APRÈS l’arrivée (horloge incohérente, jamais un délai négatif)', () => {
    const bogus: LatencyObservation = { sourceAt: new Date(NOW.getTime()), arrivedAt: new Date(NOW.getTime() - 60_000) }
    const result = measureToolLatency([bogus, obs(20, 10), obs(20, 10), obs(20, 10)], NOW, true)
    expect(result.source).toBe('measured')
    if (result.source !== 'measured') throw new Error('unreachable')
    expect(result.sample_count).toBe(3)
  })

  it('la fenêtre reste 7 jours pile — une observation arrivée à 7 jours moins une minute compte', () => {
    const arrivedMinutesAgo = 7 * 24 * 60 - 1
    const boundary = obs(arrivedMinutesAgo + 20, arrivedMinutesAgo)
    const result = measureToolLatency([boundary, obs(20, 10), obs(20, 10)], NOW, true)
    expect(result.source).toBe('measured')
  })
})
