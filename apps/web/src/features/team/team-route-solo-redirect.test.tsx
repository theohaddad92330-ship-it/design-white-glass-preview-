import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// #4158.10 → Théo A today-equipe.A1 — `/team` dans un espace solo montre l'état vide (plus de redirection).
const state = vi.hoisted(() => ({ team: undefined as undefined | { workspace: { memberCount: number } } }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({}) }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({ useTeam: () => ({ team: state.team }) }))
vi.mock('@/components/navigation/RedirectTo', () => ({
  RedirectTo: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
}))
vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/plan-features/PlanFeatureRoute', () => ({
  PlanFeatureRoute: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/manager/view/TeamSoloState', () => ({
  TeamSoloState: () => <div data-testid="solo-state" />,
}))
vi.mock('@/features/briefing/view/TodayTeamReturn', () => ({ TodayTeamReturn: () => null }))
vi.mock('@/features/manager/view/ManagerDashboardPage', () => ({
  ManagerDashboardPage: () => <div data-testid="cockpit" />,
}))

const { Route } = await import('@/routes/team/index')
const TeamRoute = (Route as unknown as { options: { component: () => React.ReactElement } }).options.component

describe('/team selon la taille de l’espace', () => {
  beforeEach(() => {
    state.team = undefined
  })

  it('un espace solo voit l’état vide de l’onglet Équipe, plus une redirection (Théo A today-equipe.A1)', () => {
    state.team = { workspace: { memberCount: 1 } }
    render(<TeamRoute />)
    expect(screen.getByTestId('solo-state')).toBeInTheDocument()
    expect(screen.queryByTestId('redirect')).toBeNull()
    expect(screen.queryByTestId('cockpit')).toBeNull()
  })

  it('à deux membres actifs, le cockpit s’affiche', () => {
    state.team = { workspace: { memberCount: 2 } }
    render(<TeamRoute />)
    expect(screen.getByTestId('cockpit')).toBeInTheDocument()
    expect(screen.queryByTestId('redirect')).toBeNull()
  })

  it('tant que l’équipe n’est pas chargée, on ne redirige pas', () => {
    render(<TeamRoute />)
    expect(screen.queryByTestId('redirect')).toBeNull()
  })
})
