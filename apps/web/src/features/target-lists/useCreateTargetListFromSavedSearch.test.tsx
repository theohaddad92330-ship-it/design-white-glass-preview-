import type { TargetList, TargetListItem } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'
import { useCreateTargetListFromSavedSearch } from './useCreateTargetListFromSavedSearch'

// #3075 (bis, toujours en prod après le premier correctif e0c4b4fb) — le
// premier correctif ne versait que les candidats DÉJÀ des comptes de l'espace
// (`accountId` non nul) : sur 14 entreprises trouvées par une recherche
// enregistrée, 13 qui n'étaient pas encore des fiches compte de l'espace
// restaient dehors, sans message — la cible affichait « 0 sur 1 prêts à
// contacter ». Ce lot verse TOUS les candidats trouvés : pour un candidat
// sans `accountId`, on rejoue le chemin qui crée/rattache déjà le compte pour
// « Ajouter à mon portefeuille » depuis Découvrir (`accountsApi.addToPortfolio`,
// `POST /accounts/portfolio` — AUCUN crédit débité, l'analyse reste la seule
// dépense), puis on verse ce compte comme n'importe quel autre. Un échec
// technique isolé (portefeuille ou ajout) ne bloque pas les autres candidats
// (même doctrine que #2293.7 sur les lots d'analyse) : la cible le NOMME
// (`addedCount`/`foundCount`/`failedCount`), jamais un silence.

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

function search(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return {
    id: 's1',
    label: 'ETI industrielles 69/38',
    filters: emptyUnifiedFilters(),
    savedAt: Date.parse('2026-09-01T08:00:00.000Z'),
    objective: null,
    alertFrequency: 'manual',
    alertChannel: null,
    resultType: null,
    newItems: null,
    sourceKinds: [],
    lastRunAt: null,
    ownerId: 'u1',
    ownerName: null,
    shared: false,
    ...overrides,
  }
}

