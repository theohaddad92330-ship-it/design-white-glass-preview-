import type { AccountListResponse } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSetAccountFavorite } from './useSetAccountFavorite'

const mockSetFavorite = vi.fn()
const mockToastError = vi.fn()

vi.mock('@/features/accounts/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/accounts/api')>('@/features/accounts/api')
  return {
    ...actual,
    accountsApi: { ...actual.accountsApi, setFavorite: (...args: unknown[]) => mockSetFavorite(...args) },
  }
})

vi.mock('sonner', () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}))

let client: QueryClient

const QUERY_KEY = ['accounts', 'list', 'user-1', { limit: 25 }] as const

function seedList(): void {
  const page: AccountListResponse = {
    data: [
      { id: 'acc-1', company_name: 'Thales', is_favorite: false } as AccountListResponse['data'][number],
      { id: 'acc-2', company_name: 'Doctolib', is_favorite: false } as AccountListResponse['data'][number],
    ],
    pagination: { currentPage: 1, size: 25, totalItems: 2, totalPages: 1, hasNext: false, hasPrev: false },
  }
  client.setQueryData(QUERY_KEY, { pages: [page], pageParams: [0] })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useSetAccountFavorite — mise à jour optimiste, retour arrière si l’API échoue', () => {
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mockSetFavorite.mockReset()
    mockToastError.mockReset()
    seedList()
  })

  it('pose l’étoile AVANT la réponse serveur, dans le cache', async () => {
    mockSetFavorite.mockReturnValue(new Promise(() => {})) // ne résout jamais — on regarde l'optimiste seul
    const { result } = renderHook(() => useSetAccountFavorite(), { wrapper })

    act(() => {
      result.current.mutate({ id: 'acc-1', next: true })
    })

    await waitFor(() => {
      const cached = client.getQueryData<{ pages: AccountListResponse[] }>(QUERY_KEY)
      expect(cached?.pages[0]?.data.find(a => a.id === 'acc-1')?.is_favorite).toBe(true)
    })
    // La ligne voisine n'est pas touchée par le même geste.
    const cached = client.getQueryData<{ pages: AccountListResponse[] }>(QUERY_KEY)
    expect(cached?.pages[0]?.data.find(a => a.id === 'acc-2')?.is_favorite).toBe(false)
  })

  it('remet l’étoile dans son état PRÉCÉDENT quand l’API échoue', async () => {
    mockSetFavorite.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useSetAccountFavorite(), { wrapper })

    act(() => {
      result.current.mutate({ id: 'acc-1', next: true })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    const cached = client.getQueryData<{ pages: AccountListResponse[] }>(QUERY_KEY)
    expect(cached?.pages[0]?.data.find(a => a.id === 'acc-1')?.is_favorite).toBe(false)
    expect(mockToastError).toHaveBeenCalled()
  })
})
