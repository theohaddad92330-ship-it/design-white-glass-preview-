import type { QueryRunner } from 'typeorm'
import { RAG_PROCESSING_STATUSES } from '@bellum/contracts'
import { RagDocumentProcessingStatus1796433906070 } from '../1796433906070-RagDocumentProcessingStatus'

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

// #3669.2 — le statut de traitement par document : NULL = non évalué.
describe('RagDocumentProcessingStatus1796433906070', () => {
  it('ajoute rag_documents.processing_status NULLABLE — jamais « exploitable » par défaut', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentProcessingStatus1796433906070().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS processing_status text;')
    expect(sql).not.toMatch(/processing_status text (NOT NULL|DEFAULT)/)
  })

  it('la contrainte porte les cinq statuts du contrat, ou NULL', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentProcessingStatus1796433906070().up(runner)
    const sql = normalize(queries.join(' '))
    expect(sql).toContain('processing_status IS NULL OR')
    for (const status of RAG_PROCESSING_STATUSES) expect(sql).toContain(`'${status}'`)
  })

  it('down retire la contrainte PUIS la colonne', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentProcessingStatus1796433906070().down(runner)
    const sql = normalize(queries.join(' '))
    const c = sql.indexOf('DROP CONSTRAINT IF EXISTS rag_documents_processing_status_check')
    expect(c).toBeGreaterThanOrEqual(0)
    expect(sql.indexOf('DROP COLUMN IF EXISTS processing_status')).toBeGreaterThan(c)
  })
})
