import type { QueryRunner } from 'typeorm'
import { ALL_PLAN_FEATURES } from '@bellum/contracts'
import { OpenAllFeaturesOnTeamPlan1796560888330 } from '../1796560888330-OpenAllFeaturesOnTeamPlan'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

// ENTREPRISE-TOUT #4381 — la ligne `team` en base ouvre toutes les fonctions.
describe('OpenAllFeaturesOnTeamPlan1796560888330', () => {
  it('écrit TOUTES les clés sur la seule ligne `team`, sans toucher aux quotas', async () => {
    const query = jest.fn(async () => [])
    await new OpenAllFeaturesOnTeamPlan1796560888330().up({ query } as unknown as QueryRunner)
    expect(query).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]]
    const n = normalize(sql)
    expect(n).toContain('UPDATE plan_definitions SET features = $1::jsonb')
    expect(n).toContain("WHERE key = 'team'")
    expect(n).not.toMatch(/price|seats|credits|accounts_limit/)
    expect(JSON.parse(params[0] as string)).toEqual([...ALL_PLAN_FEATURES])
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new OpenAllFeaturesOnTeamPlan1796560888330().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
