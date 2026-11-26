import type { TargetList } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import { useRefillTargetListFromSavedSearch } from './useRefillTargetListFromSavedSearch'

// #3075 (rattrapage) — une cible d'origine « recherche enregistrée » créée
// AVANT le correctif est restée vide/incomplète en base : ce hook la
// re-remplit à la demande (un clic sur LA liste concernée, jamais tout le
// parc), sans jamais redemander ni redoubler un compte déjà présent, et sans
// jamais consommer de crédit.

const mockApiFetch = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fakeList(overrides: Partial<TargetList> = {}): TargetList {
  return {
    id: 'list-1',
    name: 'Recette 2853 - Fintech FR',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'private',
    source: 'saved_search',
    source_query: { ...emptyUnifiedFilters(), department: '69' },
    status: 'draft',
    counts: { measured: true, total: 1, ready_to_work: 0, to_review: 1 },
    next_action: null,
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'user-1',
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    items: [],
    ...overrides,
  }
}

function fakeItem(refId: string) {
  return {
    id: `item-${refId}`,
    target_list_id: 'list-1',
    kind: 'account' as const,
    ref_id: refId,
    label: refId,
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review' as const,
    provenance: 'discover' as const,
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
  }
}

describe('useRefillTargetListFromSavedSearch — #3075 (rattrapage)', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApiFetch.mockReset()
  })

  it('rejoue la recherche de la liste et verse les 13 comptes restants (14 trouvés, 1 déjà présent)', async () => {
    const existing = fakeItem('acc-1')
    const list = fakeList({ items: [existing] })

    const found = [
      { name: 'Acme', siren: '552100554', accountId: 'acc-1' }, // déjà un item vivant — jamais redoublé
      ...Array.from({ length: 13 }, (_, i) => ({
        name: `Fintech ${i}`,
        siren: String(100000000 + i).padStart(9, '0'),
        accountId: null,
      })),
    ]
    mockApiFetch.mockResolvedValueOnce({ candidates: found }) // POST /ia/discover/registry
    for (let i = 0; i < 13; i++) {
      mockApiFetch.mockResolvedValueOnce({
        id: `acc-new-${i}`,
        company_name: `Fintech ${i}`,
        siren: null,
        created: true,
      })
      mockApiFetch.mockResolvedValueOnce(fakeItem(`acc-new-${i}`))
    }

    const { result } = renderHook(() => useRefillTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ list })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 1 recherche + 13 × (portefeuille + ajout) = 27 appels, aucun pour "acc-1".
    expect(mockApiFetch).toHaveBeenCalledTimes(27)
    expect(result.current.data).toMatchObject({ addedCount: 13, foundCount: 14, failedCount: 0 })
  })

  it('ne redemande ni ne redouble un compte déjà un item vivant de LA liste', async () => {
    const existing = fakeItem('acc-1')
    const list = fakeList({ items: [existing] })
    mockApiFetch.mockResolvedValueOnce({ candidates: [{ name: 'Acme', siren: '552100554', accountId: 'acc-1' }] })

    const { result } = renderHook(() => useRefillTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ list })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Un seul appel : la recherche. Ni /accounts/portfolio, ni /items.
    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    expect(result.current.data).toMatchObject({ addedCount: 0, foundCount: 1, failedCount: 0 })
  })

  it('une cible sans source_query (défensif) rejoue un rail vide plutôt que de planter', async () => {
    const list = fakeList({ source_query: null })

    const { result } = renderHook(() => useRefillTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ list })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    // Rail vide → `buildDiscoverRequest` rend `null`, AUCUN appel Découvrir ne part.
    expect(mockApiFetch).toHaveBeenCalledTimes(0)
    expect(result.current.data).toMatchObject({ addedCount: 0, foundCount: 0, failedCount: 0 })
  })
})
