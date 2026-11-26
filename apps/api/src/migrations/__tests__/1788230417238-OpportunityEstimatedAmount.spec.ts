import type { QueryRunner } from 'typeorm'
import { OpportunityEstimatedAmount1788230417238 } from '../1788230417238-OpportunityEstimatedAmount'

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

describe('OpportunityEstimatedAmount1788230417238', () => {
  it('adds a nullable numeric estimated_amount column, idempotently', async () => {
    const { runner, queries } = createRunner()
    await new OpportunityEstimatedAmount1788230417238().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE opportunities'))
    expect(alter).toBeDefined()
    expect(alter).toContain('ADD COLUMN IF NOT EXISTS estimated_amount numeric')
    // No backfill: we never invent a montant.
    expect(queries.some(q => normalize(q).includes('INSERT INTO'))).toBe(false)
    expect(queries.some(q => normalize(q).includes('UPDATE opportunities SET estimated_amount'))).toBe(false)
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new OpportunityEstimatedAmount1788230417238().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
