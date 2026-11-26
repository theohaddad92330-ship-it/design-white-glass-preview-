import type { QueryRunner } from 'typeorm'
import { AccountActorType1796322330000 } from '../1796322330000-AccountActorType'

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

describe('AccountActorType1796322330000', () => {
  it('ajoute les deux colonnes, nullable, sans valeur devinée pour les lignes existantes', async () => {
    const { runner, queries } = createRunner()
    await new AccountActorType1796322330000().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS actor_type text')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS is_intermediary boolean')
    expect(flat).not.toMatch(/NOT NULL/)
    expect(flat).not.toContain('DEFAULT')
  })

  it('down retire les deux colonnes (GA-08 : additif, réversible)', async () => {
    const { runner, queries } = createRunner()
    await new AccountActorType1796322330000().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP COLUMN IF EXISTS actor_type')
    expect(flat).toContain('DROP COLUMN IF EXISTS is_intermediary')
  })
})
