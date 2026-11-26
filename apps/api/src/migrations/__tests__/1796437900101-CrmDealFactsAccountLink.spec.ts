import type { QueryRunner } from 'typeorm'
import { CRM_DEAL_ACCOUNT_LINK_BASES } from '@bellum/contracts'
import { CrmDealFactsAccountLink1796437900101 } from '../1796437900101-CrmDealFactsAccountLink'

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

const flat = (queries: string[]): string => queries.map(sql => sql.replace(/\s+/g, ' ').trim()).join(' ')

describe('CrmDealFactsAccountLink1796437900101 (#3918.a)', () => {
  it('ajoute les clés société et le rattachement, tous NULLABLES', async () => {
    const { runner, queries } = createRunner()
    await new CrmDealFactsAccountLink1796437900101().up(runner)
    const sql = flat(queries)
    for (const column of [
      'company_external_id text',
      'company_siren text',
      'company_domain text',
      'account_link_basis text',
    ]) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`)
    }
    expect(sql).toContain('account_id uuid REFERENCES accounts(id) ON DELETE SET NULL')
    expect(flat(queries.filter(q => q.includes('ADD COLUMN')))).not.toContain('NOT NULL')
  })

  it('le CHECK couvre toute la liste fermée des clés — et aucune clé « nom » (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new CrmDealFactsAccountLink1796437900101().up(runner)
    const sql = flat(queries)
    // Lot 762 P5 : 'name' est ajouté par la migration 1796597841263 (CHECK élargi) — celle-ci reste telle qu'elle a tourné.
    for (const basis of CRM_DEAL_ACCOUNT_LINK_BASES.filter(b => b !== 'name')) expect(sql).toContain(`'${basis}'`)
    expect(sql).not.toContain("'name'")
  })

  it('down() retire tout ce que up() a posé', async () => {
    const { runner, queries } = createRunner()
    await new CrmDealFactsAccountLink1796437900101().down(runner)
    const sql = flat(queries)
    for (const column of [
      'company_external_id',
      'company_siren',
      'company_domain',
      'account_id',
      'account_link_basis',
    ]) {
      expect(sql).toContain(`DROP COLUMN IF EXISTS ${column}`)
    }
  })
})
