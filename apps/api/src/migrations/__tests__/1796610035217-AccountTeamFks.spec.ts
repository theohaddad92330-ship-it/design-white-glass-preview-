import { QueryRunner } from 'typeorm'
import { AccountTeamFks1796610035217 } from '../1796610035217-AccountTeamFks'

// #4996 L8 — rétrécir : la FK se pose NOT VALID, les orphelins sont comptés AVANT VALIDATE, et la migration
// ÉCHOUE en le disant s'il y en a (elle ne supprime rien : on archive, on ne supprime pas).
describe('AccountTeamFks (#4996 L8)', () => {
  const make = (orphans: number) => {
    const query = jest.fn(async (sql: string) => (/count\(\*\)/i.test(sql) ? [{ n: String(orphans) }] : undefined))
    return { query, runner: { query } as unknown as QueryRunner }
  }
  const sqlsOf = (query: jest.Mock): string[] => query.mock.calls.map(c => String(c[0]))

  it('pose la FK NOT VALID, compte les orphelins, puis VALIDATE — dans cet ordre', async () => {
    const { query, runner } = make(0)
    await new AccountTeamFks1796610035217().up(runner)
    const sqls = sqlsOf(query)
    const add = sqls.findIndex(s =>
      /ADD CONSTRAINT account_team_members_account_fk[\s\S]*REFERENCES accounts\(id\)[\s\S]*NOT VALID/.test(s),
    )
    const count = sqls.findIndex(s => /count\(\*\)/i.test(s))
    const validate = sqls.findIndex(s => /VALIDATE CONSTRAINT account_team_members_account_fk/.test(s))
    expect(add).toBeGreaterThanOrEqual(0)
    expect(count).toBeGreaterThan(add)
    expect(validate).toBeGreaterThan(count)
  })

  it('compte les orphelins par anti-jointure sur accounts', async () => {
    const { query, runner } = make(0)
    await new AccountTeamFks1796610035217().up(runner)
    const count = sqlsOf(query).find(s => /count\(\*\)/i.test(s)) as string
    expect(count).toMatch(/FROM account_team_members[\s\S]*LEFT JOIN accounts[\s\S]*accounts\.id IS NULL/)
  })

  it('ÉCHOUE en disant le nombre d’orphelins, sans VALIDATE ni suppression', async () => {
    const { query, runner } = make(3)
    await expect(new AccountTeamFks1796610035217().up(runner)).rejects.toThrow(/3 ligne\(s\) orpheline\(s\)/)
    const all = sqlsOf(query).join('\n')
    expect(all).not.toMatch(/VALIDATE CONSTRAINT/)
    expect(all).not.toMatch(/DELETE FROM|UPDATE account_team_members/i)
  })

  it('ne pose pas de FK composite d’entité (SET NULL (colonne) exige PostgreSQL 15+, non vérifié sur Supabase)', async () => {
    const { query, runner } = make(0)
    await new AccountTeamFks1796610035217().up(runner)
    expect(sqlsOf(query).join('\n')).not.toMatch(/account_entities|SET NULL \(/)
  })

  it('down symétrique : retire la FK, ne touche ni la table ni les lignes', async () => {
    const { query, runner } = make(0)
    await new AccountTeamFks1796610035217().down(runner)
    const sqls = sqlsOf(query)
    expect(sqls).toHaveLength(1)
    expect(sqls[0]).toMatch(/DROP CONSTRAINT IF EXISTS account_team_members_account_fk/)
    expect(sqls[0]).not.toMatch(/DROP TABLE|DELETE/i)
  })
})
