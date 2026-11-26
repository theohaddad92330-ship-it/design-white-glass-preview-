import type { QueryRunner } from 'typeorm'
import { WelcomeRedesignBannerDismissed1796350894461 } from '../1796350894461-WelcomeRedesignBannerDismissed'

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

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new WelcomeRedesignBannerDismissed1796350894461().up(runner)
  return normalize(queries.join(' '))
}

describe('WelcomeRedesignBannerDismissed1796350894461 (#2897, #2091.36)', () => {
  it('ajoute un horodatage NULLABLE — NULL = jamais fermée, le défaut de tout compte existant', async () => {
    const sql = await upSql()
    expect(sql).toContain(
      'ALTER TABLE user_onboarding_state ADD COLUMN IF NOT EXISTS redesign_banner_dismissed_at TIMESTAMPTZ',
    )
    expect(sql).not.toMatch(/redesign_banner_dismissed_at[^,]*NOT NULL/)
  })

  it('est additive et idempotente (IF NOT EXISTS) — jamais un backfill ni une contrainte destructive', async () => {
    const sql = await upSql()
    expect(sql).toContain('IF NOT EXISTS')
    expect(sql).not.toMatch(/DROP|DELETE|TRUNCATE/i)
  })

  it('down est refusé — ce dépôt archive, il ne réécrit pas ce qui a tourné', async () => {
    const migration = new WelcomeRedesignBannerDismissed1796350894461()
    await expect(migration.down()).rejects.toThrow('down migrations are not supported')
  })
})
