import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/**
 * #4016.L4 — « coût d'accès estimé » : sans coût déclaré ici, l'onglet montre la déclaration de TON espace
 * sur un compte au même verrou, badgée « estimé », nommée et datée ; une déclaration ici gagne toujours.
 */
const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

const ESTIMATE = {
  value: '3 % via le porteur',
  basis: { companyName: 'Thales', observedAt: '2026-09-15', lock: 'verrouille' },
}

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

describe('l’onglet Accès — coût d’accès estimé (#4016.L4)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('sans coût déclaré : l’estimation badgée « estimé », avec sa base nommée et datée', async () => {
    apiFetchMock.mockResolvedValue(landscape({ costEstimate: ESTIMATE }))
    mount()
    expect(await screen.findByText('3 % via le porteur')).toBeInTheDocument()
    const badge = screen.getByRole('note', { name: /estimé/ })
    expect(badge.getAttribute('aria-label')).toMatch(/Thales/)
  })

  it('sait dire NON : sans base, « Coût d’accès inconnu. », aucun badge', async () => {
    apiFetchMock.mockResolvedValue(landscape({}))
    mount()
    expect(await screen.findByText('Coût d’accès inconnu.')).toBeInTheDocument()
    expect(screen.queryByRole('note', { name: /estimé/ })).not.toBeInTheDocument()
  })
})
