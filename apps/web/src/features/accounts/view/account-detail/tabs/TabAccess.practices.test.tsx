import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { TabAccess } from './TabAccess'

/** #5106.8 — la forme « Pratiques achats » : la grille d’abord, l’ancien contenu en « Lecture détaillée », l’alerte en tête. */

vi.mock('@/features/tasks/hooks/useTasks', () => ({ useCreateTask: () => ({ mutate: vi.fn(), isPending: false }) }))

const apiFetchMock = vi.mocked(apiFetch)
const ACCOUNT = { id: 'acc-1', status: 'completed', created_at: '2026-08-01T09:00:00.000Z' } as Account

function landscape(warning: unknown) {
  return {
    lock: { state: 'inconnu', fact: null },
    modes: [],
    cost: null,
    facts: [],
    entities: [],
    avoidGroupEntry: false,
    warning,
    community: null,
    question: null,
    barrier: null,
    accessLevel: 'inconnu',
    accessLevelFact: null,
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

describe('Pratiques achats — le contenu actuel de l’onglet Accès (#5106.8)', () => {
  beforeEach(() => apiFetchMock.mockReset())
  afterEach(cleanup)

  it('les blocs d’avant sont rendus dans « Lecture détaillée » (repli fermé par défaut), rien n’est retiré', async () => {
    apiFetchMock.mockResolvedValue(landscape(null))
    mount()
    const detailed = await screen.findByTestId('access-detailed-reading')
    expect((detailed as HTMLDetailsElement).open).toBe(false)
    expect(detailed.querySelector('summary')?.textContent).toBe('Lecture détaillée')
    // niveau d’accès, verrou, état d’accès : toujours là, sous le repli.
    expect(detailed.textContent).toContain('Ce qui verrouille')
    expect(detailed.textContent?.length).toBeGreaterThan(100)
    // la grille (et son état vide) est AU-DESSUS du repli, jamais dedans.
    expect(detailed.contains(screen.getByTestId('procurement-practices'))).toBe(false)
  })

  it('l’avertissement procédure collective reste visible en tête, hors du repli', async () => {
    apiFetchMock.mockResolvedValue(landscape({ kind: 'procedure_collective', date: null, label: 'x', url: null }))
    mount()
    const detailed = await screen.findByTestId('access-detailed-reading')
    await waitFor(() => expect(screen.getAllByText(/procédure collective/i).length).toBeGreaterThan(0))
    for (const node of screen.getAllByText(/procédure collective/i)) expect(detailed.contains(node)).toBe(false)
  })
})
