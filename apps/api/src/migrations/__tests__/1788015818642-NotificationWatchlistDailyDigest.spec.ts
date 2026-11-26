import type { QueryRunner } from 'typeorm'
import { NotificationWatchlistDailyDigest1788015818642 } from '../1788015818642-NotificationWatchlistDailyDigest'

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

describe('NotificationWatchlistDailyDigest1788015818642', () => {
  it('adds an opt-in watchlist_daily_digest column idempotently (default false — no fake send)', async () => {
    const { runner, queries } = createRunner()
    await new NotificationWatchlistDailyDigest1788015818642().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE notification_preferences'))
    expect(alter).toBeDefined()
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS watchlist_daily_digest boolean NOT NULL DEFAULT false')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new NotificationWatchlistDailyDigest1788015818642().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
