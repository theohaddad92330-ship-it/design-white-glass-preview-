import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogCrmActivity } from './useLogCrmActivity'

const logActivity = vi.fn()
vi.mock('@/features/crm/api', async () => {
  const actual = await vi.importActual<typeof import('@/features/crm/api')>('@/features/crm/api')
  return {
    ...actual,
    crmApi: { ...actual.crmApi, logActivity: (...args: unknown[]) => logActivity(...args) },
  }
})

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useLogCrmActivity', () => {
  beforeEach(() => logActivity.mockReset())

  it('logs the note against the CRM id', async () => {
    logActivity.mockResolvedValueOnce({ id: 'act_1' })
    const { result } = renderHook(() => useLogCrmActivity(), { wrapper: wrapper() })

    result.current.mutate({ crmId: 'hs_42', note: 'Email envoyé depuis Bellum' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(logActivity).toHaveBeenCalledWith('hs_42', 'Email envoyé depuis Bellum')
    expect(result.current.data).toEqual({ id: 'act_1' })
  })

  it('surfaces the error state on failure', async () => {
    logActivity.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useLogCrmActivity(), { wrapper: wrapper() })

    result.current.mutate({ crmId: 'hs_42', note: 'x' })

    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
