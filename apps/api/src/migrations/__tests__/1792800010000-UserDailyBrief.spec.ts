import type { QueryRunner } from 'typeorm'
import { UserDailyBrief1792800010000 } from '../1792800010000-UserDailyBrief'

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

describe('UserDailyBrief1792800010000', () => {
  it('crée user_daily_brief (marqueur « premier du jour »), idempotent', async () => {
    const { runner, queries } = createRunner()
    await new UserDailyBrief1792800010000().up(runner)
    const create = queries.map(normalize).find(q => q.includes('CREATE TABLE IF NOT EXISTS user_daily_brief'))
    expect(create).toBeDefined()
    expect(create).toContain('user_id uuid PRIMARY KEY')
    expect(create).toContain('last_shown_on text NOT NULL')
    expect(create).toContain('updated_at timestamptz NOT NULL DEFAULT now()')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new UserDailyBrief1792800010000().down()).rejects.toThrow('down migrations are not supported')
  })
})
