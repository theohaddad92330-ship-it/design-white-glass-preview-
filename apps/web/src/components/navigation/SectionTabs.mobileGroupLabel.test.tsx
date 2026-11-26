import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2155.26 — sur mobile, aucune barre latérale ne monte le tiroir dépliable
 * « Prospection » (`AppSidebar`, #2155.1) : `MobileShell` la remplace
 * entièrement par la barre d'onglets du bas. Cette étiquette, au-dessus de la
 * barre de section, est la seule occasion mobile de nommer le regroupement —
 * ce n'est PAS un cinquième onglet.
 */

let isMobile = false
let currentPathname = '/accounts'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => currentPathname,
}))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'member' } } }),
}))

vi.mock('@/features/mobile/useIsMobile', () => ({
  useIsMobile: () => isMobile,
}))

vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: vi.fn() }))

// #2169.6 — `SectionTabs` lit désormais `useHasRfp` pour l'onglet « Appels
// d'offres » ; ce fichier teste le regroupement mobile, pas cette visibilité
// (couverte par `SectionTabs.rfpVisibility.test.tsx`). Mocké VRAI pour garder
// les onglets déclarés inchangés ici.
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

describe('SectionTabs — l’étiquette « Prospection » sur mobile (#2155.26)', () => {
  it('nomme le groupe sur mobile, sur une page du groupe (Comptes)', () => {
    isMobile = true
    currentPathname = '/accounts'
    render(<SectionTabs />)
    expect(screen.getByText('Prospection')).toBeInTheDocument()
  })

  it('ne nomme rien sur bureau — le tiroir de la barre latérale le dit déjà', () => {
    isMobile = false
    currentPathname = '/accounts'
    render(<SectionTabs />)
    expect(screen.queryByText('Prospection')).not.toBeInTheDocument()
  })

  it('ne nomme rien sur une section sans `sidebarGroup` (Projets), même sur mobile', () => {
    isMobile = true
    currentPathname = '/projects'
    render(<SectionTabs />)
    expect(screen.queryByText('Prospection')).not.toBeInTheDocument()
  })
})
