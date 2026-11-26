import type { QueryRunner } from 'typeorm'
import { NeedPlayActionType1788912847316 } from '../1788912847316-NeedPlayActionType'

/** Capture every SQL statement the migration issues (no live DB needed). */
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

describe('NeedPlayActionType1788912847316', () => {
  it('autorise la trace du plan d’attaque', async () => {
    const { runner, queries } = createRunner()
    await new NeedPlayActionType1788912847316().up(runner)
    const flat = queries.map(normalize)
    expect(flat).toContain('ALTER TABLE user_actions DROP CONSTRAINT IF EXISTS user_actions_action_type_check')
    const add = flat.find(q => q.includes('ADD CONSTRAINT user_actions_action_type_check'))
    expect(add).toBeDefined()
    expect(add).toContain("'need_play_generated'")
  })

  // La garde de parité a déménagé sur `CommercialStatusChangedActionType`
  // (1793700310000), la migration qui définit désormais la contrainte (#2117.24).
})
