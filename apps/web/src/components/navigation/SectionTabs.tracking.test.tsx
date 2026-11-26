import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1687 (trackTabOpened) — `SectionTabs` est la barre de SECTION, montée sur
 * quasiment tout écran client (`CustomerPageContent`). Un clic sur un onglet
 * émet `trackTabOpened(screen, tab)` — `screen` = la route de la SECTION
 * (jamais un identifiant), `tab` = la route de destination, jamais autre
 * chose. Ce test RENDS le composant réel (pas un miroir de sa logique, voir
 * `SectionTabs.test.tsx`), pour exercer le VRAI `onTabChange`.
 */

const navigate = vi.fn()
let currentPathname = '/projects'
// #3585.2 — la barre de famille de Comptes ne se rend plus que sur mobile.
let isMobile = false

vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => isMobile }))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => currentPathname,
}))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'member' } } }),
}))

const trackTabOpened = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackTabOpened: (...args: unknown[]) => trackTabOpened(...args),
}))

// #2169.6 — même raison que `SectionTabs.mobileGroupLabel.test.tsx` : ce
// fichier teste `trackTabOpened`, pas la visibilité de l'onglet RFP.
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

describe('SectionTabs — trackTabOpened, #1687', () => {
  beforeEach(() => {
    navigate.mockClear()
    trackTabOpened.mockClear()
    isMobile = false
  })

  // #4340/#4341 (Louis 19/10/2026) — Affaires n'a plus d'onglet : la barre à plat témoin est Missions.
  it('une barre À PLAT (Missions) : cliquer un onglet émet {screen: route de section, tab: route cliquée}', () => {
    // #4351.1 — la section Missions s'ouvre sur Planning (« En cours » a quitté la barre).
    currentPathname = '/missions/planification'
    render(<SectionTabs />)
    fireEvent.click(screen.getByText('Prêt à facturer'))
    expect(trackTabOpened).toHaveBeenCalledTimes(1)
    expect(trackTabOpened).toHaveBeenCalledWith('/missions/planification', '/missions/facturation')
    expect(navigate).toHaveBeenCalledWith({ to: '/missions/facturation' })
  })

  it('une barre À PLAT (Comptes) : même contrat — screen = route de la section', () => {
    // #2155.4/.5/.6 (15/09/2026) — Comptes groupait ses onglets sous « Suivre »
    // / « Trouver » / « Connaître » ; ces groupes ne servent plus de groupes de
    // NAVIGATION (mesuré en prod le 15/09 : ils restaient visibles en haut de
    // `/discover`). La barre est plate désormais, comme celle de Projets.
    // #3585.2 — barre de Comptes = MOBILE seulement ; sur desktop elle ne se rend pas.
    isMobile = true
    currentPathname = '/accounts'
    render(<SectionTabs />)
    fireEvent.click(screen.getByText('Contacts'))
    expect(trackTabOpened).toHaveBeenCalledTimes(1)
    expect(trackTabOpened).toHaveBeenCalledWith('/accounts', '/contacts')
  })

  // #2154.30 — la preuve que `tab_opened` fire sur la destination `/actions` de la migration de routes.
  it('une barre À PLAT (Actions) : screen = `/actions`, destination de la migration de routes (#2154.30)', () => {
    currentPathname = '/actions'
    render(<SectionTabs />)
    fireEvent.click(screen.getByText('Séquences'))
    expect(trackTabOpened).toHaveBeenCalledWith('/actions', '/actions/sequences')
  })

  it('dans une FICHE (barre absente) : aucun rendu, donc aucune émission possible', () => {
    currentPathname = '/accounts/3f1c4b7a-9e2d-4a11-8b3a-1234567890ab'
    const { container } = render(<SectionTabs />)
    expect(container).toBeEmptyDOMElement()
    expect(trackTabOpened).not.toHaveBeenCalled()
  })

  it('route hors catalogue (connexion) : aucun rendu, aucune émission', () => {
    currentPathname = '/login'
    const { container } = render(<SectionTabs />)
    expect(container).toBeEmptyDOMElement()
    expect(trackTabOpened).not.toHaveBeenCalled()
  })
})
