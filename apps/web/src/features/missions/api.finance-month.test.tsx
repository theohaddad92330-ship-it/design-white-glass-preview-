import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

/*
 * perf P6 (29/09/2026) — une lecture financière « sans mois » et la même lecture
 * « du mois par défaut du serveur » partagent UNE clé, donc UN appel. Le serveur
 * lit le mois PRÉCÉDENT (revenue, margin, margin-by-channel) sauf `capacity`,
 * qui lit le mois COURANT.
 */
const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (args: unknown) => apiFetch(args) }))

const { serverDefaultMonth, serverDefaultCapacityMonth, useRevenue, useCapacity, useMarginByChannel } =
  await import('./api')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

describe('mois par défaut du serveur', () => {
  it('le précédent en UTC, y compris au passage d’année', () => {
    expect(serverDefaultMonth(new Date('2026-01-15T10:00:00Z'))).toBe('2025-12')
    expect(serverDefaultMonth(new Date('2026-09-29T10:00:00Z'))).toBe('2026-08')
  })
  it('capacity : le courant', () => {
    expect(serverDefaultCapacityMonth(new Date('2026-09-29T10:00:00Z'))).toBe('2026-09')
  })
})

describe('lectures financières — une clé pour « sans mois » et « mois par défaut »', () => {
  it.each([
    ['useRevenue', useRevenue, serverDefaultMonth],
    ['useMarginByChannel', useMarginByChannel, serverDefaultMonth],
    ['useCapacity', useCapacity, serverDefaultCapacityMonth],
  ] as const)('%s ne part qu’une fois', async (_name, hook, defaultMonth) => {
    apiFetch.mockResolvedValue({})
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const a = renderHook(() => hook(), { wrapper: wrapper(client) })
    const b = renderHook(() => hook(defaultMonth()), { wrapper: wrapper(client) })
    await waitFor(() => expect(a.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(b.result.current.isSuccess).toBe(true))
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
