import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionPlanItem } from '@bellum/contracts'
import { MANUAL_ACTION_WEEK_INDEX } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { planItem } from '@/features/accounts/view/account-detail/tabs/plan/planItem.fixture'
import { myPlanActionsKey } from './useMyPlanActions'
import { planItemsKey, usePlanItems } from './usePlanItems'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1' }, loading: false }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

/**
 * #2123.46 / #2123.47 — la création d'une action du plan passe par l'objet
 * CANONIQUE (`POST /plan-items`), et l'écran Actions l'apprend.
 *
 * Deux façons de rater, et ce fichier les attrape toutes les deux :
 *  - écrire ailleurs (le blob `raw_analysis.user_plan_actions`) : le corps et
 *    la route envoyés sont vérifiés ;
 *  - écrire au bon endroit sans prévenir `/actions` : la liste transversale
 *    garderait sa version d'avant jusqu'au prochain rechargement.
 */
describe('usePlanItems().create — la porte canonique du plan', () => {
  let qc: QueryClient
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
    apiFetchMock.mockReset()
  })

  it('écrit UNE ligne action_plan_items, l’ajoute au plan du compte et invalide /actions', async () => {
    const seeded = planItem({ id: 'g1', week_index: 0 })
    const created = planItem({ id: 'm1', label: 'Écrire au RSSI', week_index: MANUAL_ACTION_WEEK_INDEX })
    apiFetchMock.mockImplementation(async (call: { method?: string }) => (call.method === 'POST' ? created : [seeded]))
    qc.setQueryData(myPlanActionsKey, [])
    const { result } = renderHook(() => usePlanItems('a1'), { wrapper })
    await waitFor(() => expect(result.current.items).toHaveLength(1))

    await act(async () => {
      await result.current.create({
        label: 'Écrire au RSSI',
        reason: 'Ouvrir la porte du RSSI',
        expected_outcome: 'Une réponse du RSSI',
        owner_name: null,
      })
    })

    expect(apiFetchMock).toHaveBeenCalledWith({
      path: '/plan-items',
      method: 'POST',
      body: {
        account_id: 'a1',
        target: null,
        label: 'Écrire au RSSI',
        reason: 'Ouvrir la porte du RSSI',
        expected_outcome: 'Une réponse du RSSI',
        owner_name: null,
      },
    })
    expect(qc.getQueryData<ActionPlanItem[]>(planItemsKey('a1'))?.map(item => item.id)).toEqual(['g1', 'm1'])
    expect(qc.getQueryState(myPlanActionsKey)?.isInvalidated).toBe(true)
  })

  it('ne fabrique pas une liste d’une ligne quand le plan n’a pas encore été lu', async () => {
    const created = planItem({ id: 'm1', week_index: MANUAL_ACTION_WEEK_INDEX })
    apiFetchMock.mockImplementation((call: { method?: string }) =>
      call.method === 'POST' ? Promise.resolve(created) : new Promise(() => undefined),
    )
    const { result } = renderHook(() => usePlanItems('a1'), { wrapper })

    await act(async () => {
      await result.current.create({
        label: 'Écrire au RSSI',
        reason: 'Ouvrir la porte du RSSI',
        expected_outcome: 'Une réponse du RSSI',
        owner_name: 'Claire',
      })
    })

    // Le semis paresseux du plan généré se fait à la PREMIÈRE lecture : une
    // liste [created] posée ici le masquerait.
    expect(qc.getQueryData(planItemsKey('a1'))).toBeUndefined()
  })
})
