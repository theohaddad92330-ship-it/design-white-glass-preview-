import { QueryRunner } from 'typeorm'
import { ACCOUNT_TEAM_SCOPE_LABEL_MAX, ACCOUNT_TEAM_SCOPE_LABEL_MIN } from '@bellum/contracts'
import { AccountTeamScopes1796610035100 } from '../1796610035100-AccountTeamScopes'

// #4996 L1 — la contrainte SQL part AVANT le code qui écrit (GA-11/12) : le CHECK dit la même chose que le contrat.
describe('AccountTeamScopes (#4996 L1)', () => {
  const run = async (): Promise<string[]> => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new AccountTeamScopes1796610035100().up({ query } as unknown as QueryRunner)
    return query.mock.calls.map(c => String(c[0]))
  }

  it('crée la table additivement, sans toucher account_team_members hors RLS', async () => {
    const sqls = await run()
    expect(sqls.join('\n')).toMatch(/CREATE TABLE IF NOT EXISTS account_team_scopes/)
    expect(sqls.join('\n')).not.toMatch(/DROP |DELETE FROM|ALTER TABLE account_team_members (ADD|DROP|ALTER)/i)
  })

  it('écrit dans le CHECK les bornes du contrat', async () => {
    const create = (await run()).find(s => s.includes('CREATE TABLE IF NOT EXISTS account_team_scopes')) as string
    expect(create).toContain(
      `CHECK (length(btrim(label)) BETWEEN ${ACCOUNT_TEAM_SCOPE_LABEL_MIN} AND ${ACCOUNT_TEAM_SCOPE_LABEL_MAX})`,
    )
    expect(create).toMatch(/label text NOT NULL/)
    expect(create).toMatch(/entity_id uuid REFERENCES account_entities\(id\) ON DELETE SET NULL/)
    expect(create).toMatch(/account_id uuid NOT NULL REFERENCES accounts\(id\) ON DELETE CASCADE/)
    expect(create).toMatch(/\(removed_at IS NULL\) = \(removed_by IS NULL\)/)
  })

  it('pose les index d’unicité partiels (entité, libellé libre) et de lecture', async () => {
    const all = (await run()).join('\n')
    expect(all).toMatch(
      /UNIQUE INDEX IF NOT EXISTS account_team_scopes_entity_active[\s\S]*WHERE removed_at IS NULL AND entity_id IS NOT NULL/,
    )
    expect(all).toMatch(
      /UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active[\s\S]*lower\(btrim\(label\)\)[\s\S]*entity_id IS NULL/,
    )
    expect(all).toMatch(/account_team_scopes_account_idx/)
    expect(all).toMatch(/account_team_scopes_entity_idx/)
    expect(all).toMatch(/account_team_scopes_user_idx/)
  })

  it('pose la RLS en lecture sur les deux tables d’équipe, sans politique d’écriture', async () => {
    const all = (await run()).join('\n')
    expect(all).toMatch(/ALTER TABLE account_team_scopes ENABLE ROW LEVEL SECURITY/)
    expect(all).toMatch(/ALTER TABLE account_team_members ENABLE ROW LEVEL SECURITY/)
    expect(all).toMatch(/ON account_team_scopes\s+FOR SELECT/)
    expect(all).toMatch(/ON account_team_members\s+FOR SELECT/)
    expect(all).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/)
  })

  it('down() retire la table et sa politique, jamais account_team_members', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new AccountTeamScopes1796610035100().down({ query } as unknown as QueryRunner)
    const sqls = query.mock.calls.map(c => String(c[0]))
    expect(sqls.join('\n')).toMatch(/DROP TABLE IF EXISTS account_team_scopes/)
    expect(sqls.filter(q => /DROP TABLE/.test(q)).every(q => !q.includes('account_team_members'))).toBe(true)
  })
})
