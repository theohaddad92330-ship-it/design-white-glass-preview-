import type { QueryRunner } from 'typeorm'
import { AgendaBellumCreatedEventAccountOptional1796350215111 } from '../1796350215111-AgendaBellumCreatedEventAccountOptional'

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

// #2770 (#2770.49/.50/.51) — un bloc de plan de journée n'a pas de compte.
describe('AgendaBellumCreatedEventAccountOptional1796350215111', () => {
  it('drops the NOT NULL constraint on account_id', async () => {
    const { runner, queries } = createRunner()
    await new AgendaBellumCreatedEventAccountOptional1796350215111().up(runner)
    const alter = queries.map(normalize).find(q => q.includes('ALTER TABLE agenda_bellum_created_event'))
    expect(alter).toBeDefined()
    expect(alter).toContain('ALTER COLUMN account_id DROP NOT NULL')
  })

  it('down() is not supported', async () => {
    await expect(new AgendaBellumCreatedEventAccountOptional1796350215111().down()).rejects.toThrow(
      'down migrations are not supported',
    )
  })
})
