import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { planItem } from '@/features/accounts/view/account-detail/tabs/plan/planItem.fixture'
import { planItemsKey, usePlanItems } from './usePlanItems'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * #2395.1 (épopée #2871) — la lecture ne sème plus : une étape jamais actée
 * arrive avec un id par POSITION (`plan:<compte>:<semaine>:<étape>`). Le premier
 * geste la matérialise côté serveur ; la ligne rendue porte alors un vrai id, et
 * le cache doit REMPLACER l'étape virtuelle (même position), jamais l'ajouter en
 * double ni la laisser en l'état.
 */
describe('usePlanItems — écriture d’une étape virtuelle (#2395.1)', () => {
  let qc: QueryClient
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    apiFetchMock.mockReset()
  })

  it('le cache remplace l’étape virtuelle par la ligne matérialisée', async () => {
    const virtual = planItem({ id: 'plan:a1:0:0', week_index: 0, step_index: 0, done: false })
    const written = planItem({ id: 'real-1', week_index: 0, step_index: 0, done: true })
    apiFetchMock.mockImplementation(async (call: { method?: string }) =>
      call.method === 'PATCH' ? written : [virtual],
    )
    const { result } = renderHook(() => usePlanItems('a1'), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    act(() => result.current.setDone('plan:a1:0:0', true))

    await waitFor(() =>
      expect(qc.getQueryData<ActionPlanItem[]>(planItemsKey('a1'))?.map(item => item.id)).toEqual(['real-1']),
    )
    expect(apiFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/plan-items/plan:a1:0:0', method: 'PATCH' }),
    )
  })
})
