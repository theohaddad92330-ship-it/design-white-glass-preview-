import { act, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #1944.12 — ROVING TABINDEX sur la liste des fils de Laura.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER PROTÈGE, ET POURQUOI IL EXISTE À PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré sur `origin/main` le 25/09/2026 : chaque fil de la liste (`ConversationsPanel.tsx`)
 * est un `<Link>` avec son propre arrêt Tab natif. Une liste de cent fils fait
 * cent arrêts Tab avant d'atteindre le composeur du chat — le motif WAI-ARIA
 * « roving tabindex » (un seul arrêt Tab pour tout le groupe, les flèches
 * déplacent le focus À L'INTÉRIEUR) n'existait pas.
 *
 * Un premier écrivain avait déjà codé ce correctif puis s'est bloqué avant de
 * committer : le travail est perdu, ce fichier et l'implémentation qui
 * l'accompagne le refont.
 */

const history = vi.hoisted(() => ({ list: vi.fn() }))
const accounts = vi.hoisted(() => ({ data: vi.fn((): { data: unknown } => ({ data: undefined })) }))
const self = vi.hoisted(() => ({
  author: vi.fn((): { firstName: string; avatarUrl: string | null } | null => null),
}))
const searching = vi.hoisted(() => ({ search: vi.fn() }))

vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => accounts.data(),
}))
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({
  useSelfChatAuthor: () => self.author(),
}))
vi.mock('@/features/chat/api/agentChatApi', () => ({
  listAgentChatHistory: history.list,
  renameAgentChatThread: vi.fn(),
  duplicateAgentChatThread: vi.fn(),
  exportAgentChatThread: vi.fn(),
  deleteAgentChatThread: vi.fn(),
  setAgentChatThreadArchived: vi.fn(),
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
  conversation_id: 'c-1',
  title: 'Fil',
  created_at: '2026-08-20T10:00:00Z',
  last_message_at: '2026-08-25T10:00:00Z',
  ...over,
})

beforeEach(() => {
  searching.search.mockResolvedValue([])
  self.author.mockReturnValue(null)
  localStorage.clear()
})

function focus(link: HTMLAnchorElement) {
  act(() => link.focus())
}

function pressKey(link: HTMLAnchorElement, key: string) {
  act(() => {
    link.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

async function renderThreads(titles: string[]) {
  history.list.mockResolvedValue(titles.map((title, i) => thread({ id: `t${i}`, conversation_id: `c${i}`, title })))
  render(<ConversationsPanel />)
  await screen.findByText(titles[0]!)
  return titles.map(title => screen.getByText(title).closest('a') as HTMLAnchorElement)
}

describe('ConversationsPanel — roving tabindex sur la liste des fils', () => {
  it('un seul lien est un arrêt Tab (`tabIndex=0`), le premier fil par défaut', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix', 'Plan de compte'])
    expect(links[0]).toHaveAttribute('tabIndex', '0')
    expect(links[1]).toHaveAttribute('tabIndex', '-1')
    expect(links[2]).toHaveAttribute('tabIndex', '-1')
  })

  it('ArrowDown déplace le focus ET l’arrêt Tab au fil suivant', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix', 'Plan de compte'])
    focus(links[0]!)
    pressKey(links[0]!, 'ArrowDown')
    await waitFor(() => expect(links[1]).toHaveFocus())
    expect(links[1]).toHaveAttribute('tabIndex', '0')
    expect(links[0]).toHaveAttribute('tabIndex', '-1')
  })

  it('ArrowUp déplace le focus au fil précédent', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix', 'Plan de compte'])
    focus(links[2]!)
    pressKey(links[2]!, 'ArrowUp')
    await waitFor(() => expect(links[1]).toHaveFocus())
    expect(links[1]).toHaveAttribute('tabIndex', '0')
  })

  it('reste sur le dernier fil : ArrowDown n’y fait rien (pas de boucle)', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix'])
    focus(links[1]!)
    pressKey(links[1]!, 'ArrowDown')
    await waitFor(() => expect(links[1]).toHaveFocus())
    expect(links[1]).toHaveAttribute('tabIndex', '0')
  })

  it('Home et End rejoignent le premier et le dernier fil', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix', 'Plan de compte'])
    focus(links[1]!)
    pressKey(links[1]!, 'End')
    await waitFor(() => expect(links[2]).toHaveFocus())
    pressKey(links[2]!, 'Home')
    await waitFor(() => expect(links[0]).toHaveFocus())
  })

  it('un focus natif (Tab, clic) sur un fil en fait le nouvel arrêt Tab', async () => {
    const links = await renderThreads(['Angle RSE', 'Objections prix', 'Plan de compte'])
    focus(links[2]!)
    await waitFor(() => expect(links[2]).toHaveAttribute('tabIndex', '0'))
    expect(links[0]).toHaveAttribute('tabIndex', '-1')
    expect(links[1]).toHaveAttribute('tabIndex', '-1')
  })
})
