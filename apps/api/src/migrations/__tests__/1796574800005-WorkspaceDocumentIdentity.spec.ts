import { WorkspaceDocumentIdentity1796574800005 } from '../1796574800005-WorkspaceDocumentIdentity'

/**
 * Théo D settings-espace.N5 — deux colonnes NULLABLES sur `workspaces`, bornées en SQL AVANT le code qui écrit
 * (GA-11/GA-12) : les mêmes bornes que le DTO (600 / 300).
 */
describe('WorkspaceDocumentIdentity1796574800005', () => {
  it('ajoute les deux colonnes sans valeur par défaut et pose leurs bornes', async () => {
    const queries: string[] = []
    await new WorkspaceDocumentIdentity1796574800005().up({
      query: async (sql: string) => void queries.push(sql),
    } as never)
    const sql = queries.join('\n')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS document_signature text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS document_footer text')
    expect(sql).not.toMatch(/DEFAULT/i)
    expect(sql).toContain('char_length(document_signature) <= 600')
    expect(sql).toContain('char_length(document_footer) <= 300')
  })

  it('le down retire contraintes puis colonnes', async () => {
    const queries: string[] = []
    await new WorkspaceDocumentIdentity1796574800005().down({
      query: async (sql: string) => void queries.push(sql),
    } as never)
    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS document_signature')
    expect(queries.join('\n')).toContain('DROP COLUMN IF EXISTS document_footer')
  })
})
