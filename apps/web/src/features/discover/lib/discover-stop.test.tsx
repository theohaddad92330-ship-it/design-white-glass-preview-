import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const { registry } = vi.hoisted(() => ({ registry: vi.fn() }))
vi.mock('@/features/discover/api/discover-api', () => ({ discoverApi: { registry, signals: vi.fn() } }))

const { useDiscoverSearch } = await import('@/features/discover/hooks/useDiscoverSearch')
const { stopDiscoverSearch, forgetStoppedSearch } = await import('./discover-stop')

const request = { mode: 'registry', query: { filters: { department: '75' }, limit: 20 } } as const
const FULL = { candidates: [{ siren: '1' }], query: {}, degraded: [] }

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

/** Un appel qui ne finit jamais, sauf par l'annulation du signal. */
function hangingUntilAborted() {
  let signalSeen: AbortSignal | undefined
  registry.mockImplementation(
    (_query: unknown, signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signalSeen = signal
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      }),
  )
  return () => signalSeen
}

beforeEach(() => {
  registry.mockReset()
})

describe('#4490.2 — Arrêter une recherche en cours', () => {
  it('coupe la requête via l’AbortSignal et rend la main tout de suite', async () => {
    const signal = hangingUntilAborted()
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useDiscoverSearch(request), { wrapper })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await act(async () => {
      await stopDiscoverSearch(client, request)
    })
    expect(signal()?.aborted).toBe(true)
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(registry).toHaveBeenCalledTimes(1)
  })

  it('garde le premier lot déjà reçu (partial) après l’arrêt', async () => {
    const calls: Array<{ limit: number; signal?: AbortSignal }> = []
    registry.mockImplementation((query: { limit: number }, signal?: AbortSignal) => {
      calls.push({ limit: query.limit, signal })
      if (query.limit === 5) return Promise.resolve(FULL)
      return new Promise((_r, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))))
    })
    const { client, wrapper } = setup()
    const { result } = renderHook(() => useDiscoverSearch(request, { firstLot: 5 }), { wrapper })
    await waitFor(() => expect(registry).toHaveBeenCalledTimes(2))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.data).toBeUndefined() // #4517 — le premier lot est tenu en réserve, pas affiché
    expect(result.current.isFetching).toBe(true) // la liste complète est encore attendue
    await act(async () => {
      await stopDiscoverSearch(client, request)
    })
    await waitFor(() => expect(result.current.isFetching).toBe(false))
    expect(result.current.data?.partial).toBe(true)
    expect(result.current.data?.candidates).toHaveLength(1)
  })

  it('relancer la même recherche après l’arrêt rappelle les sources (un seul appel de plus)', async () => {
    hangingUntilAborted()
    const { client, wrapper } = setup()
    const { result, rerender } = renderHook(({ r }) => useDiscoverSearch(r), { wrapper, initialProps: { r: request } })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    await act(async () => {
      await stopDiscoverSearch(client, request)
    })
    registry.mockReset()
    registry.mockResolvedValue(FULL)
    act(() => forgetStoppedSearch(client, request))
    rerender({ r: { ...request } })
    await waitFor(() => expect(result.current.data?.candidates).toHaveLength(1))
    expect(registry).toHaveBeenCalledTimes(1)
  })
})
