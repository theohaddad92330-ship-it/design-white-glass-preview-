import type { McpAccessIntent } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import {
  useCreateMcpAccessIntent,
  useDecideMcpAccessIntent,
  useMcpAccessIntents,
  usePendingMcpAccessIntents,
} from '../api'
import { McpAccessIntentCard } from './McpAccessIntentCard'

vi.mock('../api', () => ({
  useMcpAccessIntents: vi.fn(),
  usePendingMcpAccessIntents: vi.fn(),
  useCreateMcpAccessIntent: vi.fn(),
  useDecideMcpAccessIntent: vi.fn(),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({ team: { workspace: { role: roleState.value } } }),
}))
const roleState = vi.hoisted(() => ({ value: 'sales' as string }))

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const create = vi.fn()
const decide = vi.fn()

const intent = (over: Partial<McpAccessIntent> = {}): McpAccessIntent => ({
  id: 'i1',
  name: 'Assistant de Théo',
  perimeter: 'mine',
  status: 'pending',
  requestedBy: 'u1',
  requestedByName: 'Théo Haddad',
  createdAt: '2026-10-22T08:00:00.000Z',
  decidedAt: null,
  ...over,
})

function mocks(mine: McpAccessIntent[], pending: McpAccessIntent[] = []) {
  vi.mocked(useMcpAccessIntents).mockReturnValue({ data: mine } as unknown as ReturnType<typeof useMcpAccessIntents>)
  vi.mocked(usePendingMcpAccessIntents).mockReturnValue({ data: pending } as unknown as ReturnType<
    typeof usePendingMcpAccessIntents
  >)
  vi.mocked(useCreateMcpAccessIntent).mockReturnValue({ mutate: create, isPending: false } as unknown as ReturnType<
    typeof useCreateMcpAccessIntent
  >)
  vi.mocked(useDecideMcpAccessIntent).mockReturnValue({ mutate: decide, isPending: false } as unknown as ReturnType<
    typeof useDecideMcpAccessIntent
  >)
}

describe('Théo D settings-outils.N1 — le cadre d’un nouvel accès', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    roleState.value = 'sales'
    create.mockClear()
    decide.mockClear()
    mocks([])
  })

  it('un nom et un périmètre (mes dossiers par défaut) suffisent ; « Lecture uniquement » est dit, sans case', async () => {
    render(<McpAccessIntentCard />)
    expect(screen.getByText(/Aucun droit d’écriture délivré par ce formulaire/)).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await user().type(screen.getByLabelText('Nom de l’accès envisagé'), 'Assistant de Théo')
    await user().click(screen.getByRole('button', { name: 'Demander l’accès' }))
    expect(create).toHaveBeenCalledWith({ name: 'Assistant de Théo', perimeter: 'mine' }, expect.anything())
  })

  it('⚠️ SAIT DIRE NON — sans nom, la demande ne part pas', async () => {
    render(<McpAccessIntentCard />)
    expect(screen.getByRole('button', { name: 'Demander l’accès' })).toBeDisabled()
  })

  it('le périmètre « dossiers partagés » se choisit', async () => {
    render(<McpAccessIntentCard />)
    await user().type(screen.getByLabelText('Nom de l’accès envisagé'), 'Assistant de l’équipe')
    await user().click(screen.getByRole('radio', { name: 'Dossiers partagés autorisés' }))
    await user().click(screen.getByRole('button', { name: 'Demander l’accès' }))
    expect(create).toHaveBeenCalledWith({ name: 'Assistant de l’équipe', perimeter: 'shared' }, expect.anything())
  })

  it('mes demandes disent leur état : en attente, validé, refusé', () => {
    mocks([intent(), intent({ id: 'i2', status: 'approved' }), intent({ id: 'i3', status: 'declined' })])
    render(<McpAccessIntentCard />)
    expect(screen.getByText('En attente de validation')).toBeInTheDocument()
    expect(screen.getByText('Validée')).toBeInTheDocument()
    expect(screen.getByText('Refusée')).toBeInTheDocument()
  })

  it('un commercial ne voit pas la file de l’espace ; un administrateur la voit et tranche', async () => {
    mocks([], [intent({ requestedByName: 'Maëva Coet' })])
    const { unmount } = render(<McpAccessIntentCard />)
    expect(screen.queryByText('Maëva Coet')).not.toBeInTheDocument()
    unmount()
    roleState.value = 'admin'
    render(<McpAccessIntentCard />)
    expect(screen.getByText(/Maëva Coet/)).toBeInTheDocument()
    await user().click(screen.getByRole('button', { name: 'Valider' }))
    expect(decide).toHaveBeenCalledWith({ id: 'i1', decision: 'approved' })
  })
})
