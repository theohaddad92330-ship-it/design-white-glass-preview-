import type { QueryRunner } from 'typeorm'
import { RfpSourceDocuments1796412761537 } from '../1796412761537-RfpSourceDocuments'

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

// #2957 (#2180.54) — la table de jointure des fichiers sources d'un dossier
// d'appel d'offres.
describe('RfpSourceDocuments1796412761537', () => {
  it('creates the table with FK to rfps and storage_objects, both ON DELETE CASCADE', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocuments1796412761537().up(runner)
    const flat = queries.map(normalize)
    const create = flat.find(q => q.includes('CREATE TABLE IF NOT EXISTS rfp_source_documents'))
    expect(create).toBeDefined()
    expect(create).toContain('rfp_id uuid NOT NULL REFERENCES rfps(id) ON DELETE CASCADE')
    expect(create).toContain('storage_object_id uuid NOT NULL REFERENCES storage_objects(id) ON DELETE CASCADE')
    expect(create).toContain('UNIQUE (rfp_id, storage_object_id)')
  })

  it('indexes (workspace_id, rfp_id, position) — the listing order of a dossier’s files', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocuments1796412761537().up(runner)
    const flat = queries.map(normalize)
    const index = flat.find(q => q.includes('CREATE INDEX'))
    expect(index).toBeDefined()
    expect(index).toContain('ON rfp_source_documents (workspace_id, rfp_id, position)')
  })

  it('down() drops the table (forward migration created it, nothing else owns it)', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocuments1796412761537().down(runner)
    const flat = queries.map(normalize)
    expect(flat.find(q => q.includes('DROP TABLE IF EXISTS rfp_source_documents'))).toBeDefined()
  })
})
