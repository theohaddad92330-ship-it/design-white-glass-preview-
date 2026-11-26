import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useRegenerateProfileContextSection } from './useRegenerateProfileContextSection'

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #2908 (#2010.16 / #2011.10) — « Régénérer cette section ». Attendue en
// entier : pas de statut `generating` à suivre, la réponse remplace
// directement le cache.
describe('useRegenerateProfileContextSection', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('POSTs the section, and caches the returned snapshot', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: { coachingInsights: { mainWeakness: 'Nouvelle fragilité' } },
      status: 'succeeded',
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      corrections: {},
    })

    const { result } = renderHook(() => useRegenerateProfileContextSection(), { wrapper: wrapper() })
    result.current.mutate('coachingInsights')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/esn-profile/regenerate-context-section',
      method: 'POST',
      body: { section: 'coachingInsights' },
    })
  })

  it('surfaces the error state on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useRegenerateProfileContextSection(), { wrapper: wrapper() })
    result.current.mutate('welcomeSummary')
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
