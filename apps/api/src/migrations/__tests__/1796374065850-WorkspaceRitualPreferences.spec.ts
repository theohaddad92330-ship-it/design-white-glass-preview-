import type { QueryRunner } from 'typeorm'
import { WorkspaceRitualPreferences1796374065850 } from '../1796374065850-WorkspaceRitualPreferences'

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

describe('WorkspaceRitualPreferences1796374065850', () => {
  it('crée la table, scopée à un espace', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualPreferences1796374065850().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_ritual_preferences')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('disabled boolean NOT NULL DEFAULT false')
  })

  it('couvre les CINQ clés du catalogue au CHECK, jamais moins (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualPreferences1796374065850().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const key of ['daily', 'weekly', 'monthly', 'quarterly', 'rank1']) expect(flat).toContain(`'${key}'`)
  })

  it('une seule préférence par (espace, rituel) — index unique', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualPreferences1796374065850().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS workspace_ritual_preferences_workspace_ritual_idx ON workspace_ritual_preferences (workspace_id, ritual_key)',
    )
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualPreferences1796374065850().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE workspace_ritual_preferences ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('est idempotente (IF NOT EXISTS)', async () => {
    const { runner } = createRunner()
    await expect(new WorkspaceRitualPreferences1796374065850().up(runner)).resolves.not.toThrow()
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRitualPreferences1796374065850().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('DROP TABLE IF EXISTS workspace_ritual_preferences')
  })
})
