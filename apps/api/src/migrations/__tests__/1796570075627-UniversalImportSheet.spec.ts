import type { QueryRunner } from 'typeorm'
import { UniversalImportSheet1796570075627 } from '../1796570075627-UniversalImportSheet'

/** #4426.4 — ajout seul : une colonne nullable, aucune table existante réécrite. */
describe('UniversalImportSheet1796570075627', () => {
  it('ajoute `sheet` nullable sur universal_import_jobs, rien d’autre', async () => {
    const queries: string[] = []
    const runner = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim())
        return []
      }),
    } as unknown as QueryRunner
    await new UniversalImportSheet1796570075627().up(runner)
    expect(queries).toEqual(['ALTER TABLE universal_import_jobs ADD COLUMN IF NOT EXISTS sheet text'])
  })
})
