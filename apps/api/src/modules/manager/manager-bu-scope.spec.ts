import { accountRefScopeAnd, accountScopeAnd } from './manager-bu-scope'

const LYON = '11111111-1111-4111-8111-111111111111'
const PARIS = '22222222-2222-4222-8222-222222222222'

// #4158 (complément BU) — la clause du cockpit réutilise LA règle de la liste des comptes (jamais une seconde forme).
describe('manager-bu-scope', () => {
  it('sans cloisonnement : chaîne vide — la requête reste byte-identique', () => {
    expect(accountScopeAnd(null, 'business_unit_id')).toBe('')
    expect(accountRefScopeAnd(null, 'ua.account_id')).toBe('')
  })

  it('cloisonné à une BU : les comptes de cette BU ET les comptes sans BU, rien d’autre', () => {
    const sql = accountScopeAnd({ businessUnitIds: [LYON], includeUnassigned: true }, 'a.business_unit_id')
    expect(sql).toBe(` AND (a.business_unit_id IN ('${LYON}'::uuid) OR a.business_unit_id IS NULL)`)
    expect(sql).not.toContain(PARIS)
  })

  it('cloisonné à deux BU : les deux sont dans la liste', () => {
    const sql = accountScopeAnd({ businessUnitIds: [LYON, PARIS], includeUnassigned: true }, 'business_unit_id')
    expect(sql).toContain(LYON)
    expect(sql).toContain(PARIS)
  })

  it('cloisonné à AUCUNE BU : seuls les comptes sans BU restent (jamais « tout »)', () => {
    expect(accountScopeAnd({ businessUnitIds: [], includeUnassigned: true }, 'business_unit_id')).toBe(
      ' AND business_unit_id IS NULL',
    )
  })

  it('une référence de compte nullable : sans compte, ou compte du périmètre', () => {
    const sql = accountRefScopeAnd({ businessUnitIds: [LYON], includeUnassigned: true }, 'ua.account_id')
    expect(sql).toContain(
      'ua.account_id IS NULL OR ua.account_id IN (SELECT scoped_account.id FROM accounts scoped_account',
    )
    expect(sql).toContain(LYON)
    // La sous-requête reste bornée à l'espace (GA-46).
    expect(sql).toContain('scoped_account.workspace_id = $1')
  })

  it('un identifiant qui n’est pas un UUID ne s’écrit jamais dans la requête', () => {
    const hostile = { businessUnitIds: ["x'); DROP TABLE accounts; --"], includeUnassigned: true } as const
    expect(() => accountScopeAnd(hostile, 'business_unit_id')).toThrow('manager_bu_scope_invalid_id')
    expect(() => accountRefScopeAnd(hostile, 'ua.account_id')).toThrow('manager_bu_scope_invalid_id')
  })
})
