import type React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemoryLedgerEntry } from '@bellum/contracts'

/**
 * #1916.24 — dans Réglages › Mémoire de Laura : « consulté dans N réponses, la
 * dernière le … », et la conversation la plus récente que le lecteur peut ouvrir.
 * Un seul libellé par élément : il remplace « Non utilisé par Laura
 * aujourd'hui » dès que la mesure existe.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string | undefined>
    children: React.ReactNode
  }) => {
    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
    ).toString()
    return (
      <a href={query ? `${to}?${query}` : to} {...rest}>
        {children}
      </a>
    )
  },
}))

vi.mock('@/features/memory/hooks/useMemoryLedger', () => ({
  useUpdateFact: () => ({ mutate: vi.fn(), isPending: false }),
  useFactHistory: () => ({ data: undefined, isLoading: false, isError: false }),
}))

const { MemoryFactRow } = await import('./MemoryFactRow')

const PAST = '2026-08-31T23:59:59.999Z'

function fact(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'f-1',
    layer: 'facts',
    text: 'Budget IT voté en Q2',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'workspace',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: null,
    surfaces: ['chat', 'externalAssistant'],
    ...over,
  }
}

function renderRow(entry: MemoryLedgerEntry) {
  return render(
    <MemoryFactRow entry={entry} onForget={vi.fn()} forgetting={false} onSetScope={vi.fn()} settingScope={false} />,
  )
}

describe('MemoryFactRow — les consultations d’un élément', () => {
  it('« Consulté par Laura dans N réponses, la dernière le … » et un lien vers la conversation la plus récente', () => {
    renderRow(
      fact({
        consultations: {
          replies: 3,
          lastAt: '2026-09-12T10:00:00.000Z',
          lastConversation: { accountId: 'acc-1', conversationId: 'account-acc-1' },
        },
      }),
    )
    expect(screen.getByText(/Consulté par Laura dans 3 réponses, la dernière le/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ouvrir la conversation/ })).toHaveAttribute(
      'href',
      '/chat?accountId=acc-1&conversationId=account-acc-1',
    )
  })

  it('consulté seulement par un assistant externe : le compte, sans lien vers un fil qui n’existe pas', () => {
    renderRow(fact({ consultations: { replies: 1, lastAt: '2026-09-12T10:00:00.000Z', lastConversation: null } }))
    expect(screen.getByText(/Consulté par Laura dans 1 réponse, le/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Ouvrir la conversation/ })).not.toBeInTheDocument()
  })

  it('jamais consulté : « Pas encore consulté par Laura »', () => {
    renderRow(fact({ consultations: { replies: 0, lastAt: null, lastConversation: null } }))
    expect(screen.getByText('Pas encore consulté par Laura')).toBeInTheDocument()
  })

  it('UN seul libellé : échu et jamais consulté ne dit plus « Non utilisé aujourd’hui » en plus', () => {
    const { container } = renderRow(
      fact({ expiresAt: PAST, surfaces: [], consultations: { replies: 0, lastAt: null, lastConversation: null } }),
    )
    expect(screen.getByText('Jamais consulté par Laura avant son échéance')).toBeInTheDocument()
    expect(container.textContent ?? '').not.toMatch(/Non utilisé/)
  })

  it('non mesuré (API plus ancienne) : rien n’est affirmé sur les consultations, le libellé d’avant reste', () => {
    const { container } = renderRow(fact({ expiresAt: PAST, surfaces: [] }))
    expect(container.textContent ?? '').not.toMatch(/Consulté|Pas encore consulté|Jamais consulté/)
    expect(screen.getByText(/Non utilisé par Laura aujourd'hui/)).toBeInTheDocument()
  })
})
