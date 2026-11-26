import type { QueryRunner } from 'typeorm'
import { LegalContractExternalUploadStorageDomain1796437800004 } from '../1796437800004-LegalContractExternalUploadStorageDomain'

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

// #2422.6 (épopée #2869, lot R24) — la base accepte la pièce externe AVANT le code qui l'écrit (GA-11/GA-12).
describe('LegalContractExternalUploadStorageDomain1796437800004', () => {
  it('élargit le domaine en FIN de liste, depuis la dernière déclaration', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractExternalUploadStorageDomain1796437800004().up(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toContain('DROP CONSTRAINT IF EXISTS storage_objects_domain_check')
    expect(flat.find(q => q.includes('ADD CONSTRAINT storage_objects_domain_check'))).toContain(
      "CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source', 'legal_contract_external_upload'))",
    )
  })

  it('down() ne rétrécit PAS la contrainte de domaine — jamais de suppression de données par un retour', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractExternalUploadStorageDomain1796437800004().down(runner)
    expect(queries.some(q => q.includes('storage_objects_domain_check'))).toBe(false)
  })
})
