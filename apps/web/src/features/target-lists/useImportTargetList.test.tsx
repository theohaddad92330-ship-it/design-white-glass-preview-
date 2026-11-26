import type { TargetList } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useImportTargetList } from './useImportTargetList'

// #2156.55 — « Importer une liste ». Colle des noms, la liste ne référence que
// les fiches RÉELLEMENT trouvées dans l'espace (`ref_id` réel exigé par
// `addTargetListItemSchema`) — les noms sans correspondance certaine sont
// rendus tels quels, jamais inventés.

const mockApiFetch = vi.fn()

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

let client: QueryClient

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function fakeList(): TargetList {
  return {
    id: 'list-1',
    name: 'Banques régionales',
    objective: null,
    type: null,
    owner_user_id: null,
    team: null,
    visibility: 'workspace',
    source: 'import',
    source_query: null,
    status: 'draft',
    counts: { measured: true, total: 0, ready_to_work: 0, to_review: 0 },
    next_action: 'Ajouter les premiers comptes ou contacts',
    sequence_id: null,
    prospecting_session_id: null,
    created_by: 'user-1',
    created_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
    items: [],
  }
}

function fakeItem(refId: string): unknown {
  return {
    id: `item-${refId}`,
    target_list_id: 'list-1',
    kind: 'account',
    ref_id: refId,
    label: null,
    sublabel: null,
    selection_reason: null,
    priority: null,
    owner_user_id: null,
    work_status: 'to_review',
    provenance: 'import',
    refreshed_at: null,
    removed_at: null,
    removal_reason: null,
    next_action: null,
    notes: null,
    created_at: '2026-09-23T00:00:00.000Z',
    updated_at: '2026-09-23T00:00:00.000Z',
  }
}

describe('useImportTargetList — #2156.55', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockApiFetch.mockReset()
  })

  it('crée la liste puis ajoute chaque nom RETROUVÉ, nomme le reste comme non trouvé', async () => {
    mockApiFetch
      .mockResolvedValueOnce(fakeList()) // POST /target-lists
      .mockResolvedValueOnce({ candidates: [{ kind: 'account', id: 'acc-1', label: 'Renault', sublabel: null }] }) // GET candidates?q=Renault
      .mockResolvedValueOnce(fakeItem('acc-1')) // POST items (Renault)
      .mockResolvedValueOnce({ candidates: [] }) // GET candidates?q=Fictacme — rien

    const { result } = renderHook(() => useImportTargetList(), { wrapper })

    act(() => {
      result.current.mutate({ listName: 'Banques régionales', names: ['Renault', 'Fictacme'] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual({ listId: 'list-1', added: 1, unmatched: ['Fictacme'] })
    const createCall = mockApiFetch.mock.calls[0][0] as { path: string; body: { source: string } }
    expect(createCall.path).toBe('/target-lists')
    expect(createCall.body.source).toBe('import')
    const addItemCall = mockApiFetch.mock.calls[2][0] as { path: string; body: { ref_id: string; provenance: string } }
    expect(addItemCall.path).toBe('/target-lists/list-1/items')
    expect(addItemCall.body).toMatchObject({ ref_id: 'acc-1', provenance: 'import' })
  })

  it('un nom ambigu (deux fiches identiques) reste non trouvé — jamais deviné', async () => {
    mockApiFetch.mockResolvedValueOnce(fakeList()).mockResolvedValueOnce({
      candidates: [
        { kind: 'account', id: 'acc-1', label: 'Orange', sublabel: null },
        { kind: 'contact', id: 'contact-1', label: 'Orange', sublabel: null },
      ],
    })

    const { result } = renderHook(() => useImportTargetList(), { wrapper })

    act(() => {
      result.current.mutate({ listName: 'Télécoms', names: ['Orange'] })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ listId: 'list-1', added: 0, unmatched: ['Orange'] })
    expect(mockApiFetch).toHaveBeenCalledTimes(2) // create + candidates — jamais d'addItem
  })
})
