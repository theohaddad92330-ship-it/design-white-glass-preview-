import type { QueryRunner } from 'typeorm'
import { MemberObjectivesCommercialAxes1789742050827 } from '../1789742050827-MemberObjectivesCommercialAxes'

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

describe('MemberObjectivesCommercialAxes1789742050827', () => {
  it('adds the four missing axes as nullable columns, additive (IF NOT EXISTS)', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectivesCommercialAxes1789742050827().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE member_objectives'))
    expect(alter).toBeDefined()
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS target_qualified_needs integer')
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS target_placements integer')
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS target_margin_percent numeric(5,2)')
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS target_consultants_on_mission integer')
  })

  it('refuses a margin objective of 0% but allows NULL (axe non déclaré)', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectivesCommercialAxes1789742050827().up(runner)
    const constraint = queries.map(normalize).find(q => q.includes('member_objectives_margin_percent_check'))
    expect(constraint).toBeDefined()
    expect(constraint).toContain(
      'target_margin_percent IS NULL OR (target_margin_percent > 0 AND target_margin_percent <= 100)',
    )
  })

  it('down() drops exactly what up() added, nothing else', async () => {
    const { runner, queries } = createRunner()
    await new MemberObjectivesCommercialAxes1789742050827().down(runner)
    const drop = queries.map(normalize).find(q => q.includes('DROP COLUMN IF EXISTS target_qualified_needs'))
    expect(drop).toBeDefined()
    expect(drop).toContain('DROP CONSTRAINT IF EXISTS member_objectives_margin_percent_check')
    expect(drop).toContain('DROP COLUMN IF EXISTS target_placements')
    expect(drop).toContain('DROP COLUMN IF EXISTS target_margin_percent')
    expect(drop).toContain('DROP COLUMN IF EXISTS target_consultants_on_mission')
  })
})
