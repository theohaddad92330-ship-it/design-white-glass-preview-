import { DEMO_CRM_MISSION_LIFECYCLE_COVERAGE } from './demo-coverage'
import { DEMO_CRM_MISSION_LIFECYCLE, seedDemoCrmMissionLifecycle } from './demo-crm-mission-lifecycle'

const NOW = Date.parse('2026-10-14T10:00:00Z')

function manager(opts: { account?: boolean; people?: number; existing?: boolean }) {
  const calls: { sql: string; params: unknown[] }[] = []
  let missionSeq = 0
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params })
    if (sql.includes('FROM accounts')) return opts.account === false ? [] : [{ id: 'acc' }]
    if (sql.includes('FROM consultants')) return Array.from({ length: opts.people ?? 5 }, (_, i) => ({ id: `c${i}` }))
    if (sql.includes('SELECT id FROM missions')) return opts.existing ? [{ id: 'm0' }] : []
    if (sql.includes('INSERT INTO missions')) return [{ id: `m${++missionSeq}` }]
    return []
  })
  return { manager: { query } as never, calls }
}

describe('seedDemoCrmMissionLifecycle', () => {
  it('pose la mission prolongée (avenant accepté), la mission terminée, et fait suivre les deux consultants', async () => {
    const { manager: m, calls } = manager({})
    await seedDemoCrmMissionLifecycle(m, 'ws', 'owner', NOW)
    const missions = calls.filter(c => c.sql.includes('INSERT INTO missions'))
    expect(missions).toHaveLength(2)
    expect(missions[0]?.params[3]).toBe(DEMO_CRM_MISSION_LIFECYCLE.running.label)
    // fin dans 25 jours
    expect(missions[0]?.params[6]).toBe('2026-11-08')
    const amendment = calls.find(c => c.sql.includes('INSERT INTO mission_amendments'))
    expect(amendment?.sql).toContain("'end_date_change', 'accepted'")
    const running = calls.find(c => c.sql.includes("availability = 'en_mission'"))
    expect(running?.sql).toContain('archived_at = NULL')
    expect(running?.params[2]).toBe('2026-11-09')
    const back = calls.find(c => c.sql.includes("availability = 'immediate'"))
    expect(back?.params[2]).toBe('2026-09-25')
    expect(calls.filter(c => c.sql.includes('INSERT INTO record_field_audit')).length).toBeGreaterThanOrEqual(5)
  })

  it('sans compte Société Générale, sans cinq consultants, ou déjà semé : ne pose rien', async () => {
    for (const opts of [{ account: false }, { people: 4 }, { existing: true }]) {
      const { manager: m, calls } = manager(opts)
      await seedDemoCrmMissionLifecycle(m, 'ws', 'owner', NOW)
      expect(calls.some(c => c.sql.includes('INSERT INTO'))).toBe(false)
    }
  })

  it('la couverture déclare ce semis comme « seedé », avec sa raison', () => {
    expect(DEMO_CRM_MISSION_LIFECYCLE_COVERAGE.state).toBe('seede')
    expect(DEMO_CRM_MISSION_LIFECYCLE_COVERAGE.reason).toContain('Société Générale')
  })
})
