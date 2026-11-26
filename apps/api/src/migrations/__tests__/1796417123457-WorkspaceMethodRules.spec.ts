import type { QueryRunner } from 'typeorm'
import { METHOD_RULE_DOMAINS } from '@bellum/contracts'
import { WorkspaceMethodRules1796417123457 } from '../1796417123457-WorkspaceMethodRules'

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

describe('WorkspaceMethodRules1796417123457', () => {
  it('crée la table, scopée à un espace, une ligne par proposition', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceMethodRules1796417123457().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('CREATE TABLE IF NOT EXISTS workspace_method_rules')
    expect(flat).toContain('workspace_id uuid NOT NULL REFERENCES workspaces (id) ON DELETE CASCADE')
    expect(flat).toContain('CREATE UNIQUE INDEX IF NOT EXISTS workspace_method_rules_proposal_idx')
  })

  it('une règle naît désactivée et ne peut pas l’être sans raison', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceMethodRules1796417123457().up(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('enabled boolean NOT NULL DEFAULT false')
    expect(flat).toContain('CHECK (enabled OR disabled_reason IS NOT NULL)')
  })

  it('couvre les onze domaines du corpus au CHECK, jamais moins (GA-12)', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceMethodRules1796417123457().up(runner)
    const flat = queries.map(normalize).join(' ')
    for (const domain of METHOD_RULE_DOMAINS) expect(flat).toContain(`'${domain}'`)
  })

  it('down supprime la table', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceMethodRules1796417123457().down(runner)
    expect(queries.map(normalize).join(' ')).toContain('DROP TABLE IF EXISTS workspace_method_rules')
  })
})
