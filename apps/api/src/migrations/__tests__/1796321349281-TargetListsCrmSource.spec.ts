import type { QueryRunner } from 'typeorm'
import { TargetListsCrmSource1796321349281 } from '../1796321349281-TargetListsCrmSource'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new TargetListsCrmSource1796321349281().up(runner)
  return queries
}

/**
 * Épopée #2853 (#2157.7) — la contrainte s'élargit AVANT le code qui écrit
 * `'crm'` (GA-11 / GA-12).
 */
describe('TargetListsCrmSource1796321349281', () => {
  it("ajoute 'crm' EN FIN de target_lists_source_check, sans retirer les valeurs existantes", async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('target_lists_source_check')) ?? ''
    expect(constraint).toContain(
      "source IN ('manual', 'discover', 'import', 'analysis', 'saved_search', 'laura', 'crm')",
    )
  })

  it("ajoute 'crm' EN FIN de target_list_items_provenance_check, sans retirer les valeurs existantes", async () => {
    const sql = (await upQueries()).join('\n')
    const constraint =
      sql.split('CONSTRAINT ').find(part => part.startsWith('target_list_items_provenance_check')) ?? ''
    expect(constraint).toContain("provenance IN ('manual', 'discover', 'import', 'analysis', 'laura', 'crm')")
  })
})
