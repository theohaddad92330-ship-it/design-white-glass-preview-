import type { QueryRunner } from 'typeorm'
import { RfpSourceDocumentStorageDomain1796412754293 } from '../1796412754293-RfpSourceDocumentStorageDomain'

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

// #2957 (#2180.54) — élargit storage_objects_domain_check pour accepter le
// fichier source d'un appel d'offres, AVANT tout code qui l'écrit (GA-11/GA-12).
describe('RfpSourceDocumentStorageDomain1796412754293', () => {
  it('drops the old constraint before re-adding it (GA-11 — never narrowed in place)', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocumentStorageDomain1796412754293().up(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toContain('DROP CONSTRAINT IF EXISTS storage_objects_domain_check')
  })

  it('widens the constraint to the five existing domains PLUS rfp_source_document, in FIN de liste', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocumentStorageDomain1796412754293().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD CONSTRAINT storage_objects_domain_check'))
    expect(add).toBeDefined()
    expect(add).toContain(
      "CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document'))",
    )
  })

  it('down() does not narrow the constraint back (rows of the new domain may already exist)', async () => {
    const { runner, queries } = createRunner()
    await new RfpSourceDocumentStorageDomain1796412754293().down(runner)
    expect(queries).toHaveLength(0)
  })
})
