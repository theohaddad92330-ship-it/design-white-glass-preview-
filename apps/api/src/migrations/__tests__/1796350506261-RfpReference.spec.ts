import type { QueryRunner } from 'typeorm'
import { RfpReference1796350506261 } from '../1796350506261-RfpReference'

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

// #2957 (#2180.39) — la référence de consultation, additive et nullable.
describe('RfpReference1796350506261', () => {
  it('adds reference (varchar(200), nullable)', async () => {
    const { runner, queries } = createRunner()
    await new RfpReference1796350506261().up(runner)
    const add = queries.map(normalize).find(q => q.includes('ADD COLUMN IF NOT EXISTS reference'))
    expect(add).toBeDefined()
    expect(add).toContain('varchar(200)')
    expect(add).not.toContain('NOT NULL')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new RfpReference1796350506261().down()).rejects.toThrow('down migrations are not supported')
  })
})
