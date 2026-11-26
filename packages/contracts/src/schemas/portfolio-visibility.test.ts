import { describe, expect, it } from 'vitest'
import {
  isInPortfolio,
  portfolioScopeClause,
  portfolioScopeFor,
  setPortfolioVisibilitySchema,
} from './portfolio-visibility.js'
import { workspaceRoleValues } from './workspace.js'

/**
 * Le cloisonnement de portefeuille (décision D5).
 *
 * Trois propriétés portent la règle, et chacune répare un dégât précis :
 *  - le DÉFAUT ne bouge pas. Aucun espace existant ne voit sa visibilité
 *    changer : un commercial qui voyait 200 comptes n'en voit pas 12 du jour
 *    au lendemain parce qu'une version est passée ;
 *  - un responsable voit toujours tout, sinon il ne peut plus attribuer,
 *    rééquilibrer ni repérer ce qui dort ;
 *  - en mode cloisonné, les comptes LIBRES restent visibles de tous. Sans ça,
 *    ils disparaîtraient pour tout le monde sauf les responsables — et un
 *    compte que personne ne voit est un compte que personne ne travaille.
 */
describe('cloisonnement de portefeuille', () => {
  it('en mode ouvert, personne n’est cloisonné — c’est le comportement historique', () => {
    for (const role of workspaceRoleValues) {
      expect(portfolioScopeFor(role, 'open', 'u-1')).toBeNull()
    }
  })

  it('en mode cloisonné, un commercial ne voit que son portefeuille', () => {
    expect(portfolioScopeFor('sales', 'restricted', 'u-1')).toEqual({ ownerId: 'u-1', includeUnassigned: true })
  })

  it('en mode cloisonné, les comptes LIBRES restent visibles', () => {
    // Le point qu'on oublie en écrivant la requête. Sans lui, la file des
    // non-attribués se vide pour tout le monde sauf les responsables, et le
    // portefeuille cesse de circuler.
    expect(portfolioScopeFor('sales', 'restricted', 'u-1')?.includeUnassigned).toBe(true)
  })

  it('un responsable voit tout le portefeuille, même en mode cloisonné', () => {
    for (const role of ['owner', 'admin', 'sales_ops'] as const) {
      expect(portfolioScopeFor(role, 'restricted', 'u-1')).toBeNull()
    }
  })

  it('cloisonne les rôles qui n’ont pas la gestion d’équipe', () => {
    for (const role of ['sales', 'viewer', 'recruiter', 'finance', 'tech_admin'] as const) {
      expect(portfolioScopeFor(role, 'restricted', 'u-1')).not.toBeNull()
    }
  })

  it('cloisonne aussi le rôle `member` historique — il n’a jamais eu la gestion d’équipe', () => {
    expect(portfolioScopeFor('member', 'restricted', 'u-1')).toEqual({ ownerId: 'u-1', includeUnassigned: true })
  })

  it('refuse une valeur de réglage inventée', () => {
    expect(setPortfolioVisibilitySchema.safeParse({ visibility: 'private' }).success).toBe(false)
    expect(setPortfolioVisibilitySchema.safeParse({ visibility: 'restricted' }).success).toBe(true)
  })
})

/**
 * #4996 L3 — UNE définition de « ce compte est dans mon périmètre cloisonné ».
 * Porter, ne pas être porté, OU être co-équipier actif du compte (l'équipe voit l'ensemble).
 */
describe('portfolioScopeClause / isInPortfolio (#4996 L3)', () => {
  const scope = { ownerId: 'u-1', includeUnassigned: true } as const

  it('la clause SQL dit les trois moitiés : porté par moi, libre, co-équipier actif non archivé', () => {
    const sql = portfolioScopeClause('account')
    expect(sql).toContain('account.assigned_to = :ownerId')
    expect(sql).toContain('account.assigned_to IS NULL')
    expect(sql).toMatch(/account_team_members/)
    expect(sql).toContain('atm.account_id = account.id')
    expect(sql).toContain('atm.user_id = :ownerId')
    expect(sql).toContain('atm.removed_at IS NULL')
  })

  it('la clause suit l’alias de l’appelant', () => {
    expect(portfolioScopeClause('a')).toContain('a.assigned_to = :ownerId')
  })

  it('porté par moi, libre : dans le périmètre', () => {
    expect(isInPortfolio(scope, { assigned_to: 'u-1' }, false)).toBe(true)
    expect(isInPortfolio(scope, { assigned_to: null }, false)).toBe(true)
  })

  it('co-équipier actif d’un compte porté par un autre : dans le périmètre', () => {
    expect(isInPortfolio(scope, { assigned_to: 'u-2' }, true)).toBe(true)
  })

  it('NON : non-membre d’un compte porté par un autre — la garde sait dire non', () => {
    expect(isInPortfolio(scope, { assigned_to: 'u-2' }, false)).toBe(false)
  })

  it('sans scope (ouvert ou team:manage), tout est dans le périmètre', () => {
    expect(isInPortfolio(null, { assigned_to: 'u-2' }, false)).toBe(true)
  })
})
