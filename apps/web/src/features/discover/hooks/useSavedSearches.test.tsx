import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const markRunMutate = vi.fn()
const createViewMutate = vi.fn()
const removeViewMutate = vi.fn()

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/plan-features/usePlanFeature', () => ({
  usePlanFeature: () => ({ known: true, allowed: true }),
}))
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({ data: [], isLoading: false, isError: false }),
  useCreateSavedView: () => ({ mutate: createViewMutate }),
  useRemoveSavedView: () => ({ mutate: removeViewMutate }),
  useMarkSavedViewRun: () => ({ mutate: markRunMutate }),
}))

import { useSavedSearches } from './useSavedSearches'

/**
 * #3873 — « Rejouer » EST une exécution : la carte restait « Jamais rejouée »
 * indéfiniment en prod (recette 09/10) parce que rien n'appelait le serveur
 * au clic. Ce test sait dire NON : sans le câblage, `markRun` ne relaie rien.
 */
describe('useSavedSearches — #3873 marquer une vue comme rejouée', () => {
  it('relaie markRun(id) vers la mutation `useMarkSavedViewRun`', () => {
    const { result } = renderHook(() => useSavedSearches())
    result.current.markRun('s1')
    expect(markRunMutate).toHaveBeenCalledWith({ id: 's1' })
  })

  it('ne confond pas markRun avec remove ou save', () => {
    const { result } = renderHook(() => useSavedSearches())
    result.current.markRun('s2')
    expect(removeViewMutate).not.toHaveBeenCalled()
    expect(createViewMutate).not.toHaveBeenCalled()
  })
})
