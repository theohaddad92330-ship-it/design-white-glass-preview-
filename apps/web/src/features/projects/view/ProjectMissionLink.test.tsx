import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    params,
    ...rest
  }: {
    children: React.ReactNode
    to: string
    params?: { id: string }
    'data-testid'?: string
  }) => (
    <a href={params ? to.replace('$id', params.id) : to} data-testid={rest['data-testid']}>
      {children}
    </a>
  ),
}))
const missionsData = vi.hoisted(() => ({ value: undefined as unknown }))
vi.mock('@/features/missions/api', () => ({ useMissions: () => ({ data: missionsData.value }) }))

const { ProjectMissionLink } = await import('./ProjectMissionLink')

const won = { id: 'p-1', account_id: 'a-1' }

describe('ProjectMissionLink (#4291.8)', () => {
  it('la mission existe : « Suivi comme mission — <nom> », cliquable vers SA fiche', () => {
    missionsData.value = { missions: [{ id: 'm-7', label: 'ROCHE — squad data', opportunity_id: 'p-1' }] }
    render(<ProjectMissionLink project={won} fallback={<button type="button">Créer la mission</button>} />)
    const link = screen.getByTestId('project-mission-link')
    expect(link).toHaveTextContent('Suivi comme mission — ROCHE — squad data')
    expect(link).toHaveAttribute('href', '/missions/m-7')
    expect(screen.queryByText('Créer la mission')).toBeNull()
  })

  it('sait dire NON : mission d’un autre projet du même client ⇒ le geste d’avant reste, aucun lien', () => {
    missionsData.value = { missions: [{ id: 'm-8', label: 'Autre mission', opportunity_id: 'p-2' }] }
    render(<ProjectMissionLink project={won} fallback={<button type="button">Créer la mission</button>} />)
    expect(screen.queryByTestId('project-mission-link')).toBeNull()
    expect(screen.getByText('Créer la mission')).toBeInTheDocument()
  })

  it('missions non lues (chargement, droit absent) ⇒ le geste d’avant', () => {
    missionsData.value = undefined
    render(<ProjectMissionLink project={won} fallback={<button type="button">Créer la mission</button>} />)
    expect(screen.queryByTestId('project-mission-link')).toBeNull()
  })
})
