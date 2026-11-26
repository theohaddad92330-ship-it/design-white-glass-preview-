import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #2125.42 — « ne relire que l'organisation ».
 *
 * Ce que cette suite garde, et qui ne se voit pas à l'œil :
 *  · les DEUX axes partent, et dans l'ORDRE — l'organigramme avant les gens,
 *    sinon on rattache les bonnes personnes aux mauvaises entités ;
 *  · un échec du premier axe n'envoie PAS le second : on ne paie pas un second
 *    crédit pour enrichir des contacts sur un organigramme qu'on n'a pas pu
 *    relire.
 */

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

import { useRefreshOrganisation } from './useRefreshOrganisation'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

const dimensionsSent = (): unknown[] =>
  apiFetch.mock.calls.map(call => (call[0] as { body?: { dimension?: unknown } }).body?.dimension)

beforeEach(() => {
  apiFetch.mockReset().mockResolvedValue({ dimension: 'entities', remaining: 3 })
})

describe('useRefreshOrganisation', () => {
  it('rejoue l’organigramme PUIS les contacts', async () => {
    const { result } = renderHook(() => useRefreshOrganisation('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(dimensionsSent()).toEqual(['entities', 'contacts'])
  })

  it('n’envoie pas le second axe quand le premier échoue', async () => {
    apiFetch.mockReset().mockRejectedValue(new Error('IA down'))
    const { result } = renderHook(() => useRefreshOrganisation('acc-1'), { wrapper: wrapper() })

    await act(async () => {
      result.current.mutate()
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(dimensionsSent()).toEqual(['entities'])
  })
})
