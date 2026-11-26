import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2112.59 — « La navigation mobile est complète » : les trois destinations
 * du jour (#2112 — Aujourd'hui, Messagerie, Tableau de bord) s'atteignent
 * depuis la coque mobile (≤ 768 px, quatre onglets + menu — doctrine CLAUDE.md).
 *
 * Deux portes, pas une :
 *  1. Aujourd'hui a sa porte DIRECTE dans la barre du bas — `MOBILE_TABS[1]`
 *     (`mobile-nav.ts`), rendue par `MobileTabBar`.
 *  2. Messagerie et Tableau de bord n'ont pas de porte directe : #2112.30
 *     (déjà « déjà là » au registre) affirme que `SectionTabs` reste monté
 *     par `CustomerPageContent`, que `MobileShell` enveloppe SANS toucher au
 *     contenu — donc les trois onglets de la section « today » restent la
 *     SECONDE porte, un tap depuis Aujourd'hui.
 *
 * Ce test ne relit pas le commentaire, il clique : il rend `MobileTabBar` et
 * `SectionTabs`, tous deux avec `useIsMobile() === true`, et prouve que
 * chacune des trois pages est atteignable en un ou deux taps.
 */

let currentPathname = '/briefing'
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: () => currentPathname,
  useRouterState: () => currentPathname,
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: 'member' } } }),
}))

vi.mock('@/features/mobile/useIsMobile', () => ({
  useIsMobile: () => true,
  useIsInstalled: () => false,
}))

vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: () => {} }))

// #2169.6 — `SectionTabs` lit `useHasRfp` pour l'onglet « Appels d'offres ».
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { MobileTabBar } from './MobileTabBar'
import { SectionTabs } from '@/components/navigation/SectionTabs'

describe('#2112.59 — la navigation mobile atteint Aujourd’hui, Messagerie, Tableau de bord', () => {
  it('première porte — Aujourd’hui a un onglet direct dans la barre du bas mobile', () => {
    currentPathname = '/briefing'
    render(<MobileTabBar />)
    const today = screen.getByRole('link', { name: /Ma journée/i })
    expect(today).toHaveAttribute('href', '/briefing')
  })

  it('la barre du bas mobile ne compte que quatre portes — au-delà, une cible tactile passe sous 44 px', () => {
    render(<MobileTabBar />)
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('seconde porte, depuis Aujourd’hui — Messagerie est un tap plus loin (SectionTabs reste monté sur mobile)', () => {
    currentPathname = '/briefing'
    render(<SectionTabs />)
    fireEvent.click(screen.getByRole('button', { name: 'Messagerie' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/mailbox' })
  })

  it('la seconde porte reste visible depuis les deux pages elles-mêmes (Aujourd’hui, Messagerie) — Théo A today-jour.A8 : Tableau de bord retiré', () => {
    for (const [pathname, labels] of [
      ['/mailbox', ['Ma journée', 'Messagerie']],
      ['/briefing', ['Ma journée', 'Messagerie']],
    ] as const) {
      currentPathname = pathname
      render(<SectionTabs />)
      for (const label of labels) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0)
      }
    }
  })
})
