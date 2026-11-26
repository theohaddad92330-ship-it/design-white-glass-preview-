import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectReadinessRow } from '@bellum/contracts'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to }: { children: React.ReactNode; to?: string }) => <a href={to ?? '#'}>{children}</a>,
}))
let missionList: { id: string; label: string; opportunity_id: string | null }[] | undefined
vi.mock('@/features/missions/api', () => ({
  useMissions: () => ({ data: missionList ? { missions: missionList } : undefined }),
}))
vi.mock('../hooks/useProjectOwners', () => ({
  useProjectOwners: () => ({ selfId: null, ownerName: (id: string | null) => (id === 'u1' ? 'Claire Martin' : null) }),
}))

const { WonMissionDetail } = await import('./WonMissionDetail')

// #4291.8 — le suivi PROPRE d'un projet gagné : où en est la mission, et ce qui reste à faire pour qu'elle existe.
const won = (over: Partial<ProjectReadinessRow>): ProjectReadinessRow =>
  ({
    id: 'w1',
    account_id: 'a1',
    company_name: 'ROCHE',
    label: 'Programme data',
    stage: 'won',
    owner_id: 'u1',
    amount_cents: 9_600_000,
    ...over,
  }) as unknown as ProjectReadinessRow

describe('WonMissionDetail (#4291.8)', () => {
  it('mission créée : elle est nommée et ouvrable, aucun geste de création', () => {
    missionList = [{ id: 'm1', label: 'Mission Roche', opportunity_id: 'w1' }]
    render(<WonMissionDetail project={won({})} />)
    expect(screen.getByTestId('won-mission-detail')).toHaveTextContent('Mission Roche')
    expect(screen.queryByRole('button', { name: /Créer la mission/ })).toBeNull()
  })

  it('aucune mission : le dit en clair et offre le geste qui la crée', () => {
    missionList = []
    render(<WonMissionDetail project={won({})} />)
    expect(screen.getByTestId('won-mission-detail')).toHaveTextContent(/Aucune mission n.existe encore/)
    fireEvent.click(screen.getByRole('button', { name: /Créer la mission/ }))
    expect(navigateMock).toHaveBeenCalledWith({ to: '/missions/nouvelle', search: { project_id: 'w1' } })
  })

  it('missions non lues : le statut est NOMMÉ non évaluable, ni « à créer » ni mission inventée', () => {
    missionList = undefined
    render(<WonMissionDetail project={won({})} />)
    const detail = screen.getByTestId('won-mission-detail')
    expect(detail).toHaveTextContent(/pas pu être lu/)
    expect(screen.queryByRole('button', { name: /Créer la mission/ })).toBeNull()
  })

  it('montant et porteur absents se NOMMENT, jamais « 0 »', () => {
    missionList = []
    render(<WonMissionDetail project={won({ amount_cents: null, owner_id: null })} />)
    const detail = screen.getByTestId('won-mission-detail')
    expect(detail).toHaveTextContent('Aucun montant saisi')
    expect(detail).toHaveTextContent('Aucun porteur')
    expect(detail.textContent).not.toMatch(/\b0\s?€/)
  })
})
