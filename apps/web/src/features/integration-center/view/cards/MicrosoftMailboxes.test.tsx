import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MicrosoftConnection } from '@/features/microsoft/api'
import { i18n } from '@/i18n'
import { MicrosoftMailboxes } from './MicrosoftMailboxes'

const microsoftApiMock = vi.hoisted(() => ({ connections: vi.fn(), disconnect: vi.fn() }))
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))

vi.mock('@/features/microsoft/api', () => ({ microsoftApi: microsoftApiMock }))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('sonner', () => ({ toast: toastMock }))

const CAPS = { mailSend: false, mailRead: true, mailDraft: false, calendar: true, mailboxSettings: false, files: false }
const box = (id: string, accountLabel: string | null): MicrosoftConnection => ({
  id,
  accountLabel,
  connectedAt: '2026-10-20T09:00:00.000Z',
  capabilities: CAPS,
})

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

/**
 * #4546.4 — l'API rend `GET /microsoft/connections` et aucun écran ne la consommait : un commercial qui avait branché une
 * seconde boîte ne la voyait pas et ne pouvait pas la débrancher seule.
 */
describe('MicrosoftMailboxes — #4546.4', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    microsoftApiMock.connections.mockReset()
    microsoftApiMock.disconnect.mockReset().mockResolvedValue(undefined)
    toastMock.success.mockReset()
    toastMock.error.mockReset()
  })

  it('liste CHAQUE boîte connectée, nommée', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', 'anne@esn.fr'), box('c2', 'contact@esn.fr')])
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    expect(await screen.findByText('anne@esn.fr')).toBeInTheDocument()
    expect(screen.getByText('contact@esn.fr')).toBeInTheDocument()
  })

  it('débranche UNE boîte : l’identifiant de CETTE boîte est envoyé, jamais un débranchement global', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', 'anne@esn.fr'), box('c2', 'contact@esn.fr')])
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Débrancher contact@esn.fr' }))
    await waitFor(() => expect(microsoftApiMock.disconnect).toHaveBeenCalledWith('c2'))
    expect(microsoftApiMock.disconnect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
  })

  it('« Ajouter une boîte » appelle l’appelant', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', 'anne@esn.fr')])
    const onAdd = vi.fn()
    wrap(<MicrosoftMailboxes onAdd={onAdd} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une boîte' }))
    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('une seule boîte : pas de second « Débrancher » — c’est le « Déconnecter » de la carte, qui ne se répète pas', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', 'anne@esn.fr')])
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    await screen.findByText('anne@esn.fr')
    expect(screen.queryByRole('button', { name: /débrancher/i })).not.toBeInTheDocument()
  })

  it('une boîte sans nom communiqué le dit, sans en inventer un', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', null), box('c2', 'contact@esn.fr')])
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    expect(await screen.findByText('Boîte sans nom communiqué')).toBeInTheDocument()
  })

  it('la lecture échoue : l’écran le dit — jamais « aucune boîte » affirmé sans mesure', async () => {
    microsoftApiMock.connections.mockRejectedValue(new Error('boom'))
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    expect(await screen.findByText(/pas pu lire tes boîtes/i)).toBeInTheDocument()
    expect(screen.queryByText(/aucune boîte/i)).not.toBeInTheDocument()
  })

  it('un débranchement refusé le dit', async () => {
    microsoftApiMock.connections.mockResolvedValue([box('c1', 'anne@esn.fr'), box('c2', 'contact@esn.fr')])
    microsoftApiMock.disconnect.mockRejectedValue(new Error('403'))
    wrap(<MicrosoftMailboxes onAdd={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Débrancher anne@esn.fr' }))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(toastMock.success).not.toHaveBeenCalled()
  })
})
