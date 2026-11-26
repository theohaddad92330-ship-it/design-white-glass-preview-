import type { QueryRunner } from 'typeorm'
import { OutreachAssetFile1796437901201 } from '../1796437901201-OutreachAssetFile'

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

// #3699.6 — la base accepte le fichier d'un asset AVANT le code qui l'écrit (GA-11/GA-12).
describe('OutreachAssetFile1796437901201', () => {
  it('élargit le domaine en FIN de liste, depuis la dernière déclaration', async () => {
    const { runner, queries } = createRunner()
    await new OutreachAssetFile1796437901201().up(runner)
    const flat = queries.map(normalize)
    expect(flat[0]).toContain('DROP CONSTRAINT IF EXISTS storage_objects_domain_check')
    expect(flat.find(q => q.includes('ADD CONSTRAINT storage_objects_domain_check'))).toContain(
      "CHECK (domain IN ('expense_receipt', 'need_document', 'chat_voice_message', 'invoice_attachment', 'chat_image_attachment', 'rfp_source_document', 'rag_document_source', 'legal_contract_external_upload', 'outreach_asset_file'))",
    )
  })

  it('rattache un objet rangé à l’asset, nullable, détaché si l’objet part', async () => {
    const { runner, queries } = createRunner()
    await new OutreachAssetFile1796437901201().up(runner)
    const all = queries.map(normalize).join('\n')
    expect(all).toContain(
      'ADD COLUMN IF NOT EXISTS storage_object_id uuid REFERENCES storage_objects(id) ON DELETE SET NULL',
    )
    expect(all).not.toMatch(/storage_object_id uuid NOT NULL/)
  })

  it('cloisonne le catalogue par espace (RLS lecture membres)', async () => {
    const { runner, queries } = createRunner()
    await new OutreachAssetFile1796437901201().up(runner)
    const all = queries.map(normalize).join('\n')
    expect(all).toContain('ALTER TABLE outreach_assets ENABLE ROW LEVEL SECURITY')
    expect(all).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('down() ne rétrécit PAS la contrainte de domaine — jamais de suppression de données par un retour', async () => {
    const { runner, queries } = createRunner()
    await new OutreachAssetFile1796437901201().down(runner)
    expect(queries.some(q => q.includes('storage_objects_domain_check'))).toBe(false)
  })
})
