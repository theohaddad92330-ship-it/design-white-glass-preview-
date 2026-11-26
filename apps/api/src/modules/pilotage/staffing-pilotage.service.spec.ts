import type { DataSource } from 'typeorm'
import { StaffingPilotageService } from './staffing-pilotage.service'

type Call = { sql: string; params: unknown[] }

function build(answers: Record<string, unknown[]>) {
  const calls: Call[] = []
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      const key = Object.keys(answers).find(k => sql.includes(k))
      return key ? answers[key] : []
    }),
  } as unknown as DataSource
  return { service: new StaffingPilotageService(dataSource), calls }
}

const NOW = new Date('2026-10-14T08:00:00Z')

describe('StaffingPilotageService', () => {
  it('scope chaque requête au workspace de l’appelant', async () => {
    const { service, calls } = build({})
    await service.capacity('ws-A', NOW)
    await service.overview('ws-A', true, NOW)
    expect(calls.length).toBeGreaterThan(6)
    for (const call of calls) {
      expect(call.sql).toMatch(/workspace_id = \$1|workspaces WHERE id = \$1/)
      expect(call.params[0]).toBe('ws-A')
    }
  })

  it('un seuil non saisi sort null — aucune alerte', async () => {
    const { service } = build({ tace_alert_threshold_percent: [{ tace_alert_threshold_percent: null }] })
    const overview = await service.overview('ws-A', true, NOW)
    expect(overview.tace.thresholdPercent).toBeNull()
  })

  it('un seuil saisi remonte tel quel', async () => {
    const { service } = build({ 'SELECT tace_alert_threshold_percent': [{ tace_alert_threshold_percent: '75' }] })
    const overview = await service.overview('ws-A', true, NOW)
    expect(overview.tace.thresholdPercent).toBe(75)
  })

  it('ni temps saisis ni affectation : le TACE réel est null, jamais 0', async () => {
    const { service } = build({
      'FROM consultants': [{ id: 'c1', full_name: 'Camille Durand', stack: ['Java'], cost_rate_cents: null }],
    })
    const overview = await service.overview('ws-A', true, NOW)
    for (const period of overview.tace.periods) {
      expect(period.global.actual.percent).toBeNull()
    }
    expect(overview.bench.consultants[0].cost).toEqual({ state: 'unknown' })
  })

  it('écrit le seuil sur le workspace donné', async () => {
    const { service, calls } = build({})
    await service.setTaceThreshold('ws-A', 80)
    expect(calls[0].params).toEqual(['ws-A', 80])
  })
})
