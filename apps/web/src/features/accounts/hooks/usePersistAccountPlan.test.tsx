import type { ReactNode } from 'react'
import type { ActionPlanItem } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { planItemsKey } from '@/features/actions/hooks/usePlanItems'
import { planItem } from '@/features/accounts/view/account-detail/tabs/plan/planItem.fixture'

const apiFetch = vi.fn()
const toastSuccess = vi.fn()
const toastInfo = vi.fn()
const toastError = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    info: (...a: unknown[]) => toastInfo(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { usePersistAccountPlan } from './usePersistAccountPlan'

const ACCOUNT_ID = '22222222-0000-4000-8000-000000000001'

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => usePersistAccountPlan(ACCOUNT_ID), { wrapper })
  return { qc, hook }
}

beforeEach(() => {
  apiFetch.mockReset()
  toastSuccess.mockReset()
  toastInfo.mockReset()
  toastError.mockReset()
})

/**
 * #2123.46 — la veille, la fiche contact et le panneau besoin passent par ce
 * hook. Il écrivait `raw_analysis.user_plan_actions` (`POST
 * /accounts/:id/plan/actions`) ; il écrit désormais la ligne CANONIQUE que le
 * plan affiche et que `/actions` liste — une seule écriture (GA-26).
 */
describe('#2123.46 — usePersistAccountPlan.addAction', () => {
  it('écrit la ligne canonique, avec le résultat attendu, sur CE compte', async () => {
    apiFetch.mockResolvedValue({ ...planItem({ id: 'new-1', account_id: ACCOUNT_ID }), added: true })
    const { hook } = setup()

    await act(async () => {
      await hook.result.current.addAction({
        label: 'Qualifier le signal',
        reason: 'Obtenir un rendez-vous',
        target: null,
        expected_outcome: 'Obtenir un rendez-vous',
      })
    })

    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/plan-items',
      method: 'POST',
      body: {
        account_id: ACCOUNT_ID,
        label: 'Qualifier le signal',
        reason: 'Obtenir un rendez-vous',
        target: null,
        expected_outcome: 'Obtenir un rendez-vous',
      },
    })
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('la ligne entre dans le cache du plan du compte — le tableau la montre sans relire', async () => {
    const created = planItem({ id: 'new-1', account_id: ACCOUNT_ID, week_index: 1000 })
    apiFetch.mockResolvedValue({ ...created, added: true })
    const { qc, hook } = setup()
    qc.setQueryData<ActionPlanItem[]>(planItemsKey(ACCOUNT_ID), [planItem({ id: 'i0', account_id: ACCOUNT_ID })])

    await act(async () => {
      await hook.result.current.addAction({
        label: 'Relancer',
        reason: 'Objectif de test',
        expected_outcome: 'Résultat de test',
        target: null,
      })
    })

    const cached = qc.getQueryData<ActionPlanItem[]>(planItemsKey(ACCOUNT_ID)) ?? []
    expect(cached.map(item => item.id)).toEqual(['i0', 'new-1'])
  })

  it('DIT « déjà au plan » quand le serveur n’a rien écrit — jamais un faux succès, jamais une ligne en double', async () => {
    const existing = planItem({ id: 'i-déjà', account_id: ACCOUNT_ID, week_index: 1000 })
    apiFetch.mockResolvedValue({ ...existing, added: false })
    const { qc, hook } = setup()
    qc.setQueryData<ActionPlanItem[]>(planItemsKey(ACCOUNT_ID), [existing])

    await act(async () => {
      await hook.result.current.addAction({
        label: 'Relancer',
        reason: 'Objectif de test',
        expected_outcome: 'Résultat de test',
        target: null,
      })
    })

    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastInfo).toHaveBeenCalledWith('Cette action est déjà au plan.')
    expect(qc.getQueryData<ActionPlanItem[]>(planItemsKey(ACCOUNT_ID))).toHaveLength(1)
  })

  it('annonce l’échec, sans rien écrire en cache', async () => {
    apiFetch.mockRejectedValue(new Error('down'))
    const { qc, hook } = setup()

    await act(async () => {
      await hook.result.current
        .addAction({
          label: 'Relancer',
          reason: 'Objectif de test',
          expected_outcome: 'Résultat de test',
          target: null,
        })
        .catch(() => undefined)
    })

    expect(toastError).toHaveBeenCalledTimes(1)
    expect(qc.getQueryData(planItemsKey(ACCOUNT_ID))).toBeUndefined()
  })
})
