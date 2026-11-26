/**
 * #4491.1 (PR 12C, contrat validé par Louis le 24/10/2026, maquette V22 `.a14-daynav`) — LA BARRE DE MA
 * JOURNÉE : Ma journée · Mon agenda · Équipe · Pilotage, la MÊME sur /briefing, sur l'agenda (`?vue=agenda`),
 * sur /team et sur /pilotage, l'onglet actif juste. La Messagerie n'y est plus (desktop).
 *
 * Droits : Équipe aux gérants d'un espace d'équipe (`managerOnly` + `requiresTeam`, palier
 * `manager_cockpit`) ; un commercial voit Ma journée · Mon agenda · Pilotage.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const location = { pathname: '/briefing', search: {} as Record<string, unknown> }
const navigate = vi.fn()
let isMobile = false
const team = { role: 'owner', memberCount: 3 }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
  useLocation: ({ select }: { select: (value: typeof location) => unknown }) => select(location),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: team.role, memberCount: team.memberCount } } }),
}))
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => isMobile }))
vi.mock('@/lib/product-tracker', () => ({ trackTabOpened: () => {} }))
vi.mock('@/features/rfp/hooks/useWorkspaceHiddenSections', () => ({ useWorkspaceHiddenSections: () => [] }))

import { SectionTabs } from './SectionTabs'

/** Les onglets rendus, dans l'ordre, et celui qui est actif (`TabNav` le souligne : `bg-primary`). */
function bar(): { labels: string[]; active: string[] } {
  const tabs = [...document.querySelectorAll('button')].filter(node => node.textContent)
  return {
    labels: tabs.map(node => node.textContent?.trim() ?? ''),
    active: tabs
      .filter(node => node.parentElement?.querySelector(':scope > .bg-primary') != null)
      .map(node => node.textContent?.trim() ?? ''),
  }
}

function at(pathname: string, search: Record<string, unknown> = {}) {
  location.pathname = pathname
  location.search = search
  render(<SectionTabs />)
}

beforeEach(() => {
  isMobile = false
  team.role = 'owner'
  team.memberCount = 3
  navigate.mockClear()
  document.body.innerHTML = ''
})

describe('la barre de Ma journée (#4491.1)', () => {
  it.each([
    ['/briefing', {}, 'Ma journée'],
    ['/briefing', { vue: 'agenda' }, 'Mon agenda'],
    ['/team', {}, 'Équipe'],
    ['/pilotage', {}, 'Pilotage'],
  ] as const)('%s %o : la même barre, « %s » actif', (pathname, search, active) => {
    at(pathname, search)
    expect(screen.getByText('Ma journée')).toBeInTheDocument()
    expect(screen.getByText('Mon agenda')).toBeInTheDocument()
    expect(screen.getByText('Équipe')).toBeInTheDocument()
    expect(screen.getByText('Pilotage')).toBeInTheDocument()
    expect(bar().active).toContain(active)
  })

  it('dans cet ordre : Ma journée · Mon agenda · Équipe · Pilotage', () => {
    at('/briefing')
    const order = ['Ma journée', 'Mon agenda', 'Équipe', 'Pilotage'].map(label =>
      bar().labels.findIndex(text => text.startsWith(label)),
    )
    expect(order.every(index => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('la Messagerie n’est plus dans cette barre (desktop) — elle est une entrée de la barre latérale', () => {
    at('/briefing')
    expect(screen.queryByText('Messagerie')).toBeNull()
  })

  it('sur mobile, la Messagerie reste un tap plus loin depuis cette barre (coque à quatre onglets, GA-28)', () => {
    isMobile = true
    at('/briefing')
    expect(screen.getByText('Messagerie')).toBeInTheDocument()
  })

  it('« Mon agenda » ouvre la route d’agenda EXISTANTE (`/briefing?vue=agenda`), aucune route neuve', () => {
    at('/briefing')
    fireEvent.click(screen.getByText('Mon agenda'))
    expect(navigate).toHaveBeenCalledWith({ to: '/briefing', search: { vue: 'agenda' } })
  })

  it('sur /team, la page dessine ses six onglets : la barre ne les double PAS (recette PR 12, 24/10)', () => {
    at('/team')
    expect(screen.queryByText('Vue d’ensemble')).toBeNull()
    expect(screen.queryByText('Administration')).toBeNull()
    expect(screen.getByText('Ma journée')).toBeInTheDocument()
  })

  it('sur /team/activite, dont l’écran ne dessine aucun onglet, Équipe garde sa seconde rangée', () => {
    at('/team/activite')
    expect(screen.getByText('Vue d’ensemble')).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
  })
})

describe('droits — Équipe aux gérants seulement (#4491, section Droits)', () => {
  it('REFUS : un commercial ne voit PAS Équipe — Ma journée · Mon agenda · Pilotage', () => {
    team.role = 'member'
    at('/briefing')
    expect(screen.queryByText('Équipe')).toBeNull()
    expect(screen.getByText('Ma journée')).toBeInTheDocument()
    expect(screen.getByText('Mon agenda')).toBeInTheDocument()
    expect(screen.getByText('Pilotage')).toBeInTheDocument()
  })

  it('REFUS : un espace solo n’a pas d’Équipe, même pour son propriétaire', () => {
    team.memberCount = 1
    at('/pilotage')
    expect(screen.queryByText('Équipe')).toBeNull()
    expect(screen.getByText('Pilotage')).toBeInTheDocument()
  })

  it('Pilotage reste ouvert à tous (décision 15/10/2026)', () => {
    team.role = 'member'
    at('/pilotage')
    expect(screen.getByText('Pilotage')).toBeInTheDocument()
  })
})
