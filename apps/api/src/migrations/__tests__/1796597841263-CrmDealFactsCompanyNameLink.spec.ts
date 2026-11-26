import type { QueryRunner } from 'typeorm'
import { CRM_DEAL_ACCOUNT_LINK_BASES } from '@bellum/contracts'
import { CrmDealFactsCompanyNameLink1796597841263 } from '../1796597841263-CrmDealFactsCompanyNameLink'

function runnerOf(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => void queries.push(sql.replace(/\s+/g, ' ').trim())),
  } as unknown as QueryRunner
  return { runner, queries }
}

describe('CrmDealFactsCompanyNameLink1796597841263 (lot 762 P5)', () => {
  it('ajoute company_name NULLABLE et élargit le CHECK à TOUTE la liste fermée, « name » compris', async () => {
    const { runner, queries } = runnerOf()
    await new CrmDealFactsCompanyNameLink1796597841263().up(runner)
    const sql = queries.join(' ')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS company_name text')
    expect(sql).not.toContain('company_name text NOT NULL')
    for (const basis of CRM_DEAL_ACCOUNT_LINK_BASES) expect(sql).toContain(`'${basis}'`)
  })

  it('down() délie les deals rattachés par nom AVANT de rétrécir le CHECK', async () => {
    const { runner, queries } = runnerOf()
    await new CrmDealFactsCompanyNameLink1796597841263().down(runner)
    expect(queries[0]).toContain("account_link_basis = 'name'")
    expect(queries.join(' ')).toContain('DROP COLUMN IF EXISTS company_name')
  })
})
