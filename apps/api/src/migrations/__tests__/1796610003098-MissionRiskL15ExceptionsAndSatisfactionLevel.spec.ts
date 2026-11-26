import type { QueryRunner } from 'typeorm'
import { MISSION_SATISFACTION_LEVELS, missionRiskSchema } from '@bellum/contracts'
import { MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098 } from '../1796610003098-MissionRiskL15ExceptionsAndSatisfactionLevel'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function up(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098().up(runner)
  return queries.map(normalize)
}

describe('MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098 (#2408.3/.16/.17/.20/.21)', () => {
  it('le CHECK des résolutions couvre EXACTEMENT `missionRiskSchema` — GA-11/GA-12', async () => {
    const add = (await up()).find(q => q.includes('ADD CONSTRAINT mission_risk_resolutions_risk_check')) ?? ''
    for (const risk of missionRiskSchema.options) expect(add).toContain(`'${risk}'`)
    expect(add.match(/'[a-z_]+'/g) ?? []).toHaveLength(missionRiskSchema.options.length)
  })

  it('pose le niveau de satisfaction, NULLABLE (une note sans niveau reste valide), borné par CHECK', async () => {
    const flat = await up()
    expect(flat).toContain('ALTER TABLE mission_feedback ADD COLUMN IF NOT EXISTS level text NULL')
    const check = flat.find(q => q.includes('ADD CONSTRAINT mission_feedback_level_check')) ?? ''
    for (const level of MISSION_SATISFACTION_LEVELS) expect(check).toContain(`'${level}'`)
    expect(check).toContain('level IS NULL OR')
  })

  it('down retire la colonne et restaure la liste de risques sans les cinq exceptions', async () => {
    const { runner, queries } = createRunner()
    await new MissionRiskL15ExceptionsAndSatisfactionLevel1796610003098().down(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD CONSTRAINT mission_risk_resolutions_risk_check')) ?? ''
    expect(add).toContain("'invoice_blocked'")
    expect(add).not.toContain('low_satisfaction')
    expect(flat.some(q => q.includes('DROP COLUMN IF EXISTS level'))).toBe(true)
  })
})
