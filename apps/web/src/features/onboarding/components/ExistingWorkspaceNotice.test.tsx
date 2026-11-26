import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceJoinCandidate, WorkspaceJoinOverview } from '@bellum/contracts'
import { visibleJoinCandidates } from '@/features/onboarding/lib/workspace-join'
import { ExistingWorkspaceNotice } from './ExistingWorkspaceNotice'

const COMET = '11111111-1111-4111-8111-111111111111'

function candidate(over: Partial<WorkspaceJoinCandidate> = {}): WorkspaceJoinCandidate {
  return {
    workspaceId: COMET,
    workspaceName: 'Comet Conseil',
    admins: [
      { firstName: 'Louis', lastInitial: 'S' },
      { firstName: 'Marie', lastInitial: null },
    ],
    request: null,
    ...over,
  }
}

function overview(over: Partial<WorkspaceJoinOverview> = {}): WorkspaceJoinOverview {
  return { candidates: [candidate()], canCreateOwnWorkspace: false, ...over }
}

function show(data: WorkspaceJoinOverview, busy: string | null = null) {
  const handlers = { onRequest: vi.fn(), onDismiss: vi.fn(), onCreateOwn: vi.fn() }
  render(<ExistingWorkspaceNotice overview={data} busyWorkspaceId={busy} {...handlers} />)
  return handlers
}

/** #2016 — « Un espace existe déjà pour <nom> ». */
describe('ExistingWorkspaceNotice (#2016)', () => {
  it('nomme l’espace et ses administrateurs, prénom et initiale seulement (#2016.3 / #2016.5)', () => {
    show(overview())
    expect(screen.getByRole('heading', { name: 'Un espace existe déjà pour Comet Conseil' })).toBeInTheDocument()
    expect(screen.getByText('Administré par Louis S., Marie.')).toBeInTheDocument()
  })

  it('« Demander l’accès » envoie la demande pour CET espace (#2016.4)', () => {
    const { onRequest } = show(overview())
    fireEvent.click(screen.getByRole('button', { name: 'Demander l’accès' }))
    expect(onRequest).toHaveBeenCalledWith(COMET)
  })

  it('« Créer mon propre espace » reste inactif tant que la demande n’est pas tranchée (#2016.2)', () => {
    const { onCreateOwn } = show(overview())
    const create = screen.getByRole('button', { name: 'Créer mon propre espace' })
    expect(create).toBeDisabled()
    expect(screen.getByText(/Disponible après 72 h sans réponse/)).toBeInTheDocument()
    fireEvent.click(create)
    expect(onCreateOwn).not.toHaveBeenCalled()
  })

  it('une demande en attente le dit, avec la date à partir de laquelle on pourra créer son espace', () => {
    show(
      overview({
        candidates: [
          candidate({
            request: { id: 'r', status: 'pending', createdAt: '2026-09-17T10:00:00.000Z', decidedAt: null },
          }),
        ],
      }),
    )
    expect(screen.queryByRole('button', { name: 'Demander l’accès' })).toBeNull()
    expect(
      screen.getByText(/Demande envoyée\. Sans réponse, tu pourras créer ton propre espace à partir du/),
    ).toBeInTheDocument()
  })

  it('actif après 72 h ou un refus (#2016.10) — et c’est lui qui lance le parcours', () => {
    const { onCreateOwn } = show(
      overview({
        canCreateOwnWorkspace: true,
        candidates: [
          candidate({
            request: { id: 'r', status: 'refused', createdAt: '2026-09-10T10:00:00.000Z', decidedAt: null },
          }),
        ],
      }),
    )
    expect(screen.getByText('Ta demande n’a pas été acceptée.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon propre espace' }))
    expect(onCreateOwn).toHaveBeenCalledTimes(1)
  })

  it('« Ce n’est pas mon entreprise » est toujours proposé (#2016.10)', () => {
    const { onDismiss } = show(overview())
    fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas mon entreprise' }))
    expect(onDismiss).toHaveBeenCalledWith(COMET)
  })

  it('plusieurs espaces : un encart par espace (#2016.6)', () => {
    show(
      overview({
        candidates: [
          candidate(),
          candidate({ workspaceId: '22222222-2222-4222-8222-222222222222', workspaceName: 'Comet Lyon' }),
        ],
      }),
    )
    expect(screen.getAllByRole('button', { name: 'Demander l’accès' })).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Un espace existe déjà pour Comet Lyon' })).toBeInTheDocument()
  })

  it('un administrateur sans prénom n’est pas nommé — la phrase le dit sans inventer', () => {
    show(overview({ candidates: [candidate({ admins: [] })] }))
    expect(screen.getByText('Ses administrateurs recevront ta demande.')).toBeInTheDocument()
  })
})

describe('visibleJoinCandidates', () => {
  it('un espace écarté (« pas mon entreprise ») ne revient pas', () => {
    const dismissed = candidate({
      request: { id: 'r', status: 'dismissed', createdAt: '2026-09-17T10:00:00.000Z', decidedAt: null },
    })
    expect(visibleJoinCandidates(overview({ candidates: [dismissed] }))).toEqual([])
    expect(visibleJoinCandidates(undefined)).toEqual([])
  })
})
