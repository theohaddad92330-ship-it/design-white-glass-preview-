import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activeMobileTab, MOBILE_TABS } from '@/features/mobile/mobile-nav'

/**
 * #4158.53 — « Équipe » est atteignable sur MOBILE (quatre onglets du bas, pas de cinquième) dès deux
 * membres actifs, pour qui gère l'équipe ; solo, ou sur bureau : absente de la barre d'Actions.
 */

const state = vi.hoisted(() => ({ mobile: true, role: 'owner', memberCount: 3, pathname: '/actions' }))
const navigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: ({ select }: { select?: (location: { pathname: string; search: unknown }) => unknown } = {}) => {
    const location = { pathname: state.pathname, search: {} }
    return select ? select(location) : location
  },
  useRouterState: () => state.pathname,
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => <a href={to}>{children}</a>,
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: state.role, memberCount: state.memberCount } } }),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => state.mobile, useIsInstalled: () => false }))
vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: () => {} }))
vi.mock('@/features/rfp/hooks/useHasRfp', () => ({ useHasRfp: () => ({ data: false }) }))
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

beforeEach(() => {
  state.mobile = true
  state.role = 'owner'
  state.memberCount = 3
  state.pathname = '/actions'
  navigate.mockReset()
})

describe('Équipe sur mobile (#4158.53)', () => {
  it('porte Équipe dans la barre d’Actions dès deux membres actifs, et y mène', () => {
    render(<SectionTabs />)
    fireEvent.click(screen.getByRole('button', { name: 'Équipe' }))
    expect(navigate).toHaveBeenCalledWith({ to: '/team' })
  })

  it('solo : aucune entrée Équipe', () => {
    state.memberCount = 1
    render(<SectionTabs />)
    expect(screen.queryByRole('button', { name: 'Équipe' })).toBeNull()
  })

  it('un membre sans gestion d’équipe ne la voit pas', () => {
    state.role = 'sales'
    render(<SectionTabs />)
    expect(screen.queryByRole('button', { name: 'Équipe' })).toBeNull()
  })

  it('sur bureau, la barre latérale la porte déjà : pas de doublon dans la barre d’onglets', () => {
    state.mobile = false
    render(<SectionTabs />)
    expect(screen.queryByRole('button', { name: 'Équipe' })).toBeNull()
  })

  it('ne crée pas de cinquième onglet du bas : /team allume l’onglet Actions', () => {
    expect(MOBILE_TABS).toHaveLength(4)
    expect(activeMobileTab('/team')).toBe('/actions')
  })
})
