import type { QueryRunner } from 'typeorm'
import { WorkspaceTeamPolicySettings1796440017293 } from '../1796440017293-WorkspaceTeamPolicySettings'

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

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new WorkspaceTeamPolicySettings1796440017293().up(runner)
  return queries.map(normalize).join(' ')
}

describe('WorkspaceTeamPolicySettings1796440017293 (#2770.37)', () => {
  it('crée UNE ligne par espace', async () => {
    const flat = await upSql()
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_team_policy_settings')
    expect(flat).toContain('workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE')
  })

  it('pose les contraintes AVANT tout code qui écrit (GA-11/GA-12) — mêmes bornes que le contrat', async () => {
    const flat = await upSql()
    expect(flat).toContain(
      "jsonb_typeof(prospecting_windows) = 'array' AND jsonb_array_length(prospecting_windows) <= 4",
    )
    expect(flat).toContain("jsonb_typeof(forbidden_windows) = 'array' AND jsonb_array_length(forbidden_windows) <= 4")
    expect(flat).toContain('max_meetings_per_day IS NULL OR (max_meetings_per_day >= 1 AND max_meetings_per_day <= 12)')
    expect(flat).toContain('daily_call_target IS NULL OR (daily_call_target >= 1 AND daily_call_target <= 200)')
  })

  it('active la RLS, lecture scopée à l’espace', async () => {
    const flat = await upSql()
    expect(flat).toContain('ALTER TABLE workspace_team_policy_settings ENABLE ROW LEVEL SECURITY')
    expect(flat).toContain('workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())')
  })

  it('down() supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceTeamPolicySettings1796440017293().down(runner)
    expect(queries.map(normalize).join(' ')).toContain('DROP TABLE IF EXISTS workspace_team_policy_settings')
  })
})
