import type { QueryRunner } from 'typeorm'
import { EsnTargetPersonas1796436218731 } from '../1796436218731-EsnTargetPersonas'

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

const run = async (direction: 'up' | 'down'): Promise<string> => {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  await new EsnTargetPersonas1796436218731()[direction](runner)
  return queries.map(normalize).join(' ')
}

describe('EsnTargetPersonas1796436218731 (#3754)', () => {
  it('crée la table scopée à un espace, en cascade', async () => {
    const flat = await run('up')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS esn_target_personas')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('title_normalized text NOT NULL')
  })

  it('contraint le niveau décideur à 1-4 dans la même migration', async () => {
    expect(await run('up')).toContain('CHECK (decision_level BETWEEN 1 AND 4)')
  })

  it('active la RLS : lecture des membres, écriture de l’auteur', async () => {
    const flat = await run('up')
    expect(flat).toContain('ALTER TABLE esn_target_personas ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('FROM workspace_members WHERE user_id = auth.uid()')
    expect(flat).toContain('auth.uid() = user_id')
  })

  it('down supprime la table', async () => {
    expect(await run('down')).toContain('DROP TABLE IF EXISTS esn_target_personas')
  })
})
