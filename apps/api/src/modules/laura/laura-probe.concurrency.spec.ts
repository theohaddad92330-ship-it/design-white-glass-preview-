import type { DataSource } from 'typeorm'
import {
  FORECAST_DECLARED_BLOCKED_MISSION_STATUS,
  FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS,
  FORECAST_RUNNING_MISSION_STATUSES,
} from '@bellum/contracts'
import { DETECTION_COUNTS } from './laura-detector'
import { LauraProbeService } from './laura-probe.service'

/**
 * Incident boucle API (05/10/2026) — amplificateur vu dans les journaux :
 * `LauraProbeService` lançait ~30 mesures EN PARALLÈLE à chaque chargement,
 * sur un pool de 5 connexions par réplica (`DB_POOL_MAX`). Une sonde ne tient
 * désormais jamais plus de 3 requêtes en vol ; résultats et ordre inchangés.
 */
const WS = 'w0000000-0000-4000-8000-000000000001'
const USER = 'u0000000-0000-4000-8000-000000000001'

function trackedDataSource(delayMs: number) {
  let inFlight = 0
  let maxInFlight = 0
  let calls = 0
  const query = jest.fn(async (sql: string) => {
    calls += 1
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    try {
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs))
      // Une réponse qui dépend de la requête : un résultat rangé dans la
      // mauvaise case se verrait.
      const n = sql.length % 17
      return [{ n, total: n + 3, healthy: n, seats: n + 1, active: n, decided: n, followed: n }]
    } finally {
      inFlight -= 1
    }
  })
  const dataSource = { query, manager: { query } } as unknown as DataSource & { query: jest.Mock }
  return { dataSource, stats: () => ({ maxInFlight, calls }) }
}

describe('LauraProbeService — au plus 3 requêtes en vol par sonde (05/10/2026)', () => {
  it('(h) measure : jamais plus de 3 requêtes base en vol, mêmes résultats', async () => {
    const slow = trackedDataSource(5)
    const instant = trackedDataSource(0)
    const measured = await new LauraProbeService(slow.dataSource).measure(WS)
    const reference = await new LauraProbeService(instant.dataSource).measure(WS)
    expect(slow.stats().maxInFlight).toBeLessThanOrEqual(3)
    expect(slow.stats().maxInFlight).toBeGreaterThan(1)
    expect(measured).toEqual(reference)
  })

  it('(h) counts : toutes les mesures de détection, jamais plus de 3 en vol, chaque clé à sa place', async () => {
    const slow = trackedDataSource(5)
    const instant = trackedDataSource(0)
    const counts = await new LauraProbeService(slow.dataSource).counts(WS, USER, DETECTION_COUNTS)
    const reference = await new LauraProbeService(instant.dataSource).counts(WS, USER, DETECTION_COUNTS)
    expect(slow.stats().calls).toBeGreaterThan(10)
    expect(slow.stats().maxInFlight).toBeLessThanOrEqual(3)
    expect(counts).toEqual(reference)
    expect(Object.keys(counts)).toEqual(Object.keys(reference))
  })

  it('#2875 forecast fondateur : UNE requête agrégée (COUNT), sur les statuts et la règle du prévisionnel', async () => {
    const tracked = trackedDataSource(0)
    const counts = await new LauraProbeService(tracked.dataSource).counts(WS, USER, ['forecastDeclaredBlockedMissions'])
    expect(tracked.stats().calls).toBe(1)
    expect(typeof counts.forecastDeclaredBlockedMissions).toBe('number')
    const [sql, params] = tracked.dataSource.query.mock.calls[0] as unknown as [string, unknown[]]
    expect(sql).toMatch(/count\(\*\)/i)
    expect(params).toEqual([
      WS,
      [...FORECAST_RUNNING_MISSION_STATUSES],
      FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS,
      FORECAST_DECLARED_BLOCKED_MISSION_STATUS,
    ])
  })
})
