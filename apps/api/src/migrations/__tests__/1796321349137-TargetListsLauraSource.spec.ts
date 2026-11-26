import type { QueryRunner } from 'typeorm'
import { TargetListsLauraSource1796321349137 } from '../1796321349137-TargetListsLauraSource'

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new TargetListsLauraSource1796321349137().up(runner)
  return queries
}

/**
 * Épopée #2853 (#2157.1) — la contrainte s'élargit AVANT le code qui écrit
 * `'laura'` (GA-11 / GA-12).
 */
describe('TargetListsLauraSource1796321349137', () => {
  it("ajoute 'laura' EN FIN de target_lists_source_check, sans retirer les valeurs existantes", async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('target_lists_source_check')) ?? ''
    expect(constraint).toContain("source IN ('manual', 'discover', 'import', 'analysis', 'saved_search', 'laura')")
  })

  it("ajoute 'laura' EN FIN de target_list_items_provenance_check, sans retirer les valeurs existantes", async () => {
    const sql = (await upQueries()).join('\n')
    const constraint =
      sql.split('CONSTRAINT ').find(part => part.startsWith('target_list_items_provenance_check')) ?? ''
    expect(constraint).toContain("provenance IN ('manual', 'discover', 'import', 'analysis', 'laura')")
  })
})
