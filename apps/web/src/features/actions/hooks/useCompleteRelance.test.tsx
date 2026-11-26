import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actionOsKeys } from '@/features/action-os/api'
import { useCompleteRelance } from './useCompleteRelance'

const update = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'p1' }))
vi.mock('../planItems.api', () => ({ planItemsApi: { update } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

describe('#5023 — « fait » sur /actions prévient aussi la fiche compte', () => {
  let qc: QueryClient
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  it('invalide la clé des actions (celle que lit la fiche compte), le plan et le cockpit', async () => {
    const spy = vi.spyOn(qc, 'invalidateQueries')
    const { result } = renderHook(() => useCompleteRelance(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ id: 'p1', outcome: 'other' })
    })
    const keys = spy.mock.calls.map(call => JSON.stringify(call[0]?.queryKey))
    expect(keys).toContain(JSON.stringify(actionOsKeys.actions))
    expect(keys).toContain(JSON.stringify(['plan-items']))
    expect(keys).toContain(JSON.stringify(['dashboard']))
  })
})
