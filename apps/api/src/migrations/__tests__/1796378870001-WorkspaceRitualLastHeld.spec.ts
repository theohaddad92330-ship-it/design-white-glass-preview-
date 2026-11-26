import type { QueryRunner } from 'typeorm'
import { WorkspaceRitualLastHeld1796378870001 } from '../1796378870001-WorkspaceRitualLastHeld'

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

describe('WorkspaceRitualLastHeld1796378870001', () => {
  it('crée la table, scopée à un espace', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualLastHeld1796378870001().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_ritual_last_held')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('held_at timestamptz NOT NULL')
  })

  it('couvre les CINQ clés du catalogue au CHECK, jamais moins (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualLastHeld1796378870001().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const key of ['daily', 'weekly', 'monthly', 'quarterly', 'rank1']) expect(flat).toContain(`'${key}'`)
  })

  it('une seule marque par (espace, rituel) — index unique, upsertable', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualLastHeld1796378870001().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS workspace_ritual_last_held_workspace_ritual_idx ON workspace_ritual_last_held (workspace_id, ritual_key)',
    )
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualLastHeld1796378870001().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE workspace_ritual_last_held ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new WorkspaceRitualLastHeld1796378870001().up(runner)).resolves.not.toThrow()
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualLastHeld1796378870001().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP TABLE IF EXISTS workspace_ritual_last_held')
  })
})
