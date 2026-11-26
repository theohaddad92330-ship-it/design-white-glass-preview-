import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { JoinRequestsSection } from './JoinRequestsSection'

const { pendingMock, mutateMock } = vi.hoisted(() => ({ pendingMock: vi.fn(), mutateMock: vi.fn() }))

vi.mock('@/features/onboarding/hooks/useWorkspaceJoin', () => ({
  usePendingWorkspaceJoinRequests: () => pendingMock(),
  useDecideWorkspaceJoinRequest: () => ({ mutate: mutateMock, isPending: false, variables: undefined }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const REQUEST = {
  id: '44444444-4444-4444-8444-444444444444',
  requesterName: 'Léa Martin',
  requesterEmail: 'lea@comet.fr',
  createdAt: '2026-09-17T10:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

/** #2016 — l'administrateur tranche : accepter ou refuser, le clic est la décision. */
describe('JoinRequestsSection (#2016)', () => {
  it('ne montre rien tant qu’aucune demande n’attend — ni titre vide, ni « 0 »', () => {
    pendingMock.mockReturnValue({ data: [] })
    const { container } = render(<JoinRequestsSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('nomme la personne et son adresse — elle a choisi de se présenter', () => {
    pendingMock.mockReturnValue({ data: [REQUEST] })
    render(<JoinRequestsSection />)
    expect(screen.getByRole('heading', { name: 'Demandes d’accès (1)' })).toBeInTheDocument()
    expect(screen.getByText('Léa Martin')).toBeInTheDocument()
    expect(screen.getByText(/lea@comet\.fr/)).toBeInTheDocument()
  })

  it('accepter et refuser envoient la décision pour CETTE demande', () => {
    pendingMock.mockReturnValue({ data: [REQUEST] })
    render(<JoinRequestsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Accepter la demande de Léa Martin' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ id: REQUEST.id, decision: 'accept' }, expect.any(Object))
    fireEvent.click(screen.getByRole('button', { name: 'Refuser la demande de Léa Martin' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ id: REQUEST.id, decision: 'refuse' }, expect.any(Object))
  })
})
