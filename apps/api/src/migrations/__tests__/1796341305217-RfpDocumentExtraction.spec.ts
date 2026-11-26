import type { QueryRunner } from 'typeorm'
import { RfpDocumentExtraction1796341305217 } from '../1796341305217-RfpDocumentExtraction'

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

// #2957 (#2180.9-.26) — la structure DOSSIER (douze catégories). Additive,
// nullable : un dossier importé avant cette colonne n'a jamais eu son
// extraction calculée, jamais reconstituée après coup.
describe('RfpDocumentExtraction1796341305217', () => {
  it('adds document_extraction (jsonb, nullable)', async () => {
    const { runner, queries } = createRunner()
    await new RfpDocumentExtraction1796341305217().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS document_extraction'))
    expect(add).toBeDefined()
    expect(add).toContain('jsonb')
    expect(add).not.toContain('NOT NULL')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new RfpDocumentExtraction1796341305217().down()).rejects.toThrow('down migrations are not supported')
  })
})
