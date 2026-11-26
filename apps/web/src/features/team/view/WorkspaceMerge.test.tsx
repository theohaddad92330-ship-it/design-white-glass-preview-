import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceMergeRequestView } from '@bellum/contracts'
import { PersonalSpaceMergeCard, WorkspaceMergeRequestsSection } from './WorkspaceMerge'

const { mineMock, pendingMock, workspacesMock, mutateMock } = vi.hoisted(() => ({
  mineMock: vi.fn(),
  pendingMock: vi.fn(),
  workspacesMock: vi.fn(),
  mutateMock: vi.fn(),
}))

vi.mock('@/features/team/hooks/useWorkspaceMerge', () => ({
  useMyWorkspaceMerges: () => mineMock(),
  usePendingWorkspaceMerges: () => pendingMock(),
  useWorkspaceMergeGesture: () => ({ mutate: mutateMock, isPending: false, variables: undefined }),
}))
vi.mock('@/features/team/hooks/useWorkspaces', () => ({ useWorkspaces: () => workspacesMock() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const PERSO = '11111111-1111-4111-8111-111111111111'
const ESN = '22222222-2222-4222-8222-222222222222'
const HASH = 'a'.repeat(64)

const WORKSPACES = {
  workspaces: [
    { id: PERSO, name: 'Mon espace', role: 'owner', isActive: false, isPersonal: true, memberCount: 1 },
    { id: ESN, name: 'ESN Alpha', role: 'sales', isActive: true, isPersonal: false, memberCount: 4 },
  ],
}

function request(overrides: Partial<WorkspaceMergeRequestView> = {}): WorkspaceMergeRequestView {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    status: 'previewed',
    sourceWorkspaceId: PERSO,
    sourceWorkspaceName: 'Mon espace',
    targetWorkspaceId: ESN,
    targetWorkspaceName: 'ESN Alpha',
    requestedBy: 'u-solo',
    previewHash: HASH,
    tables: [
      { table: 'accounts', total: 3, moving: 2, duplicates: 1, held: 0 },
      { table: 'contacts', total: 4, moving: 2, duplicates: 1, held: 1 },
    ],
    proposals: [
      {
        table: 'accounts',
        sourceId: 'p-acc-1',
        outcome: 'duplicate_proposed',
        targetId: 'e-acc-1',
        sourceAccountId: null,
        duplicateKey: 'siren',
        label: 'Doublon SA',
      },
    ],
    progress: { done: 0, total: 7 },
    userValidatedAt: null,
    adminValidatedAt: null,
    finishedAt: null,
    lastError: null,
    createdAt: '2026-10-17T10:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  workspacesMock.mockReturnValue(WORKSPACES)
  mineMock.mockReturnValue({ data: [] })
  pendingMock.mockReturnValue({ data: [] })
})

/** #4158.57 — rapatrier l'espace personnel : aperçu, validation, suivi ; l'admin de la cible tranche. */
describe('PersonalSpaceMergeCard (#4158.57)', () => {
  it('rien sans espace personnel à côté de l’espace actif (salle de démo, utilisateur solo)', () => {
    workspacesMock.mockReturnValue({ workspaces: [WORKSPACES.workspaces[1]] })
    const { container } = render(<PersonalSpaceMergeCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('« Voir l’aperçu » lance la SIMULATION vers l’espace actif — rien n’est déplacé', () => {
    render(<PersonalSpaceMergeCard />)
    expect(screen.getByRole('heading', { name: 'Rapatrier mon espace personnel' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voir l’aperçu' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ kind: 'preview', targetWorkspaceId: ESN }, expect.any(Object))
  })

  it('l’aperçu dit par table ce qui part, les doublons PROPOSÉS, et la validation porte sur son empreinte', () => {
    mineMock.mockReturnValue({ data: [request()] })
    render(<PersonalSpaceMergeCard />)
    expect(screen.getByText('Comptes : 2 recopiés, 1 doublon proposé à la fusion')).toBeInTheDocument()
    expect(
      screen.getByText('Contacts : 2 recopiés, 1 doublon proposé à la fusion, 1 en attente de son compte'),
    ).toBeInTheDocument()
    expect(screen.getByText(/Doublon SA/)).toBeInTheDocument()
    expect(screen.getByText(/aaaaaaaaaaaa/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Valider cet aperçu' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ kind: 'confirm', id: request().id, hash: HASH }, expect.any(Object))
  })

  it('une table sans ligne ne fait aucune ligne — jamais « 0 recopié »', () => {
    mineMock.mockReturnValue({
      data: [request({ tables: [{ table: 'accounts', total: 0, moving: 0, duplicates: 0, held: 0 }], proposals: [] })],
    })
    render(<PersonalSpaceMergeCard />)
    expect(screen.queryByText(/Comptes/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Ton espace personnel ne contient aucun compte ni contact à rapatrier.'),
    ).toBeInTheDocument()
  })

  it('un job coupé se reprend ; un job fini dit que l’espace est archivé, pas supprimé', () => {
    mineMock.mockReturnValue({ data: [request({ status: 'failed', lastError: 'connexion perdue' })] })
    const { unmount } = render(<PersonalSpaceMergeCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre le rapatriement' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ kind: 'resume', id: request().id }, expect.any(Object))
    unmount()
    mineMock.mockReturnValue({ data: [request({ status: 'done', progress: { done: 7, total: 7 } })] })
    render(<PersonalSpaceMergeCard />)
    expect(screen.getByText(/^Rapatrié dans ESN Alpha\. Ton espace personnel est archivé/)).toBeInTheDocument()
  })
})

describe('WorkspaceMergeRequestsSection (#4158.57)', () => {
  it('rien tant qu’aucune demande n’attend', () => {
    const { container } = render(<WorkspaceMergeRequestsSection />)
    expect(container).toBeEmptyDOMElement()
  })

  it('l’admin accepte l’EMPREINTE que l’utilisateur a validée, ou refuse', () => {
    pendingMock.mockReturnValue({
      data: [request({ status: 'awaiting_admin', userValidatedAt: '2026-10-17T10:05:00.000Z' })],
    })
    render(<WorkspaceMergeRequestsSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Accepter le rapatriement de Mon espace' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ kind: 'approve', id: request().id, hash: HASH }, expect.any(Object))
    fireEvent.click(screen.getByRole('button', { name: 'Refuser le rapatriement de Mon espace' }))
    expect(mutateMock).toHaveBeenLastCalledWith({ kind: 'reject', id: request().id }, expect.any(Object))
  })
})
