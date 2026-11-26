import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2223 — sélectionner plusieurs conversations pour les ARCHIVER en lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOCTRINE : « ON ARCHIVE, ON NE SUPPRIME PAS »
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour de Louis demandait « sélectionner… et les archiver, supprimer
 * etc ». La suppression DÉFINITIVE en lot n'est pas livrée — ce n'est pas un
 * oubli, c'est la doctrine du dépôt (irréversible, on archive au lieu). Le
 * dernier test de ce fichier est un TÉMOIN : il sait dire non en prouvant
 * qu'aucun geste de suppression n'existe en mode sélection.
 */

const history = vi.hoisted(() => ({ list: vi.fn() }))
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))
const self = vi.hoisted(() => ({
  author: vi.fn((): { firstName: string; avatarUrl: string | null } | null => null),
}))
const searching = vi.hoisted(() => ({ search: vi.fn() }))
const archiving = vi.hoisted(() => ({ setArchived: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => accounts.data() }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => self.author() }))
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toasts.success(...args),
    error: (...args: unknown[]) => toasts.error(...args),
  },
}))

vi.mock('@/features/chat/api/agentChatApi', () => ({
  listAgentChatHistory: history.list,
  renameAgentChatThread: vi.fn(),
  searchAgentChatThreads: (...args: unknown[]) => searching.search(...args),
  setAgentChatThreadArchived: (...args: unknown[]) => archiving.setArchived(...args),
  deleteAgentChatThread: vi.fn(),
  duplicateAgentChatThread: vi.fn(),
  exportAgentChatThread: vi.fn(),
}))

type LinkProps = { to: string; search?: Record<string, unknown>; children?: ReactNode } & Record<string, unknown>

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, search, children, ...props }: LinkProps) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).map(([key, value]) => [key, String(value)]),
    ).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...props}>
        {children}
      </a>
    )
  },
}))

const { ConversationsPanel } = await import('./ConversationsPanel')

const thread = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 't1',
  account_id: null,
  conversation_id: 'c-1',
  title: 'Sans titre',
  created_at: '2026-09-10T10:00:00Z',
  last_message_at: '2026-09-12T10:00:00Z',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  searching.search.mockResolvedValue([])
  archiving.setArchived.mockResolvedValue(undefined)
  self.author.mockReturnValue(null)
})

async function renderWithThreads() {
  history.list.mockResolvedValue([
    thread({ id: 't1', conversation_id: 'c-1', title: 'Angle RSE chez LATECOERE' }),
    thread({ id: 't2', conversation_id: 'c-2', title: 'Objections prix' }),
    thread({ id: 't3', conversation_id: 'c-3', title: 'Plan de compte QONTO' }),
  ])
  render(<ConversationsPanel />)
  await screen.findByText('Angle RSE chez LATECOERE')
}

describe('#2223 — sélection multiple et archivage en lot', () => {
  it('aucune barre de sélection tant que rien n’est coché — un compte à zéro ne s’affiche pas', async () => {
    await renderWithThreads()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Sélectionner' }))

    expect(screen.queryByText(/sélectionnée/)).not.toBeInTheDocument()
  })

  it('coche deux fils, dit combien, puis les range en un geste', async () => {
    await renderWithThreads()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Sélectionner' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner « Angle RSE chez LATECOERE »' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner « Objections prix »' }))

    expect(screen.getByText('2 conversations sélectionnées')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Ranger la sélection' }))

    await waitFor(() => expect(archiving.setArchived).toHaveBeenCalledTimes(2))
    expect(archiving.setArchived).toHaveBeenCalledWith({ conversationId: 'c-1', accountId: null }, true)
    expect(archiving.setArchived).toHaveBeenCalledWith({ conversationId: 'c-2', accountId: null }, true)
    expect(toasts.success).toHaveBeenCalledWith('2 conversations rangées.')

    // Les deux rangées disparaissent de la vue active ; la troisième reste.
    await waitFor(() => expect(screen.queryByText('Angle RSE chez LATECOERE')).not.toBeInTheDocument())
    expect(screen.queryByText('Objections prix')).not.toBeInTheDocument()
    expect(screen.getByText('Plan de compte QONTO')).toBeInTheDocument()
  })

  it('« Annuler » vide la sélection sans rien archiver', async () => {
    await renderWithThreads()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Sélectionner' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner « Angle RSE chez LATECOERE »' }))
    expect(screen.getByText('1 conversation sélectionnée')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Annuler' }))

    expect(screen.queryByText(/sélectionnée/)).not.toBeInTheDocument()
    expect(archiving.setArchived).not.toHaveBeenCalled()
  })

  it('sait dire NON : aucun geste de suppression en lot n’existe en mode sélection', async () => {
    await renderWithThreads()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Sélectionner' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner « Angle RSE chez LATECOERE »' }))

    // La barre de sélection ne porte QUE « Ranger la sélection » — jamais un
    // bouton qui supprimerait plusieurs fils d'un coup (doctrine : on
    // archive, on ne supprime pas).
    expect(screen.queryByRole('button', { name: /[Ss]upprimer la sélection/ })).not.toBeInTheDocument()
    expect(within(screen.getByText('1 conversation sélectionnée').closest('div')!).queryByText(/[Ss]upprimer/)).toBe(
      null,
    )
  })
})