function fakeList(overrides: Partial<TargetList> = {}): TargetList {
  return {
    id: 'list-1',
    name: 'ETI industrielles 69/38',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'private',
    source: 'saved_search',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
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

function fakeItem(overrides: Partial<TargetListItem> = {}): TargetListItem {
  return {
    id: 'item-1',
    target_list_id: 'list-1',
    kind: 'account',
    ref_id: 'acc-1',
    label: 'Acme',
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'discover',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: '2026-09-26T00:00:00.000Z',
    updated_at: '2026-09-26T00:00:00.000Z',
    ...overrides,
  }
}

describe('useCreateTargetListFromSavedSearch — #3075 (#2157.9)', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApiFetch.mockReset()
  })

  it("crée une cible tracée sur la recherche (source 'saved_search', filtres en source_query)", async () => {
    // Rail sans aucun critère : `buildDiscoverRequest` rend `null`, aucun appel
    // Découvrir ne part — seule la création de la liste appelle l'API.
    mockApiFetch.mockResolvedValueOnce(fakeList())

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ label: 'ETI industrielles 69/38', objective: 'Ouvrir 3 comptes' }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledTimes(1)
    const [call] = mockApiFetch.mock.calls as [{ path: string; method: string; body: Record<string, unknown> }][]
    expect(call[0]).toMatchObject({
      path: '/target-lists',
      method: 'POST',
      body: {
        name: 'ETI industrielles 69/38',
        objective: 'Ouvrir 3 comptes',
        source: 'saved_search',
        source_query: emptyUnifiedFilters(),
      },
    })
  })

  it('rejoue la recherche (même moteur que /discover) et verse un candidat déjà compte', async () => {
    const filters = { ...emptyUnifiedFilters(), department: '69' }
    mockApiFetch
      .mockResolvedValueOnce({
        candidates: [{ name: 'Acme', siren: '552100554', accountId: 'acc-1' }],
      }) // POST /ia/discover/registry
      .mockResolvedValueOnce(fakeList()) // POST /target-lists
      .mockResolvedValueOnce(fakeItem()) // POST /target-lists/list-1/items

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ filters }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledTimes(3)
    const [searchCall, createCall, addItemCall] = mockApiFetch.mock.calls as [
      { path: string; method: string },
      { path: string; method: string; body: Record<string, unknown> },
      { path: string; method: string; body: Record<string, unknown> },
    ][]
    expect(searchCall[0]).toMatchObject({ path: '/ia/discover/registry', method: 'POST' })
    expect(createCall[0]).toMatchObject({ path: '/target-lists', method: 'POST' })
    // Déjà un `accountId` : aucun appel `/accounts/portfolio` avant l'ajout —
    // exactement 3 appels au total (recherche, création, un seul ajout).
    expect(addItemCall[0]).toMatchObject({
      path: '/target-lists/list-1/items',
      method: 'POST',
      body: { kind: 'account', ref_id: 'acc-1', provenance: 'discover' },
    })
    expect(result.current.data).toMatchObject({ addedCount: 1, foundCount: 1, failedCount: 0 })
  })

  it('#3075 bis — un candidat SANS accountId encore est versé au portefeuille puis à la cible (AUCUN crédit)', async () => {
    const filters = { ...emptyUnifiedFilters(), department: '69' }
    mockApiFetch
      .mockResolvedValueOnce({
        candidates: [{ name: 'Not Owned Yet', siren: '111222333', accountId: null, sector: 'Fintech' }],
      }) // POST /ia/discover/registry
      .mockResolvedValueOnce(fakeList()) // POST /target-lists
      .mockResolvedValueOnce({ id: 'acc-new', company_name: 'Not Owned Yet', siren: '111222333', created: true }) // POST /accounts/portfolio
      .mockResolvedValueOnce(fakeItem({ ref_id: 'acc-new' })) // POST /target-lists/list-1/items

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ filters }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledTimes(4)
    const [, , portfolioCall, addItemCall] = mockApiFetch.mock.calls as [
      unknown,
      unknown,
      { path: string; method: string; body: Record<string, unknown> },
      { path: string; method: string; body: Record<string, unknown> },
    ][]
    expect(portfolioCall[0]).toMatchObject({
      path: '/accounts/portfolio',
      method: 'POST',
      body: { company_name: 'Not Owned Yet', siren: '111222333', sector: 'Fintech' },
    })
    expect(addItemCall[0]).toMatchObject({
      path: '/target-lists/list-1/items',
      method: 'POST',
      body: { kind: 'account', ref_id: 'acc-new', provenance: 'discover' },
    })
    expect(result.current.data).toMatchObject({ addedCount: 1, foundCount: 1, failedCount: 0 })
  })

  it("#3075 bis — un échec technique isolé (mise au portefeuille) n'empêche pas les autres candidats, et se compte", async () => {
    const filters = { ...emptyUnifiedFilters(), department: '69' }
    mockApiFetch
      .mockResolvedValueOnce({
        candidates: [
          { name: 'Fails', siren: '111222333', accountId: null },
          { name: 'Acme', siren: '552100554', accountId: 'acc-1' },
        ],
      }) // POST /ia/discover/registry
      .mockResolvedValueOnce(fakeList()) // POST /target-lists
      .mockRejectedValueOnce(new Error('502')) // POST /accounts/portfolio — échoue pour "Fails"
      .mockResolvedValueOnce(fakeItem()) // POST /target-lists/list-1/items — pour "Acme"

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ filters }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toMatchObject({ addedCount: 1, foundCount: 2, failedCount: 1 })
  })

  it("recherche sans résultat éligible → la cible naît vide, et l'écran le dit", async () => {
    const filters = { ...emptyUnifiedFilters(), department: '69' }
    mockApiFetch
      .mockResolvedValueOnce({ candidates: [] }) // POST /ia/discover/registry
      .mockResolvedValueOnce(fakeList()) // POST /target-lists

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ filters }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Recherche + création de la liste, AUCUN appel `addItem`.
    expect(mockApiFetch).toHaveBeenCalledTimes(2)
    expect(result.current.data).toMatchObject({ addedCount: 0, foundCount: 0, failedCount: 0 })
  })

  it('part du moteur SIGNAUX dès qu’une source d’intention est cochée, comme /discover', async () => {
    const filters = { ...emptyUnifiedFilters(), signalSources: ['tender' as const] }
    mockApiFetch
      .mockResolvedValueOnce({ candidates: [{ name: 'Acme', siren: '552100554', accountId: 'acc-1' }] }) // POST /ia/discover/signals
      .mockResolvedValueOnce(fakeList())
      .mockResolvedValueOnce(fakeItem())

    const { result } = renderHook(() => useCreateTargetListFromSavedSearch(), { wrapper })

    act(() => {
      result.current.mutate({ search: search({ filters }) })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [searchCall] = mockApiFetch.mock.calls as [{ path: string }][]
    expect(searchCall[0].path).toBe('/ia/discover/signals')
  })
})
