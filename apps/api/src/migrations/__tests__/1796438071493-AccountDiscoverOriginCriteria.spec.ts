import type { QueryRunner } from 'typeorm'
import { AccountDiscoverOriginCriteria1796438071493 } from '../1796438071493-AccountDiscoverOriginCriteria'

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

// #3819 (lot RBB) — les critères de Découvrir persistés sur le compte.
describe('AccountDiscoverOriginCriteria1796438071493', () => {
  it('ajoute la colonne jsonb, nullable, sans valeur devinée pour les lignes existantes', async () => {
    const { runner, queries } = createRunner()
    await new AccountDiscoverOriginCriteria1796438071493().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS discover_origin_criteria jsonb')
    expect(flat).not.toMatch(/NOT NULL/)
    expect(flat).not.toContain('DEFAULT')
  })

  it('pose une contrainte NOMMÉE sur la forme (un objet), AVANT que le code écrive (GA-11/GA-12/GA-177)', async () => {
    const { runner, queries } = createRunner()
    await new AccountDiscoverOriginCriteria1796438071493().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CONSTRAINT accounts_discover_origin_criteria_shape_check')
    expect(flat).toContain("jsonb_typeof(discover_origin_criteria) = 'object'")
    expect(flat).toContain('discover_origin_criteria IS NULL OR')
  })

  it('down retire la contrainte puis la colonne (GA-08 : additif, réversible)', async () => {
    const { runner, queries } = createRunner()
    await new AccountDiscoverOriginCriteria1796438071493().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP CONSTRAINT IF EXISTS accounts_discover_origin_criteria_shape_check')
    expect(flat).toContain('DROP COLUMN IF EXISTS discover_origin_criteria')
  })
})
