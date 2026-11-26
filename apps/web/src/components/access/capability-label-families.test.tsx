import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { toolFamilyValues, type RouteAccess } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { CapabilityBanner, CAPABILITY_LABEL_KEYS } = await import('./CapabilityBanner')

/**
 * #1932.4 — LA MÊME LOGIQUE POUR LES QUATRE FAMILLES, ET DONC LES MÊMES MOTS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE TIENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le répertoire de libellés du bandeau était écrit sur `agenda` et `drive`.
 * Ce ne sont pas des valeurs que le produit PRODUIT : `access.missing` vient de
 * `tool.family` (`useRouteAccess.ts:69`), et `ToolFamily` dit `calendar` et
 * `documents` (`packages/contracts/src/schemas/tool-registry.ts`). Deux des cinq
 * entrées ne pouvaient donc JAMAIS être atteintes — un écran dégradé faute
 * d'agenda aurait dit « Continuer sans cet outil » pendant que le répertoire
 * portait « ton agenda », juste à côté, inutilisable.
 *
 * C'est la famille de défauts n°1 du dépôt vue par le petit bout : un prédicat
 * comparé à des valeurs que rien n'émet. Il est invisible aux tests dont les
 * fixtures INVENTENT la donnée — et c'était exactement le cas ici
 * (`missing: ['agenda']` dans `CapabilityBanner.test.tsx`).
 *
 * La première défense est le TYPE (`Partial<Record<ToolFamily, string>>` : écrire
 * `agenda:` ne compile plus). Cette garde est la seconde, celle qui LIT et qui
 * sait dire non à l'exécution.
 */
describe('#1932.4 — les libellés de capacité nomment des familles RÉELLES', () => {
  const isRealFamily = (key: string): boolean => (toolFamilyValues as readonly string[]).includes(key)

  it('LIT quelque chose : le répertoire et le corpus des familles ne sont pas vides', () => {
    expect(Object.keys(CAPABILITY_LABEL_KEYS).length).toBeGreaterThanOrEqual(5)
    expect(toolFamilyValues.length).toBeGreaterThanOrEqual(10)
  })

  it('chaque clé du répertoire est une famille que le produit émet', () => {
    const inventees = Object.keys(CAPABILITY_LABEL_KEYS).filter(key => !isRealFamily(key))

    expect(inventees).toEqual([])
  })

  it('SAIT DIRE NON : un répertoire écrit sur des familles inventées est rejeté', () => {
    // Le répertoire d'AVANT, verbatim. La garde doit le refuser, sinon elle ne
    // garde rien — et c'est bien lui qui tournait en production.
    const repertoireCasse = { crm: 'x', email: 'x', agenda: 'x', drive: 'x', ats: 'x' }

    expect(Object.keys(repertoireCasse).filter(key => !isRealFamily(key))).toEqual(['agenda', 'drive'])
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas : une famille réelle ABSENTE du répertoire reste légitime', () => {
    // `telephony` existe, et n'a pas de libellé : c'est un choix, pas un défaut.
    // La garde porte sur « la clé existe-t-elle ? », jamais sur « le répertoire
    // est-il exhaustif ? » — l'exhaustivité forcerait à inventer des mots.
    expect(isRealFamily('telephony')).toBe(true)
    expect(CAPABILITY_LABEL_KEYS).not.toHaveProperty('telephony')
  })
})

/**
 * Et la preuve par l'ÉCRAN : ce sont les vraies familles qui donnent les vrais
 * mots. Un test de table seul aurait pu rester vert sur un `t()` sans clé.
 */
describe('#1932.4 — les quatre familles se nomment à l’écran', () => {
  const degraded = (missing: string[]): RouteAccess => ({ state: 'degraded', missing })

  it.each([
    ['crm', 'ton CRM'],
    ['email', 'ta messagerie'],
    ['calendar', 'ton agenda'],
    ['documents', 'tes documents'],
    ['ats', 'ton ATS'],
  ])('%s se dit « %s »', (family, mot) => {
    render(<CapabilityBanner access={degraded([family])} />)

    expect(screen.getByRole('button', { name: `Continuer sans ${mot}` })).toBeInTheDocument()
  })

  it('une famille réelle sans libellé retombe sur le mot générique, elle n’invente pas', () => {
    render(<CapabilityBanner access={degraded(['telephony'])} />)

    expect(screen.getByRole('button', { name: 'Continuer sans cet outil' })).toBeInTheDocument()
  })
})
