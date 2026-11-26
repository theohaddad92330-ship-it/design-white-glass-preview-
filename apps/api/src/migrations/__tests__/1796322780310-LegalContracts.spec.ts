import type { QueryRunner } from 'typeorm'
import { LegalContracts1796322780310 } from '../1796322780310-LegalContracts'

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

describe('LegalContracts1796322780310', () => {
  it('crée la table, scopée à un compte et à un espace', async () => {
    const { runner, queries } = createRunner()
    await new LegalContracts1796322780310().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS legal_contracts')
    expect(flat).toContain('account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE')
    expect(flat).toContain('legal_entity_id uuid NULL REFERENCES legal_entities(id) ON DELETE SET NULL')
  })

  it('couvre les neuf types au CHECK, jamais moins (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new LegalContracts1796322780310().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const type of [
      'framework',
      'mission_agreement',
      'amendment',
      'purchase_order',
      'subcontracting_agreement',
      'partnership_agreement',
      'consultant_contract',
      'convention',
      'other',
    ]) {
      expect(flat).toContain(`'${type}'`)
    }
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new LegalContracts1796322780310().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE legal_contracts ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new LegalContracts1796322780310().up(runner)).resolves.not.toThrow()
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new LegalContracts1796322780310().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP TABLE IF EXISTS legal_contracts')
  })
})
