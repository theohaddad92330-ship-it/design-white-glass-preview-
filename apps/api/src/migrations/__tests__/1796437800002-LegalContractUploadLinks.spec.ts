import type { QueryRunner } from 'typeorm'
import { LegalContractUploadLinks1796437800002 } from '../1796437800002-LegalContractUploadLinks'

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

describe('LegalContractUploadLinks1796437800002', () => {
  it('crée la table, scopée à un contrat ET une mission', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractUploadLinks1796437800002().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS legal_contract_upload_links')
    expect(flat).toContain('contract_id uuid NOT NULL REFERENCES legal_contracts(id) ON DELETE CASCADE')
    expect(flat).toContain('mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE')
  })

  it('le jeton n’est JAMAIS stocké en clair — seul son hachage, UNIQUE', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractUploadLinks1796437800002().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('token_hash text NOT NULL')
    expect(flat).toContain('CONSTRAINT legal_contract_upload_links_token_hash_key UNIQUE (token_hash)')
    expect(flat).not.toContain('token text')
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractUploadLinks1796437800002().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE legal_contract_upload_links ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new LegalContractUploadLinks1796437800002().up(runner)).resolves.not.toThrow()
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new LegalContractUploadLinks1796437800002().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP TABLE IF EXISTS legal_contract_upload_links')
  })
})
