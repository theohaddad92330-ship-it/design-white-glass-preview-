import type { QueryRunner } from 'typeorm'
import { ContextPackImports1796570184640 } from '../1796570184640-ContextPackImports'

/** #4422.1 — ajout seul : une table neuve, ses contraintes, son RLS ; aucune table existante touchée. */
describe('ContextPackImports1796570184640', () => {
  it('crée context_pack_imports avec ses contraintes et son RLS, sans toucher une autre table', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim())
        return []
      }),
    } as unknown as QueryRunner
    await new ContextPackImports1796570184640().up(runner)
    const all = queries.join(' ')
    expect(all).toContain('CREATE TABLE IF NOT EXISTS context_pack_imports')
    expect(all).toContain("destination IN ('target_personas', 'qualification_grid', 'sequences', 'knowledge')")
    expect(all).toContain('ENABLE ROW LEVEL SECURITY')
    expect(all).not.toMatch(/ALTER TABLE (?!context_pack_imports)|DROP TABLE|DELETE FROM|UPDATE /)
  })
})
