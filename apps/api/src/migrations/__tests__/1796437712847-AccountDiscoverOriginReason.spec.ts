import type { QueryRunner } from 'typeorm'
import { AccountDiscoverOriginReason1796437712847 } from '../1796437712847-AccountDiscoverOriginReason'

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

describe('AccountDiscoverOriginReason1796437712847', () => {
  it('ajoute la colonne, nullable, sans valeur devinée pour les lignes existantes', async () => {
    const { runner, queries } = createRunner()
    await new AccountDiscoverOriginReason1796437712847().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS discover_origin_reason text')
    expect(flat).not.toMatch(/NOT NULL/)
    expect(flat).not.toContain('DEFAULT')
  })

  it('down retire la colonne (GA-08 : additif, réversible)', async () => {
    const { runner, queries } = createRunner()
    await new AccountDiscoverOriginReason1796437712847().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP COLUMN IF EXISTS discover_origin_reason')
  })
})
