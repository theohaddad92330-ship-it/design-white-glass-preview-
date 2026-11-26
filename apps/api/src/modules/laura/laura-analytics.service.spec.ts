import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { LauraAnalyticsService } from './laura-analytics.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const HOUR = 60 * 60 * 1000

type TraceRow = { reaction: string | null; created_at: Date }

function makeService(traces: TraceRow[], disabledUserCount: number) {
  const interventions = { find: jest.fn().mockResolvedValue(traces) }
  const preferences = { count: jest.fn().mockResolvedValue(disabledUserCount) }
  return { interventions, preferences }
}

async function build(mocks: ReturnType<typeof makeService>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LauraAnalyticsService,
      { provide: getRepositoryToken(LauraInterventionEntity), useValue: mocks.interventions },
      { provide: getRepositoryToken(NotificationPreferenceEntity), useValue: mocks.preferences },
    ],
  }).compile()
  return moduleRef.get(LauraAnalyticsService)
}

describe('LauraAnalyticsService — #2403.40-.47, le pont entre les traces et les huit noms', () => {
  it('lit les traces et les préférences coupées, et rend les huit métriques', async () => {
    const laura = await build(
      makeService(
        [
          { reaction: 'acted', created_at: new Date(NOW.getTime() - 2 * HOUR) },
          { reaction: 'refused', created_at: new Date(NOW.getTime() - 2 * HOUR) },
        ],
        3,
      ),
    )
    const summary = await laura.summarize(NOW)
    expect(summary.offered).toEqual({ state: 'measured', count: 2 })
    expect(summary.accepted).toEqual({ state: 'measured', count: 1 })
    expect(summary.dismissed).toEqual({ state: 'measured', count: 1 })
    expect(summary.disabled).toEqual({ state: 'measured', count: 3 })
    expect(summary.viewed.state).toBe('unmeasured')
  })

  it('borne la lecture des traces à une fenêtre glissante, comme le taux d’acceptation par surface', async () => {
    const mocks = makeService([], 0)
    const laura = await build(mocks)
    await laura.summarize(NOW)
    expect(mocks.interventions.find).toHaveBeenCalledTimes(1)
    const query = mocks.interventions.find.mock.calls[0]?.[0] as { where: { created_at: { value: Date } } }
    const since = query.where.created_at.value
    const daysCovered = (NOW.getTime() - since.getTime()) / (24 * HOUR)
    expect(daysCovered).toBeGreaterThanOrEqual(30)
  })

  it('#2439.10 — une trace ARCHIVÉE ne pèse dans AUCUNE des huit métriques', async () => {
    const mocks = makeService([], 0)
    const laura = await build(mocks)
    await laura.summarize(NOW)
    const query = mocks.interventions.find.mock.calls[0]?.[0] as { where: Record<string, unknown> }
    expect(query.where).toHaveProperty('archived_at')
  })

  it('compte les utilisateurs coupés via `laura_enabled = false`, jamais via les traces', async () => {
    const mocks = makeService([], 5)
    const laura = await build(mocks)
    const summary = await laura.summarize(NOW)
    expect(mocks.preferences.count).toHaveBeenCalledWith({ where: { laura_enabled: false } })
    expect(summary.disabled).toEqual({ state: 'measured', count: 5 })
  })
})
