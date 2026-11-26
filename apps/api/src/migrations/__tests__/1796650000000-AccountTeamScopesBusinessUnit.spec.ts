import { QueryRunner } from 'typeorm'
import { AccountTeamScopesBusinessUnit1796650000000 } from '../1796650000000-AccountTeamScopesBusinessUnit'

// #4996.4 (Louis 02/11) — une zone par BU de l'espace : la contrainte SQL s'élargit AVANT le code qui écrit (GA-11/12).
describe('AccountTeamScopesBusinessUnit (#4996.4)', () => {
  const run = async (dir: 'up' | 'down' = 'up'): Promise<string> => {
    const query = jest.fn().mockResolvedValue(undefined)
    await new AccountTeamScopesBusinessUnit1796650000000()[dir]({ query } as unknown as QueryRunner)
    return query.mock.calls.map(c => String(c[0])).join('\n')
  }

  it('ajoute une colonne NULLABLE, FK vers business_units en SET NULL — additif seulement', async () => {
    const all = await run()
    expect(all).toMatch(
      /ALTER TABLE account_team_scopes\s+ADD COLUMN IF NOT EXISTS business_unit_id uuid REFERENCES business_units\(id\) ON DELETE SET NULL/,
    )
    expect(all).not.toMatch(/business_unit_id uuid NOT NULL/)
    expect(all).not.toMatch(/DROP (TABLE|COLUMN)|DELETE FROM|UPDATE account_team_scopes/i)
  })

  it('une ligne = une entité OU une BU, jamais les deux (le libellé libre reste permis)', async () => {
    expect(await run()).toMatch(
      /account_team_scopes_entity_or_bu_check[\s\S]*CHECK \(entity_id IS NULL OR business_unit_id IS NULL\)/,
    )
  })

  it('unicité active par BU, et le libellé libre ne collisionne plus avec une zone de BU', async () => {
    const all = await run()
    expect(all).toMatch(
      /UNIQUE INDEX IF NOT EXISTS account_team_scopes_bu_active[\s\S]*\(account_id, user_id, business_unit_id\)[\s\S]*WHERE removed_at IS NULL AND business_unit_id IS NOT NULL/,
    )
    expect(all).toMatch(
      /UNIQUE INDEX IF NOT EXISTS account_team_scopes_label_active[\s\S]*WHERE removed_at IS NULL AND entity_id IS NULL AND business_unit_id IS NULL/,
    )
    expect(all).toMatch(/INDEX IF NOT EXISTS account_team_scopes_bu_idx/)
  })

  it('down() retire la colonne et rend l’index de libellé d’origine', async () => {
    const all = await run('down')
    expect(all).toMatch(/DROP COLUMN IF EXISTS business_unit_id/)
    expect(all).toMatch(/account_team_scopes_label_active[\s\S]*WHERE removed_at IS NULL AND entity_id IS NULL\s/)
  })
})
