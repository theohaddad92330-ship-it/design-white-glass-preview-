import type { QueryRunner } from 'typeorm'
import { RagDocumentSourceStorage1796437500002 } from '../1796437500002-RagDocumentSourceStorage'

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

// #3803 (3803.1) — la base accepte l'original d'un document AVANT le code qui l'écrit (GA-11/GA-12).
describe('RagDocumentSourceStorage1796437500002', () => {
  it('élargit le domaine en FIN de liste, depuis la dernière déclaration', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentSourceStorage1796437500002().up(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toContain('DROP CONSTRAINT IF EXISTS storage_objects_domain_check')
    expect(flat.find(q => q.includes('ADD CONSTRAINT storage_objects_domain_check'))).toContain(
      "CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source'))",
    )
  })

  it('lie le document à son original, SET NULL à l’effacement de l’objet (jamais un blocage)', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentSourceStorage1796437500002().up(runner)
    const add = queries.map(normalize).find(q => q.includes('source_object_id uuid'))
    expect(add).toContain('REFERENCES storage_objects(id) ON DELETE SET NULL')
  })

  it('down() retire la colonne mais ne rétrécit pas la contrainte de domaine', async () => {
    const { runner, queries } = createRunner()
    await new RagDocumentSourceStorage1796437500002().down(runner)
    expect(queries.some(q => q.includes('storage_objects_domain_check'))).toBe(false)
  })
})
