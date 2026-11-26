import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1911.5 — L'ÉTAT DU FIL SE LIT DANS LA LISTE.
 *
 * Deux états, et deux seulement : « en attente » (la personne a écrit, Laura n'a
 * pas répondu) et « reçu » (Laura a écrit en dernier). Le troisième que le point
 * demandait — « terminé » — n'a aucun fait derrière lui dans ce produit ; la
 * raison est écrite dans `thread-status.ts` et le dernier test de ce fichier la
 * TIENT : aucune pastille n'apparaît quand l'état n'est pas mesuré.
 */
const history = vi.hoisted(() => ({ list: vi.fn() }))
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))
const self = vi.hoisted(() => ({
  author: vi.fn((): { firstName: string; avatarUrl: string | null } | null => ({
    firstName: 'Sarah',
    avatarUrl: null,
  })),
}))
const renaming = vi.hoisted(() => ({ rename: vi.fn() }))
const searching = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => accounts.data() }))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({ useSelfChatAuthor: () => self.author() }))
vi.mock('@/features/chat/api/agentChatApi', () => ({
  listAgentChatHistory: history.list,
  renameAgentChatThread: renaming.rename,
  searchAgentChatThreads: (...args: unknown[]) => searching.search(...args),
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
  conversation_id: 'general',
  title: 'Quels comptes prioriser ?',
  created_at: '2026-08-20T10:00:00Z',
  last_message_at: '2026-08-25T10:00:00Z',
  ...over,
})

beforeEach(() => {
  searching.search.mockResolvedValue([])
  self.author.mockReturnValue({ firstName: 'Sarah', avatarUrl: null })
  localStorage.clear()
})

describe('#1911.5 — la pastille d’état d’une conversation', () => {
  it('dit « En attente » quand la dernière parole est celle de la personne', async () => {
    // #4462.2 : « en attente » ne vaut que dans les 10 minutes ; au-delà le fil est « sans réponse » (unknown).
    history.list.mockResolvedValue([thread({ last_message_role: 'user', last_message_at: new Date().toISOString() })])
    render(<ConversationsPanel />)
    expect(await screen.findByText('En attente')).toBeInTheDocument()
  })

  it('dit « Reçu » quand Laura a répondu en dernier', async () => {
    history.list.mockResolvedValue([thread({ last_message_role: 'assistant' })])
    render(<ConversationsPanel />)
    expect(await screen.findByText('Reçu')).toBeInTheDocument()
  })

  /**
   * LE TÉMOIN DE COMPATIBILITÉ — et la régression la plus probable de ce lot.
   * Un fil servi par une API antérieure au champ (tout l'historique déjà en
   * base) doit s'afficher exactement comme avant : son titre, sa date, et
   * AUCUNE pastille. « Non mesuré » n'est pas « en attente ».
   */
  it('n’affiche AUCUNE pastille sur un fil d’avant le champ — et le fil s’affiche quand même', async () => {
    history.list.mockResolvedValue([thread({ title: 'Fil d’avant ce lot' })])
    render(<ConversationsPanel />)
    expect(await screen.findByText('Fil d’avant ce lot')).toBeInTheDocument()
    expect(screen.queryByText('En attente')).not.toBeInTheDocument()
    expect(screen.queryByText('Reçu')).not.toBeInTheDocument()
  })
})
