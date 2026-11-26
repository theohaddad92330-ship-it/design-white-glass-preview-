import type { QueryRunner } from 'typeorm'
import { MissionRenewalRails1796321339583 } from '../1796321339583-MissionRenewalRails'

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
  await new MissionRenewalRails1796321339583().up(runner)
  return normalize(queries.join(' '))
}

describe('MissionRenewalRails1796321339583', () => {
  it('ajoute les deux rails, en jsonb, sans contrainte SQL — la forme est portée par le contrat (#2413.49 à .57)', async () => {
    const sql = await upSql()
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS renewal_client_rail jsonb')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS renewal_consultant_rail jsonb')
  })

  it('down retire les deux colonnes', async () => {
    const { runner, queries } = createRunner()
    await new MissionRenewalRails1796321339583().down(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('DROP COLUMN IF EXISTS renewal_client_rail')
    expect(sql).toContain('DROP COLUMN IF EXISTS renewal_consultant_rail')
  })
})
