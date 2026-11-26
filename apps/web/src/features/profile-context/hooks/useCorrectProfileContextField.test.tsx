import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { useCorrectProfileContextField } from './useCorrectProfileContextField'

const apiFetchMock = vi.mocked(apiFetch)

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

// #2908 (#2010.4) — « Corriger ce champ ». Le clic EST la décision (geste
// utilisateur = auto-approuvé) : la mutation part sans confirmation.
describe('useCorrectProfileContextField', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('POSTs the field and value, and caches the returned snapshot', async () => {
    apiFetchMock.mockResolvedValueOnce({
      profile_context: { welcomeSummary: { profileRecap: 'Corrigé' } },
      status: 'succeeded',
      validatedAt: null,
      withheld: null,
      chosenEntryStrategy: null,
      auditMoveDecisions: {},
      corrections: { 'welcomeSummary.profileRecap': { value: 'Corrigé', correctedAt: '2026-09-26T20:00:00.000Z' } },
    })

    const { result } = renderHook(() => useCorrectProfileContextField(), { wrapper: wrapper() })
    result.current.mutate({ field: 'welcomeSummary.profileRecap', value: 'Corrigé' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/profile-context/corrections',
      method: 'POST',
      body: { field: 'welcomeSummary.profileRecap', value: 'Corrigé' },
    })
  })

  it('surfaces the error state on failure', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useCorrectProfileContextField(), { wrapper: wrapper() })
    result.current.mutate({ field: 'welcomeSummary.profileRecap', value: 'x' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
