import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/** Lot 776 — l'onglet « Écosystème & accès » porte le bloc « Accès au compte · Base commune » quand il est établi. */
const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

function landscape(over: Record<string, unknown>): Record<string, unknown> {
  return {
    lock: { state: 'verrouille', fact: null },
    modes: [],
    cost: null,
    costEstimate: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    accessLevel: 'inconnu',
    accessLevelFact: null,
    contradictions: [],
    ...over,
  }
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <TabAccess account={ACCOUNT} />
    </QueryClientProvider>,
  )
}

describe('l’onglet Accès — Accès au compte · Base commune (lot 776)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('affiche le bloc quand le serveur le porte', async () => {
    apiFetchMock.mockResolvedValue(
      landscape({
        dataforgeAccess: { accessibility: 'low', barriers: [], route: 'tender', priority: null, observedAt: null },
      }),
    )
    mount()
    expect(await screen.findByTestId('dataforge-access-block')).toHaveTextContent('Difficile d’accès')
  })

  it('aucun bloc quand il est absent', async () => {
    apiFetchMock.mockResolvedValue(landscape({ dataforgeAccess: null }))
    mount()
    expect(await screen.findByText('Coût d’accès inconnu.')).toBeInTheDocument()
    expect(screen.queryByTestId('dataforge-access-block')).toBeNull()
  })
})
