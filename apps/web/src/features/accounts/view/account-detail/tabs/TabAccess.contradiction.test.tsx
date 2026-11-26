import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/**
 * #2130.102 — la contradiction Partenaires / Accès (matrice minimale, Louis
 * 02/10/2026) : l'API la détecte, cet onglet la NOMME, et ne dit rien sinon.
 */
const apiFetchMock = vi.mocked(apiFetch)

const ACCOUNT = {
  id: 'acc-1',
  status: 'completed',
  created_at: '2026-08-01T09:00:00.000Z',
  last_analyzed_at: '2026-08-20T09:00:00.000Z',
} as Account

function landscape(contradictions: unknown[]): Record<string, unknown> {
  return {
    lock: { state: 'verrouille', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning: null,
    community: null,
    question: null,
    barrier: null,
    accessLevel: 'inconnu',
    accessLevelFact: null,
    contradictions,
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

describe('l’onglet Accès nomme la contradiction Partenaires / Accès (#2130.102)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('nomme le partenaire concurrent dont l’entité est verrouillée', async () => {
    apiFetchMock.mockResolvedValue(
      landscape([{ entity_id: 'e-1', partner_id: 'p-1', partner_name: 'Atos', fact_id: 'f-1' }]),
    )
    mount()
    expect(await screen.findByText(/« Atos » est déclaré concurrent dans Partenaires/)).toBeInTheDocument()
  })

  it('ne rend aucune ligne quand rien ne se contredit', async () => {
    apiFetchMock.mockResolvedValue(landscape([]))
    mount()
    await screen.findByText('Accès inconnu')
    expect(screen.queryByText(/déclaré concurrent dans Partenaires/)).not.toBeInTheDocument()
  })
})
