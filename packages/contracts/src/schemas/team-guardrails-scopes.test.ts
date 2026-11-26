import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_TEAM_SCOPE_LABEL_MAX,
  ACCOUNT_TEAM_SCOPE_LABEL_MIN,
  accountTeamMemberSchema,
  accountTeamResponseSchema,
  addAccountTeamScopeRequestSchema,
  canEditAccountTeam,
  canEditOwnScope,
} from './team-guardrails.js'

// #4996 L1 — le périmètre d'un membre sur un compte : entité du client OU texte libre.
const USER = '11111111-1111-4111-8111-111111111111'
const ENTITY = '22222222-2222-4222-8222-222222222222'
const BU = '33333333-3333-4333-8333-333333333333'

describe('addAccountTeamScopeRequestSchema (#4996)', () => {
  it('accepte une entité seule (le serveur recopie le libellé)', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, entity_id: ENTITY }).success).toBe(true)
  })

  it('accepte un texte libre seul', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, label: 'Retail France' }).success).toBe(true)
  })

  it('refuse quand l’entité ET le libellé sont absents', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER }).success).toBe(false)
  })

  it('refuse un libellé vide, d’espaces, trop court ou trop long', () => {
    for (const label of ['', '   ', 'a', ' a ', 'x'.repeat(ACCOUNT_TEAM_SCOPE_LABEL_MAX + 1)]) {
      expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, label }).success).toBe(false)
    }
  })

  it('accepte les bornes exactes du libellé', () => {
    for (const n of [ACCOUNT_TEAM_SCOPE_LABEL_MIN, ACCOUNT_TEAM_SCOPE_LABEL_MAX]) {
      expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, label: 'x'.repeat(n) }).success).toBe(true)
    }
  })

  it('refuse un identifiant d’entité qui n’est pas un uuid', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, entity_id: 'bnp' }).success).toBe(false)
  })

  // #4996.4 (Louis 02/11) — le périmètre se choisit aussi par BU de l'espace (`business_units`).
  it('accepte une BU seule (le serveur recopie le nom de la BU)', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, business_unit_id: BU }).success).toBe(true)
  })

  it('refuse une zone qui serait à la fois une entité ET une BU (une ligne = une chose)', () => {
    expect(
      addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, entity_id: ENTITY, business_unit_id: BU }).success,
    ).toBe(false)
  })

  it('refuse un identifiant de BU qui n’est pas un uuid', () => {
    expect(addAccountTeamScopeRequestSchema.safeParse({ user_id: USER, business_unit_id: 'lyon' }).success).toBe(false)
  })
})

describe('équipe de compte enrichie de scopes (#4996)', () => {
  const base = { user_id: USER, name: 'Léa M.', added_by_name: null, created_at: '2026-11-01T00:00:00.000Z' }

  it('un ancien payload sans scopes reste lisible (ajout seul)', () => {
    expect(accountTeamMemberSchema.safeParse(base).success).toBe(true)
  })

  it('porte les scopes d’un membre et du responsable', () => {
    const scope = { id: ENTITY, entity_id: null, label: 'IT Groupe' }
    const res = accountTeamResponseSchema.safeParse({
      responsible: { user_id: USER, name: 'Claire D.', scopes: [scope] },
      members: [{ ...base, scopes: [scope] }],
      can_edit: true,
      can_edit_own_scope: true,
    })
    expect(res.success).toBe(true)
  })
})

describe('droits d’équipe — fonctions pures (#4996 Q1)', () => {
  const account = { assigned_to: 'resp' }

  it('compose l’équipe : le responsable ou team:manage, jamais un autre commercial', () => {
    expect(canEditAccountTeam('sales', 'resp', account)).toBe(true)
    expect(canEditAccountTeam('owner', 'x', account)).toBe(true)
    expect(canEditAccountTeam('sales_ops', 'x', account)).toBe(true)
    expect(canEditAccountTeam('sales', 'x', account)).toBe(false)
    expect(canEditAccountTeam('viewer', 'x', account)).toBe(false)
  })

  it('son propre périmètre : tout membre du compte, même sans composer l’équipe', () => {
    expect(canEditOwnScope('sales', 'lea', account, true)).toBe(true)
    expect(canEditOwnScope('sales', 'lea', account, false)).toBe(false)
    expect(canEditOwnScope('owner', 'x', account, false)).toBe(true)
  })

  it('un compte sans responsable ne donne le droit à personne par défaut', () => {
    expect(canEditAccountTeam('sales', 'x', { assigned_to: null })).toBe(false)
  })
})
