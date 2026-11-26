import type React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MemoryLedgerEntry } from '@bellum/contracts'

/**
 * #2260.7 — L'OBJET VISÉ, NOMMÉ ET CLIQUABLE VERS SA FICHE.
 *
 * Réglages › Mémoire de Laura montre déjà le scope, l'origine, la date et la
 * portée de chaque élément (2260.19 à .22). Ce lot y ajoute l'OBJET visé —
 * contact, besoin, consultant ou mission — quand il y en a un : nommé (jamais
 * un identifiant nu) et cliquable vers sa fiche, comme `PlanItemFacts.tsx` le
 * fait déjà pour « l'objet visé » d'une action du plan (#2123.33), même patron.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => {
    const href = Object.entries(params ?? {}).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
    return (
      <a href={href} {...rest}>
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

function fact(over: Partial<MemoryLedgerEntry>): MemoryLedgerEntry {
  return {
    id: 'f-1',
    layer: 'facts',
    text: 'Le décideur a changé',
    recordedAt: '2026-09-10T09:00:00.000Z',
    accountId: null,
    detail: null,
    expiresAt: null,
    kind: 'fact',
    origin: 'manual',
    scope: 'user',
    ownedByMe: true,
    canForget: true,
    canEdit: true,
    author: null,
    ...over,
  }
}

function renderRow(entry: MemoryLedgerEntry) {
  return render(
    <MemoryFactRow entry={entry} onForget={vi.fn()} forgetting={false} onSetScope={vi.fn()} settingScope={false} />,
  )
}

describe('MemoryFactRow — l’objet visé (#2260.7)', () => {
  it('un contact visé est nommé, et cliquable vers sa fiche', () => {
    renderRow(fact({ object: { type: 'contact', id: 'c-1', name: 'Ferdinand Aumont' } }))
    const link = screen.getByRole('link', { name: /Ferdinand Aumont/ })
    expect(link).toHaveAttribute('href', '/contacts/c-1')
  })

  it('un besoin visé mène à sa fiche projet', () => {
    renderRow(fact({ object: { type: 'need', id: 'n-1', name: 'Ingénieur d’exploitation' } }))
    const link = screen.getByRole('link', { name: /Ingénieur d’exploitation/ })
    expect(link).toHaveAttribute('href', '/projects/needs/n-1')
  })

  it('un consultant visé mène à sa fiche vivier', () => {
    renderRow(fact({ object: { type: 'consultant', id: 'cs-1', name: 'Yanis Berthier' } }))
    const link = screen.getByRole('link', { name: /Yanis Berthier/ })
    expect(link).toHaveAttribute('href', '/consultants/cs-1')
  })

  it('une mission visée mène à sa fiche', () => {
    renderRow(fact({ object: { type: 'mission', id: 'm-1', name: 'Fiabilisation plateforme' } }))
    const link = screen.getByRole('link', { name: /Fiabilisation plateforme/ })
    expect(link).toHaveAttribute('href', '/missions/m-1')
  })

  it('un objet dont le nom n’a pas pu être résolu le DIT — jamais un lien vers un nom deviné', () => {
    renderRow(fact({ object: { type: 'contact', id: 'c-2', name: null } }))
    expect(screen.queryByRole('link', { name: /c-2/ })).not.toBeInTheDocument()
    expect(screen.getByText('Contact introuvable')).toBeInTheDocument()
  })

  it('sans objet visé : aucun badge — retire le lien, il disparaît (DIRE NON)', () => {
    renderRow(fact({ object: null }))
    expect(screen.queryByRole('link', { name: /Fiabilisation/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Contact introuvable')).not.toBeInTheDocument()
  })

  it('API plus ancienne (`object` absent) : aucun badge, jamais une erreur', () => {
    const { object: _drop, ...withoutObject } = fact({ object: { type: 'mission', id: 'm-1', name: 'x' } })
    renderRow(withoutObject as MemoryLedgerEntry)
    expect(screen.queryByRole('link', { name: /^x$/ })).not.toBeInTheDocument()
  })
})
