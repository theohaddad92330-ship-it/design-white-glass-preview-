import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceProfile } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))

const state: { profile: WorkspaceProfile | null; projects: unknown[] } = { profile: 'staffing', projects: [] }
vi.mock('@/features/profile/hooks/useWorkspaceProfile', () => ({ useWorkspaceProfile: () => state.profile }))
vi.mock('@/features/projects/hooks/useProjects', () => ({ useProjects: () => ({ data: state.projects }) }))

const { PlanningSignedProjects } = await import('./PlanningSignedProjects')

const SIGNED = {
  id: 'w1',
  account_id: 'a1',
  company_name: 'AIRBUS',
  label: 'Refonte SI',
  stage: 'won',
  closed_at: null,
}

// #4291.8 (Louis 02/11 : « liste aussi en régie ») — la liste des projets SIGNÉS ne dépend plus du profil d'espace :
// même composant, même rendu en régie qu'en forfait / conseil ; rien quand aucun projet n'est signé (GA-18/19).
describe('PlanningSignedProjects — aussi en régie (#4291.8)', () => {
  beforeEach(() => {
    state.projects = []
  })

  it.each([['staffing' as const], [null]])('espace %s avec un projet signé ⇒ la ligne est visible', profile => {
    state.profile = profile
    state.projects = [SIGNED]
    render(<PlanningSignedProjects />)
    expect(screen.getByTestId('planning-signed-projects')).toBeInTheDocument()
    expect(screen.getByText(/AIRBUS — Refonte SI/)).toBeInTheDocument()
  })

  it('espace régie sans projet signé ⇒ rien, jamais un « 0 »', () => {
    state.profile = 'staffing'
    state.projects = [{ ...SIGNED, stage: 'qualification' }]
    const { container } = render(<PlanningSignedProjects />)
    expect(container).toBeEmptyDOMElement()
  })
})
