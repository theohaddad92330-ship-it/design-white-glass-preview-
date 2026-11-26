import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Le coquille de la page Pilotage : en-tête, ancres, droit par section. Ce que chaque section contient a
// ses propres tests (CockpitBody, PipeScreen, StaffingScreen, FinanceScreen).
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  useAskLauraIntro: () => false,
}))
vi.mock('@/hooks/useFirstName', () => ({ useFirstName: () => 'Louis' }))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
const profile = vi.hoisted(() => ({ current: null as null | 'forfait_conseil' }))
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => profile.current }))
const team = vi.fn()
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => team() }))
// Louis 23/10 — l'offre `manager_cockpit` est lue par la route et arrive en `offerAllowed`.
const offer = { allowed: true }
vi.mock('@/features/plan-features/PlanFeatureLocked', () => ({
  PlanFeatureLocked: () => <div data-testid="plan-locked" />,
}))
vi.mock('./CockpitBody', () => ({ CockpitBody: () => <div data-testid="cockpit-body" /> }))
vi.mock('./cockpit/useCockpitFigures', () => ({ useCockpitFigures: () => ({}) }))
vi.mock('./cockpit/CockpitExportButton', () => ({
  CockpitExportButton: () => <button type="button">Exporter la synthèse</button>,
}))
vi.mock('../pipe/PipeScreen', () => ({
  PipeScreen: ({ manager, own }: { manager?: boolean; own?: boolean }) => (
    <div data-testid="pipe" data-manager={String(manager)} data-own={String(own)} />
  ),
}))
vi.mock('../staffing/StaffingScreen', () => ({ StaffingScreen: () => <div data-testid="staffing" /> }))
vi.mock('../finance/FinanceScreen', () => ({ FinanceScreen: () => <div data-testid="finance" /> }))

const { PilotagePage } = await import('./PilotagePage')

const asRole = (role: string | null) =>
  team.mockReturnValue({ team: role ? { workspace: { role } } : undefined, isLoading: false })

beforeEach(() => {
  profile.current = null
  asRole('admin')
  offer.allowed = true
})

describe('Pilotage — une page, quatre sections ancrées (Théo D pilotage.A0)', () => {
  it('le titre et le sous-titre de Théo, sans formule chiffrée ni pastille dans l’en-tête (R1)', () => {
    render(<PilotagePage offerAllowed={offer.allowed} />)
    expect(screen.getByText('Piloter ton activité')).toBeInTheDocument()
    expect(screen.getByText('Les décisions commerciales avant les compteurs.')).toBeInTheDocument()
    expect(screen.queryByText(/Voici où ton système décroche/)).not.toBeInTheDocument()
  })

  it('quatre ancres collantes : Cockpit · Pipe · Staffing · Finance', () => {
    render(<PilotagePage offerAllowed={offer.allowed} />)
    const nav = screen.getByRole('navigation', { name: 'Sections de Pilotage' })
    const links = Array.from(nav.querySelectorAll('a')).map(link => [link.textContent, link.getAttribute('href')])
    expect(links).toEqual([
      ['Cockpit', '#cockpit'],
      ['Pipe', '#pipe'],
      ['Staffing', '#staffing'],
      ['Finance', '#finance'],
    ])
    for (const id of ['cockpit', 'pipe', 'staffing', 'finance']) expect(document.getElementById(id)).not.toBeNull()
  })

  it('en forfait / conseil, Staffing passe en dernier — les ancres ET les sections (#4270.2, c76)', () => {
    profile.current = 'forfait_conseil'
    render(<PilotagePage offerAllowed={offer.allowed} />)
    const nav = screen.getByRole('navigation', { name: 'Sections de Pilotage' })
    expect(Array.from(nav.querySelectorAll('a')).map(link => link.textContent)).toEqual([
      'Cockpit',
      'Pipe',
      'Finance',
      'Staffing',
    ])
    const ids = Array.from(document.querySelectorAll('section[id]')).map(node => node.id)
    expect(ids).toEqual(['cockpit', 'pipe', 'finance', 'staffing'])
  })

  it('un gestionnaire avec l’offre voit les quatre sections et l’export', () => {
    render(<PilotagePage offerAllowed={offer.allowed} />)
    expect(screen.getByTestId('cockpit-body')).toBeInTheDocument()
    expect(screen.getByTestId('staffing')).toBeInTheDocument()
    expect(screen.getByTestId('finance')).toBeInTheDocument()
    expect(screen.getByTestId('pipe')).toHaveAttribute('data-manager', 'true')
    expect(screen.getByRole('button', { name: 'Exporter la synthèse' })).toBeInTheDocument()
  })

  it('un membre : son pipe (chacun son pipe), Parcours, et la phrase de rôle sur les sections d’équipe', () => {
    asRole('member')
    render(<PilotagePage offerAllowed={offer.allowed} />)
    expect(screen.queryByTestId('cockpit-body')).not.toBeInTheDocument()
    expect(screen.queryByTestId('staffing')).not.toBeInTheDocument()
    expect(screen.queryByTestId('finance')).not.toBeInTheDocument()
    expect(screen.getByTestId('pipe')).toHaveAttribute('data-own', 'true')
    expect(screen.getByText('Tes affaires')).toBeInTheDocument()
    expect(screen.getAllByText('Cette section n’est pas ouverte à ton rôle.')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Exporter la synthèse' })).not.toBeInTheDocument()
  })

  it('un gestionnaire sans l’offre : la porte de l’offre, jamais les chiffres d’équipe', () => {
    offer.allowed = false
    render(<PilotagePage offerAllowed={offer.allowed} />)
    expect(screen.queryByTestId('cockpit-body')).not.toBeInTheDocument()
    expect(screen.queryByTestId('staffing')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('plan-locked').length).toBeGreaterThan(0)
  })

  it('un seul accès contextuel au copilote (#1322.6, pilotage.A15)', () => {
    render(<PilotagePage offerAllowed={offer.allowed} />)
    // Sur bureau l'accès est un bouton qui ouvre la bulle ; ailleurs un lien — jamais deux.
    const accès = [
      ...screen.queryAllByRole('link', { name: /^Demander à Laura/ }),
      ...screen.queryAllByRole('button', { name: /^Demander à Laura/ }),
    ]
    expect(accès).toHaveLength(1)
  })
})
