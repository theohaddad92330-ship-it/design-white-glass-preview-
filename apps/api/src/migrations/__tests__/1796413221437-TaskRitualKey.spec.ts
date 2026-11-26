import type { QueryRunner } from 'typeorm'
import { TaskRitualKey1796413221437 } from '../1796413221437-TaskRitualKey'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

describe('TaskRitualKey1796413221437', () => {
  it('ajoute une colonne NULLABLE — les tâches existantes ne sont rattachées à aucun rituel', async () => {
    const { runner, queries } = createRunner()
    await new TaskRitualKey1796413221437().up(runner)
    expect(queries.join(' ')).toContain('ADD COLUMN IF NOT EXISTS ritual_key text')
    expect(queries.join(' ')).not.toContain('ritual_key text NOT NULL')
  })

  it('couvre les CINQ clés du catalogue au CHECK, jamais moins (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new TaskRitualKey1796413221437().up(runner)
    const flat = queries.join(' ')
    for (const key of ['daily', 'weekly', 'monthly', 'quarterly', 'rank1']) expect(flat).toContain(`'${key}'`)
  })

  it('down retire tout ce que up a posé', async () => {
    const { runner, queries } = createRunner()
    await new TaskRitualKey1796413221437().down(runner)
    expect(queries.join(' ')).toContain('DROP COLUMN IF EXISTS ritual_key')
  })
})
