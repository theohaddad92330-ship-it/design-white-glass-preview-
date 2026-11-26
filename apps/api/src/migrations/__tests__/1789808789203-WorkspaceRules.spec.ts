import type { QueryRunner } from 'typeorm'
import { businessUnitAccountsVisibilityValues, workspaceExportPolicyValues } from '@bellum/contracts'
import { WorkspaceRules1789808789203 } from '../1789808789203-WorkspaceRules'

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

// #2081.14 — les règles d'espace : la contrainte AVANT le code qui écrit (GA-11 / GA-12).
describe('WorkspaceRules1789808789203', () => {
  it('crée la table, une ligne par espace, bornée à l’espace', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRules1789808789203().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS workspace_rules')
    expect(sql).toContain('workspace_id uuid PRIMARY KEY REFERENCES workspaces (id) ON DELETE CASCADE')
  })

  it('la contrainte connaît TOUTES les valeurs du contrat', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRules1789808789203().up(runner)
    const sql = normalize(queries.join(' '))

    for (const value of businessUnitAccountsVisibilityValues) expect(sql).toContain(`'${value}'`)
    for (const value of workspaceExportPolicyValues) expect(sql).toContain(`'${value}'`)
    expect(sql).toContain("business_unit_accounts_visibility text NOT NULL DEFAULT 'shared'")
    expect(sql).toContain("export_policy text NOT NULL DEFAULT 'everyone'")
  })

  it('porte la trace de qui a changé chaque règle, et quand', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRules1789808789203().up(runner)
    const sql = normalize(queries.join(' '))

    for (const rule of ['business_unit_accounts_visibility', 'export_policy']) {
      expect(sql).toContain(`${rule}_changed_by uuid`)
      expect(sql).toContain(`${rule}_changed_at timestamptz`)
    }
  })

  it('RLS : un membre LIT, personne n’écrit en direct', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRules1789808789203().up(runner)
    const sql = normalize(queries.join(' '))

    expect(sql).toContain('ALTER TABLE workspace_rules ENABLE ROW LEVEL SECURITY')
    expect(sql).toMatch(/CREATE POLICY "workspace_rules_member_read" ON workspace_rules FOR SELECT/)
    expect(sql).not.toMatch(/ON workspace_rules FOR (ALL|INSERT|UPDATE|DELETE)/)
  })

  it('sait redescendre', async () => {
    const { runner, queries } = createRunner()
    await new WorkspaceRules1789808789203().down(runner)
    expect(normalize(queries.join(' '))).toContain('DROP TABLE IF EXISTS workspace_rules')
  })
})
