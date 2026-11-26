import { createMockRepository } from '../../database/test-utils'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { ActionOsAdoptionMetricsService } from './action-os-adoption-metrics.service'

const NOW = new Date('2026-09-29T12:00:00.000Z')
const WORKSPACE_A = '11111111-1111-1111-1111-111111111111'

function makeService(seed: (sql: string, params: unknown[]) => unknown[]) {
  const repo = createMockRepository<WorkflowRunEntity>()
  repo.manager.query.mockImplementation((sql: string, params: unknown[]) => Promise.resolve(seed(sql, params)))
  return { service: new ActionOsAdoptionMetricsService(repo as never), repo }
}

describe('ActionOsAdoptionMetricsService', () => {
  it('counts validated, executed and disabled within the window, scoped to the workspace param', async () => {
    const { service, repo } = makeService((sql, params) => {
      expect(params[0]).toBe(WORKSPACE_A)
      if (sql.includes('q:action_os_validated')) return [{ count: '4' }]
      if (sql.includes('q:action_os_executed')) return [{ count: '2' }]
      if (sql.includes('q:action_os_disabled')) return [{ count: '1' }]
      if (sql.includes('q:action_os_first_success')) return [{ first_success_at: '2026-09-01T10:00:00.000Z' }]
      return []
    })
    const result = await service.forWorkspace(WORKSPACE_A, 30, NOW)
    expect(result).toEqual({
      validated: 4,
      executed: 2,
      disabled: 1,
      firstSuccessAt: '2026-09-01T10:00:00.000Z',
    })
    expect(repo.manager.query).toHaveBeenCalledTimes(4)
  })

  it('never invents a first success — null stays null when no run ever succeeded (GA-18/19)', async () => {
    const { service } = makeService(sql => {
      if (sql.includes('q:action_os_validated')) return [{ count: '0' }]
      if (sql.includes('q:action_os_executed')) return [{ count: '0' }]
      if (sql.includes('q:action_os_disabled')) return [{ count: '0' }]
      if (sql.includes('q:action_os_first_success')) return [{ first_success_at: null }]
      return []
    })
    const result = await service.forWorkspace(WORKSPACE_A, 30, NOW)
    expect(result.firstSuccessAt).toBeNull()
    expect(result.validated).toBe(0)
    expect(result.executed).toBe(0)
    expect(result.disabled).toBe(0)
  })

  it('scopes the window to [now - windowDays, now]', async () => {
    const { service } = makeService((sql, params) => {
      if (
        sql.includes('q:action_os_validated') ||
        sql.includes('q:action_os_executed') ||
        sql.includes('q:action_os_disabled')
      ) {
        expect(params[1]).toEqual(new Date(NOW.getTime() - 7 * 86_400_000))
        expect(params[2]).toEqual(NOW)
      }
      return [{ count: '0' }]
    })
    await service.forWorkspace(WORKSPACE_A, 7, NOW)
  })

  // #2442.13 (épopée #2879, lot R16) — un run `toggle_routine` exécuté avec
  // `enabled: true` ne compte JAMAIS comme désactivation : seule la requête
  // SQL le filtre (pure-function unit tests ne le couvrent pas), donc ce test
  // fixe la forme de la requête elle-même plutôt que de la contourner.
  it('the disabled query filters on the toggle_routine intent enabled=false, not merely its presence', async () => {
    let disabledSql = ''
    const { service } = makeService(sql => {
      if (sql.includes('q:action_os_disabled')) disabledSql = sql
      return [{ count: '0' }]
    })
    await service.forWorkspace(WORKSPACE_A, 30, NOW)
    expect(disabledSql).toContain('toggle_routine')
    expect(disabledSql).toContain('enabled')
    expect(disabledSql.toLowerCase()).toContain('false')
  })
})
