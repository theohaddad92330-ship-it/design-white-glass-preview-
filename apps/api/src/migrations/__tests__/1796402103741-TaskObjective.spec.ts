import type { QueryRunner } from 'typeorm'
import { TaskObjective1796402103741 } from '../1796402103741-TaskObjective'

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

// #2871 (#2395.8) — pourquoi la tâche, distinct de `expected_result` (« à quoi ressemble fait »).
describe('TaskObjective1796402103741', () => {
  it('adds objective (text, nullable — aucun objectif deviné pour une ligne existante)', async () => {
    const { runner, queries } = createRunner()
    await new TaskObjective1796402103741().up(runner)
    const flat = queries.map(normalize)
    const add = flat.find(q => q.includes('ADD COLUMN IF NOT EXISTS objective'))
    expect(add).toBeDefined()
    expect(add).toContain('text')
    expect(add).not.toContain('NOT NULL')
  })

  it('down() is not supported (repo convention — additive, forward-only)', async () => {
    await expect(new TaskObjective1796402103741().down()).rejects.toThrow('down migrations are not supported')
  })
})
