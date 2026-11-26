import type React from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReplyMemoryUses as ReplyMemoryUsesData } from '@bellum/contracts'

/**
 * #1916.18 / #1916.24 — sous une réponse, les éléments de mémoire qui étaient
 * dans le contexte envoyé à Laura.
 *
 * Trois choses tenues ici :
 *  · la VÉRITÉ du libellé : « consulté », « avait en tête » — jamais « utilisé »,
 *    parce qu'on prouve l'envoi, pas l'usage ;
 *  · un élément « Toi uniquement » d'un collègue n'est qu'un COMPTE ;
 *  · une lecture ratée ne se lit pas « aucun élément ».
 */

let state: { data?: ReplyMemoryUsesData; isLoading: boolean; isError: boolean } = { isLoading: false, isError: false }
const requested: string[] = []

vi.mock('@/features/memory/hooks/useReplyMemoryUses', () => ({
  useReplyMemoryUses: (messageId: string) => {
    requested.push(messageId)
    return state
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const { ReplyMemoryUses } = await import('./ReplyMemoryUses')

const visible = {
  id: 'f-1',
  text: 'Ne propose plus de régie pure',
  scope: 'workspace' as const,
  kind: 'correction' as const,
  origin: 'manual' as const,
  accountId: null,
  expiresAt: null,
}

beforeEach(() => {
  requested.length = 0
  state = { isLoading: false, isError: false }
})

describe('ReplyMemoryUses — la mémoire consultée pour une réponse', () => {
  it('liste les éléments visibles, leur portée, et renvoie vers la mémoire de Laura', () => {
    state = {
      isLoading: false,
      isError: false,
      data: {
        consulted: [visible, { ...visible, id: 'f-2', text: 'Mon objectif du trimestre', scope: 'user' }],
        privateCount: 0,
        removedCount: 0,
      },
    }
    render(<ReplyMemoryUses messageId="m-1" />)
    expect(requested).toEqual(['m-1'])
    expect(screen.getByText('Mémoire consultée pour cette réponse')).toBeInTheDocument()
    expect(screen.getByText('Ne propose plus de régie pure')).toBeInTheDocument()
    expect(screen.getByText('Mon objectif du trimestre')).toBeInTheDocument()
    expect(screen.getByText('Toute ton ESN')).toBeInTheDocument()
    expect(screen.getByText('Toi uniquement')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gérer la mémoire de Laura/ })).toHaveAttribute('href', '/settings/memory')
  })

  it('dit ce qu’on sait prouver — transmis, pas « utilisé »', () => {
    state = { isLoading: false, isError: false, data: { consulted: [visible], privateCount: 0, removedCount: 0 } }
    const { container } = render(<ReplyMemoryUses messageId="m-1" />)
    expect(screen.getByText(/Laura avait ces éléments en tête/)).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/utilisé|a compté/i)
  })

  it('NON — un élément privé d’un collègue n’est qu’un compte : « 1 élément privé »', () => {
    state = { isLoading: false, isError: false, data: { consulted: [visible], privateCount: 1, removedCount: 0 } }
    render(<ReplyMemoryUses messageId="m-1" />)
    expect(screen.getByText(/1 élément privé/)).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('un élément supprimé depuis se dit « retiré depuis »', () => {
    state = { isLoading: false, isError: false, data: { consulted: [], privateCount: 0, removedCount: 2 } }
    render(<ReplyMemoryUses messageId="m-1" />)
    expect(screen.getByText('2 éléments retirés depuis')).toBeInTheDocument()
  })

  it('une lecture ratée se dit, sans prétendre qu’il n’y avait rien', () => {
    state = { isLoading: false, isError: true }
    const { container } = render(<ReplyMemoryUses messageId="m-1" />)
    expect(screen.getByText(/n’a pas pu être relue/)).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/aucune|aucun/i)
  })

  it('plus aucune trace (effacée depuis) : la phrase le dit', () => {
    state = { isLoading: false, isError: false, data: { consulted: [], privateCount: 0, removedCount: 0 } }
    render(<ReplyMemoryUses messageId="m-1" />)
    expect(screen.getByText('Aucune trace conservée pour cette réponse.')).toBeInTheDocument()
  })
})
