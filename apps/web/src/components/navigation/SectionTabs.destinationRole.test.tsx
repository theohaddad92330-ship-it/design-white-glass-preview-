import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2112 — LES TROIS DESTINATIONS DU JOUR ONT UN RÔLE NON CONFONDABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS UNE BARRE D'ONGLETS DE PLUS
 * ─────────────────────────────────────────────────────────────────────────────
 * #2112 décrit trois destinations — Aujourd'hui, Messagerie, Tableau de bord —
 * et demande qu'un novice comprenne leur différence (#2112.54). La barre
 * existe DÉJÀ : `NAV_SECTIONS.today.tabs` la déclare et `SectionTabs` la rend
 * sur tout écran client. En écrire une seconde dans l'écran du brief aurait
 * dupliqué la même liste à deux endroits (#2112.5, #2112.29) — ce que la même
 * issue refuse deux fois.
 *
 * Ce qui manquait n'était pas la barre, c'était le RÔLE : « Décider et agir »,
 * « Traiter tes échanges », « Prendre du recul » (#2112.13 à #2112.15). Il est
 * posé sur les onglets eux-mêmes, en aide au SURVOL — « ne pas afficher ces
 * aides en permanence » (#2112.16) est écrit dans le retour.
 *
 * ⚠️ AUCUN RÔLE D'UTILISATEUR N'ENTRE ICI. Les trois onglets sont les mêmes
 * pour tout le monde : le rôle change l'ORDRE des cartes du brief, jamais la
 * navigation. Un test le tient.
 */

let currentPathname = '/briefing'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => currentPathname,
}))

const role = { current: 'member' }
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: role.current } } }),
}))

vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: () => {} }))

// #2169.6 — `SectionTabs` lit désormais `useHasRfp` pour l'onglet « Appels
// d'offres » ; ce fichier teste le rôle des TROIS destinations du jour, hors
// de la section « Opportunités » (visibilité couverte par
// `SectionTabs.rfpVisibility.test.tsx`).
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

/** L'onglet, par son libellé : c'est l'élément qui porte l'aide au survol. */
function tabHelp(label: string): string | null {
  const labelNode = screen.getByText(label)
  return labelNode.closest('[title]')?.getAttribute('title') ?? null
}

describe('le rôle de chaque destination du jour (#2112.13 à #2112.15)', () => {
  // #4491.1 (PR 12C, Louis 24/10/2026) — la Messagerie quitte la barre de Ma journée : il reste « Ma
  // journée » et son rôle ; « Mon agenda », « Pilotage » ne s'en inventent pas.
  it('« Ma journée » porte son aide, et la Messagerie n’est plus dans la barre', () => {
    currentPathname = '/briefing'
    render(<SectionTabs />)
    expect(tabHelp('Ma journée')).toBe('Décider et agir.')
    expect(tabHelp('Mon agenda')).toBeNull()
    expect(screen.queryByText('Messagerie')).toBeNull()
  })

  it('l’aide ne s’affiche PAS en permanence (#2112.16)', () => {
    currentPathname = '/briefing'
    const { container } = render(<SectionTabs />)
    // Elle est là pour le survol et pour l'infobulle du navigateur ; l'écrire
    // sous chaque onglet ferait trois lignes de prose dans une barre de
    // navigation, et la barre cesserait d'être une barre.
    expect(container.textContent).not.toContain('Décider et agir.')
    expect(container.textContent).not.toContain('Prendre du recul.')
  })

  it('sait dire NON : un onglet sans rôle déclaré ne porte AUCUNE aide inventée', () => {
    // #4340/#4341 (Louis 19/10/2026) — Affaires n'a plus d'onglet : le témoin est Missions.
    currentPathname = '/missions/planification'
    render(<SectionTabs />)
    // La section Missions ne déclare pas de rôle par onglet. Une aide générée
    // depuis le libellé (« Ouvrir Facturation ») n'apprendrait rien et ferait
    // croire que la barre explique quelque chose.
    expect(tabHelp('Prêt à facturer')).toBeNull()
  })

  it('le RÔLE de la personne ne change pas les trois destinations', () => {
    currentPathname = '/briefing'
    role.current = 'member'
    const asMember = render(<SectionTabs />).container.textContent
    role.current = 'owner'
    const asOwner = render(<SectionTabs />).container.textContent
    expect(asOwner).toBe(asMember)
    role.current = 'member'
  })
})
