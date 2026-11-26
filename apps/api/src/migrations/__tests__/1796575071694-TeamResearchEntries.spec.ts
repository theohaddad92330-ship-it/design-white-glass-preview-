import type { QueryRunner } from 'typeorm'
import { TeamResearchEntries1796575071694 } from '../1796575071694-TeamResearchEntries'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(normalize(sql))
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

// Théo D team-recherches.N1 — l'historique de Découvrir devient lisible par l'équipe.
describe('TeamResearchEntries1796575071694', () => {
  it('crée la table additive, idempotente, avec RLS', async () => {
    const { runner, queries } = createRunner()
    await new TeamResearchEntries1796575071694().up(runner)
    expect(queries.some(q => q.includes('CREATE TABLE IF NOT EXISTS team_research_entries'))).toBe(true)
    expect(queries.some(q => q.includes('ENABLE ROW LEVEL SECURITY'))).toBe(true)
    expect(queries.some(q => q.includes('CREATE UNIQUE INDEX IF NOT EXISTS team_research_entries_user_key_idx'))).toBe(
      true,
    )
  })

  it('result_count reste nullable : non mesuré n’est pas zéro', async () => {
    const { runner, queries } = createRunner()
    await new TeamResearchEntries1796575071694().up(runner)
    const create = queries.find(q => q.includes('CREATE TABLE'))
    expect(create).toContain('result_count integer,')
  })

  it('down() n’est pas supporté', async () => {
    await expect(new TeamResearchEntries1796575071694().down()).rejects.toThrow('down migrations are not supported')
  })
})
