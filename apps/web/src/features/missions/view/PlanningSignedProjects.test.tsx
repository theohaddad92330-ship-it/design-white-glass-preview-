import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => 'forfait_conseil' }))
vi.mock('@/features/projects/hooks/useProjects', () => ({
  useProjects: () => ({
    data: [{ id: 'w1', account_id: 'a1', company_name: 'AIRBUS', label: 'Refonte SI', stage: 'won', closed_at: null }],
  }),
}))
vi.mock('@/features/projects/view/WonMissionDetail', () => ({
  WonMissionDetail: ({ project }: { project: { id: string } }) => (
    <div data-testid="won-mission-detail">{project.id}</div>
  ),
}))

const { PlanningSignedProjects } = await import('./PlanningSignedProjects')

// #4291.8 — `WonMissionDetail` n'était atteint que par la ligne de `WonMissionTracking` sur /projects : le suivi
// d'un projet signé vit désormais dans /planning, et le même clic sur sa ligne l'y ouvre.
describe('PlanningSignedProjects — le clic d’un projet signé (#4291.8)', () => {
  it('ouvre le suivi du projet (WonMissionDetail), jamais un renvoi vers /projects', async () => {
    render(<PlanningSignedProjects />)
    expect(screen.queryByTestId('won-mission-detail')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /AIRBUS/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /AIRBUS — Refonte SI/ }))
    expect(await screen.findByTestId('won-mission-detail')).toHaveTextContent('w1')
  })
})
