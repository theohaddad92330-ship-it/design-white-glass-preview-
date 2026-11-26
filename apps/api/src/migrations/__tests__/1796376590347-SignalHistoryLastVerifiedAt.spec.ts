import type { QueryRunner } from 'typeorm'
import { SignalHistoryLastVerifiedAt1796376590347 } from '../1796376590347-SignalHistoryLastVerifiedAt'

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

describe('SignalHistoryLastVerifiedAt1796376590347', () => {
  it('adds a NULLABLE last_verified_at, idempotently', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistoryLastVerifiedAt1796376590347().up(runner)
    const sql = queries.map(normalize)

    expect(sql).toContain('ALTER TABLE signal_history ADD COLUMN IF NOT EXISTS last_verified_at timestamptz')
  })

  it('backfills NOTHING — un signal existant reste non vérifié, jamais deviné', async () => {
    const { runner, queries } = createRunner()
    await new SignalHistoryLastVerifiedAt1796376590347().up(runner)
    const sql = queries.map(normalize)

    expect(sql.some(q => q.startsWith('UPDATE signal_history'))).toBe(false)
    expect(sql.some(q => q.includes('INSERT INTO'))).toBe(false)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new SignalHistoryLastVerifiedAt1796376590347().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
