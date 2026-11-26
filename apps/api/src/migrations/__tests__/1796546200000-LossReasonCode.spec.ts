import type { QueryRunner } from 'typeorm'
import { LOSS_REASON_CODES } from '@bellum/contracts'
import { LossReasonCode1796546200000 } from '../1796546200000-LossReasonCode'

async function run(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new LossReasonCode1796546200000().up(runner)
  return queries
}

describe('LossReasonCode1796546200000 (#3989.9)', () => {
  it('la contrainte porte EXACTEMENT la liste fermée du contrat (GA-11/12)', async () => {
    const check = (await run()).find(q => q.includes('ADD CONSTRAINT opportunities_loss_reason_code_check')) ?? ''
    const values = [...(check.match(/IN \(([^)]*)\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(values).toEqual([...LOSS_REASON_CODES])
  })

  it('ajout seulement — la colonne est nullable, rien n’est réécrit', async () => {
    const queries = await run()
    expect(queries).toContain('ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS loss_reason_code text NULL')
    expect(queries.join(' ')).not.toMatch(/UPDATE opportunities/)
  })
})
