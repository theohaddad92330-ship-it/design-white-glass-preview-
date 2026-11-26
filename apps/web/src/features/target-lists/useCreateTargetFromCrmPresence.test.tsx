import type { TargetList } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateTargetFromCrmPresence } from './useCreateTargetFromCrmPresence'

// Épopée #2853 (#2157.7) — « Créer une cible » depuis le connecteur CRM :
// même geste en deux écritures que #2164.44 (`useCreateTargetFromAccount`),
// `source`/`provenance: 'crm'` au lieu de `'analysis'`.

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

function fakeList(): TargetList {
  return {
    id: 'list-1',
    name: 'Renault',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'private',
    source: 'crm',
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
  }
}

describe('useCreateTargetFromCrmPresence — épopée #2853 (#2157.7)', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApiFetch.mockReset()
  })

  it("crée une liste avec source 'crm' PUIS y ajoute le compte avec provenance 'crm'", async () => {
    const list = fakeList()
    mockApiFetch
      .mockResolvedValueOnce(list) // POST /target-lists
      .mockResolvedValueOnce({
        id: 'item-1',
        target_list_id: 'list-1',
        kind: 'account',
        ref_id: 'acc-1',
        label: 'Renault',
        sublabel: null,
        selection_reason: null,
        priority: null,
        owner_user_id: null,
        work_status: 'to_review',
        provenance: 'crm',
        refreshed_at: null,
        removed_at: null,
        removal_reason: null,
        next_action: null,
        notes: null,
        created_at: '2026-09-25T00:00:00.000Z',
        updated_at: '2026-09-25T00:00:00.000Z',
      }) // POST /target-lists/:id/items

    const { result } = renderHook(() => useCreateTargetFromCrmPresence(), { wrapper })

    act(() => {
      result.current.mutate({ accountId: 'acc-1', companyName: 'Renault' })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApiFetch).toHaveBeenCalledTimes(2)
    const [createCall, addItemCall] = mockApiFetch.mock.calls as [unknown, unknown][]
    expect(createCall[0]).toMatchObject({
      path: '/target-lists',
      method: 'POST',
      body: { name: 'Renault', source: 'crm' },
    })
    expect(addItemCall[0]).toMatchObject({
      path: '/target-lists/list-1/items',
      method: 'POST',
      body: { kind: 'account', ref_id: 'acc-1', provenance: 'crm' },
    })
  })

  it("sans nom de compte, retombe sur un nom générique plutôt que d'envoyer une chaîne vide", async () => {
    const list = fakeList()
    mockApiFetch.mockResolvedValueOnce(list).mockResolvedValueOnce({
      id: 'item-1',
      target_list_id: 'list-1',
      kind: 'account',
      ref_id: 'acc-1',
      label: null,
      sublabel: null,
      selection_reason: null,
      priority: null,
      owner_user_id: null,
      work_status: 'to_review',
      provenance: 'crm',
      refreshed_at: null,
      removed_at: null,
      removal_reason: null,
      next_action: null,
      notes: null,
      created_at: '2026-09-25T00:00:00.000Z',
      updated_at: '2026-09-25T00:00:00.000Z',
    })

    const { result } = renderHook(() => useCreateTargetFromCrmPresence(), { wrapper })

    act(() => {
      result.current.mutate({ accountId: 'acc-1', companyName: null })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [createCall] = mockApiFetch.mock.calls as [{ body: { name: string } }][]
    expect(createCall[0].body.name.length).toBeGreaterThan(0)
  })
})
