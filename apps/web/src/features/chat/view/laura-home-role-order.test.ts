import { describe, expect, it } from 'vitest'
import type { WorkspaceRole } from '@bellum/contracts'
import {
  HOME_SUGGESTION_FAMILIES,
  KNOWN_WORKSPACE_ROLES,
  homeReadingOf,
  orderByRole,
  readingFamilies,
  type HomeSuggestionFamily,
} from './laura-home-role-order'
import { MAX_HOME_SUGGESTIONS, resolveLauraHomeSuggestions, type LauraHomeContext } from './laura-home-suggestions'

/**
 * #1909.3 — LE RÔLE ORDONNE, IL NE FILTRE PAS.
 *
 * 🔴 Le risque que cette garde tient, et rien d'autre : si le rôle filtrait,
 * quelqu'un perdrait des suggestions à cause de son étiquette — et ça ne se
 * verrait nulle part, puisqu'il ne peut pas savoir ce qu'il ne voit pas. Chaque
 * test ci-dessous compare donc l'ENSEMBLE servi à un rôle avec celui du défaut.
 *
 * Les trois preuves qu'une garde doit faire :
 *  · elle LIT quelque chose — le corpus des rôles et des lectures est mesuré,
 *    pas supposé (§ « ce que la garde lit ») ;
 *  · elle sait dire NON — un rôle qui retirerait ne serait-ce qu'une suggestion
 *    la fait rougir, et le test qui le prouve est écrit avec un ordonnanceur
 *    volontairement fautif (§ « elle sait dire NON ») ;
 *  · elle n'attrape pas ce qu'elle ne vise pas — un rôle inconnu et un rôle
 *    absent retombent sur le comportement d'avant ce fichier, à l'identique
 *    (§ « le témoin »).
 */

const t = ((key: string) => key) as unknown as Parameters<typeof resolveLauraHomeSuggestions>[0]

/** Les contextes qui comptent : le repli, chaque signal seul, et tout à la fois. */
const CONTEXTS: Record<string, LauraHomeContext> = {
  'aucun signal': { hasPortfolio: false, hasVivier: false, hasPartners: false },
  'vivier seul': { hasPortfolio: false, hasVivier: true, hasPartners: false },
  'portefeuille seul': { hasPortfolio: true, hasVivier: false, hasPartners: false },
  'partenaires seuls': { hasPortfolio: false, hasVivier: false, hasPartners: true },
  'espace mature': { hasPortfolio: true, hasVivier: true, hasPartners: true },
}

const idsFor = (context: LauraHomeContext, role: WorkspaceRole | null): string[] =>
  resolveLauraHomeSuggestions(t, { ...context, role }).map(suggestion => suggestion.id)

// ── Ce que la garde LIT ──────────────────────────────────────────────────────

describe('le corpus', () => {
  it('lit les neuf rôles de l’espace, et chacun a une lecture', () => {
    expect(KNOWN_WORKSPACE_ROLES.length).toBeGreaterThanOrEqual(9)
    for (const role of KNOWN_WORKSPACE_ROLES) {
      const families = readingFamilies(homeReadingOf(role))
      // Une lecture à trois familles serait un filtre déguisé en tri.
      expect([...families].sort(), role).toEqual([...HOME_SUGGESTION_FAMILIES].sort())
    }
  })

  it('les rôles ne lisent pas tous la même chose — sinon le classement serait un no-op', () => {
    const readings = new Set(KNOWN_WORKSPACE_ROLES.map(role => homeReadingOf(role)))
    expect(readings.size).toBeGreaterThan(1)
  })
})

// ── La règle : même ensemble, autre ordre ────────────────────────────────────

describe('le rôle ordonne, il ne filtre pas', () => {
  it.each(Object.entries(CONTEXTS))('%s — tous les rôles reçoivent le MÊME ensemble', (_label, context) => {
    const reference = idsFor(context, null)
    for (const role of KNOWN_WORKSPACE_ROLES) {
      const served = idsFor(context, role)
      // #3773 — jamais complété : le NOMBRE est celui du défaut (au plus quatre), pas toujours quatre.
      expect(served.length, role).toBeLessThanOrEqual(MAX_HOME_SUGGESTIONS)
      expect(served.length, role).toBe(reference.length)
      expect([...served].sort(), role).toEqual([...reference].sort())
    }
  })

  it('l’ordre CHANGE vraiment pour un espace mature — sinon le rôle ne pèse rien', () => {
    const asExecutive = idsFor(CONTEXTS['espace mature']!, 'owner')
    const asRecruiter = idsFor(CONTEXTS['espace mature']!, 'recruiter')
    expect(asRecruiter).not.toEqual(asExecutive)
    // …et c'est bien le MÊME ensemble qui a bougé.
    expect([...asRecruiter].sort()).toEqual([...asExecutive].sort())
  })
})

// ── Elle sait dire NON ───────────────────────────────────────────────────────

describe('elle sait dire NON', () => {
  it('un ordonnanceur qui FILTRE au lieu d’ordonner rougit', () => {
    const reference = idsFor(CONTEXTS['espace mature']!, null)
    // L'erreur qu'on redoute, écrite à la main : garder les familles de la
    // lecture et jeter les autres.
    const filtered = reference.filter((_id, index) => index % 2 === 0)
    expect(() => expect([...filtered].sort()).toEqual([...reference].sort())).toThrow()
  })

  it('une famille inconnue de la lecture passe en FIN, elle ne disparaît pas', () => {
    const items = [
      { id: 'a', family: 'vivier' as HomeSuggestionFamily },
      { id: 'b', family: 'inconnue' as unknown as HomeSuggestionFamily },
      { id: 'c', family: 'partners' as HomeSuggestionFamily },
    ]
    const ordered = orderByRole(items, 'recruiter', item => item.family)
    expect(ordered.map(item => item.id)).toEqual(['a', 'c', 'b'])
  })

  it('le tri est stable : deux suggestions d’une même famille gardent leur ordre', () => {
    const items = [
      { id: 'x', family: 'portfolio' as HomeSuggestionFamily },
      { id: 'y', family: 'portfolio' as HomeSuggestionFamily },
      { id: 'z', family: 'vivier' as HomeSuggestionFamily },
    ]
    expect(orderByRole(items, 'recruiter', item => item.family).map(item => item.id)).toEqual(['z', 'x', 'y'])
  })
})

// ── Le témoin : ce qu'elle ne vise PAS ───────────────────────────────────────

describe('le témoin', () => {
  it('un rôle inconnu et un rôle absent rendent EXACTEMENT l’ordre d’avant ce fichier', () => {
    const inconnu = 'chef_de_projet' as WorkspaceRole
    for (const [label, context] of Object.entries(CONTEXTS)) {
      const reference = resolveLauraHomeSuggestions(t, context).map(suggestion => suggestion.id)
      expect(idsFor(context, null), label).toEqual(reference)
      expect(idsFor(context, inconnu), label).toEqual(reference)
      expect(homeReadingOf(inconnu)).toBe('sales')
    }
  })

  it('un rôle ne change rien quand une seule famille est vraie — il n’y a rien à ranger', () => {
    for (const role of KNOWN_WORKSPACE_ROLES) {
      expect(idsFor(CONTEXTS['vivier seul']!, role), role).toEqual(idsFor(CONTEXTS['vivier seul']!, null))
    }
  })
})
