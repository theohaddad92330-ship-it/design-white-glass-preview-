import type { QueryRunner } from 'typeorm'
import { RagDocumentLanguage1796322770000 } from '../1796322770000-RagDocumentLanguage'

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

// #2861 (#2437.2) — le niveau SOURCE de langue : la langue ORIGINALE d'un
// document déposé dans la base de connaissance, stockée sur `rag_documents`.
describe('RagDocumentLanguage1796322770000', () => {
  it('ajoute rag_documents.language, NULLABLE — non renseigné reste NULL, jamais deviné', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentLanguage1796322770000().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ALTER TABLE rag_documents ADD COLUMN IF NOT EXISTS language text')
  })

  it('la contrainte rag_documents_language_check tient le MÊME catalogue que marketLocaleSchema — fr/en/de ou NULL', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentLanguage1796322770000().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_language_check')
    expect(sql).toContain(
      "ALTER TABLE rag_documents ADD CONSTRAINT rag_documents_language_check CHECK (language IS NULL OR language IN ('fr', 'en', 'de'))",
    )
  })

  it('down retire la contrainte PUIS la colonne', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentLanguage1796322770000().down(runner)
    const sql = normalize(queries.join(' '))

    const constraintIdx = sql.indexOf('DROP CONSTRAINT IF EXISTS rag_documents_language_check')
    const columnIdx = sql.indexOf('DROP COLUMN IF EXISTS language')
    expect(constraintIdx).toBeGreaterThanOrEqual(0)
    expect(columnIdx).toBeGreaterThan(constraintIdx)
  })
})
