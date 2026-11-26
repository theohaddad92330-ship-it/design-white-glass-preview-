import { describe, expect, it } from 'vitest'
import {
  FINANCE_SCOPE_KINDS,
  UNASSIGNED_MISSIONS_SQL,
  financeScopeClause,
  financeScopeInfoSchema,
  type FinanceScope,
} from './finance-scope.js'

/**
 * La portée financière (D1 · 26/08/2026).
 *
 * Ce qui se teste ici n'est pas du SQL : c'est qu'une portée RESTREINTE
 * restreigne vraiment, qu'elle prenne les deux rattachements (la mission ET le
 * compte), et que « rattaché à personne » ne se confonde jamais avec « zéro ».
 */
const OWN: FinanceScope = { kind: 'own', workspaceId: 'ws-1', userId: 'u-1' }
const ALL: FinanceScope = { kind: 'workspace', workspaceId: 'ws-1' }

describe('financeScopeClause', () => {
  it('ne restreint RIEN sur la portée « espace »', () => {
    expect(financeScopeClause(ALL, 'm', 3)).toEqual({ sql: '', params: [] })
  })

  it('restreint sur les DEUX rattachements — la mission et le compte', () => {
    // Une mission créée depuis un projet gagné n'a souvent aucun propriétaire :
    // sans le second rattachement, le commercial qui a vendu le compte ne
    // verrait rien de ce qu'elle rapporte.
    const { sql, params } = financeScopeClause(OWN, 'm', 3)
    expect(sql).toContain('m.owner_id = $3::uuid')
    expect(sql).toContain('a.assigned_to = $3::uuid')
    expect(sql).toContain('m.account_id')
    expect(params).toEqual(['u-1'])
  })

  it('passe par EXISTS et non par une jointure', () => {
    // Une jointure sur `accounts` dupliquerait les lignes, et un SUM dupliqué
    // est un chiffre d'affaires faux.
    expect(financeScopeClause(OWN, 'm', 3).sql).toContain('EXISTS (SELECT 1 FROM accounts')
    expect(financeScopeClause(OWN, 'm', 3).sql).not.toMatch(/\bJOIN accounts\b/)
  })

  it('respecte l’index de paramètre qu’on lui donne', () => {
    // Le SQL du dépôt est en paramètres positionnels : se tromper d'index ferait
    // comparer un uuid à un mois.
    expect(financeScopeClause(OWN, 'm', 2).sql).toContain('$2::uuid')
    expect(financeScopeClause(OWN, 'm', 5).sql).toContain('$5::uuid')
    expect(financeScopeClause(OWN, 'm', 5).sql).not.toContain('$3')
  })

  it('respecte l’alias de table qu’on lui donne', () => {
    expect(financeScopeClause(OWN, 'mi', 3).sql).toContain('mi.owner_id')
  })

  it('commence par « AND » — elle se colle à un WHERE existant', () => {
    expect(financeScopeClause(OWN, 'm', 3).sql.trimStart().startsWith('AND ')).toBe(true)
  })
})

describe('le compte des missions hors périmètre', () => {
  it('ne retient QUE ce qui n’est rattaché à personne, des deux côtés', () => {
    expect(UNASSIGNED_MISSIONS_SQL).toContain('m.owner_id IS NULL')
    expect(UNASSIGNED_MISSIONS_SQL).toContain('a.assigned_to IS NOT NULL')
    expect(UNASSIGNED_MISSIONS_SQL).toContain('NOT EXISTS')
  })

  it('reste borné à l’espace', () => {
    expect(UNASSIGNED_MISSIONS_SQL).toContain('m.workspace_id = $1')
  })
})

describe('ce que l’écran reçoit', () => {
  it('accepte `null` hors périmètre sur la portée « espace »', () => {
    // « 0 hors périmètre » affiché en permanence est du bruit, et un bruit
    // permanent cesse d'être lu.
    expect(financeScopeInfoSchema.safeParse({ kind: 'workspace', outsideAnyPortfolio: null }).success).toBe(true)
  })

  it('accepte un COMPTE sur la portée restreinte', () => {
    expect(financeScopeInfoSchema.safeParse({ kind: 'own', outsideAnyPortfolio: 4 }).success).toBe(true)
  })

  it('refuse un compte négatif', () => {
    expect(financeScopeInfoSchema.safeParse({ kind: 'own', outsideAnyPortfolio: -1 }).success).toBe(false)
  })

  it('n’a que deux portées — en ajouter une troisième se déciderait', () => {
    expect([...FINANCE_SCOPE_KINDS]).toEqual(['workspace', 'own'])
  })
})
