import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyUnifiedFilters } from '@/features/discover/lib/discover-filters'

const mutate = vi.fn()
vi.mock('./useTeamResearch', () => ({ useRecordTeamResearch: () => ({ mutate }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}))

import { useRecordDiscoverResearch } from './useRecordDiscoverResearch'

// Théo D team-recherches.N1 — Découvrir garde chaque recherche menée à ses résultats pour l'équipe.
describe('useRecordDiscoverResearch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ne poste rien tant que les résultats ne sont pas là', () => {
    renderHook(() => useRecordDiscoverResearch({ ...emptyUnifiedFilters(), city: 'Lyon' }, null))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('un rail sans critère n’est pas une recherche', () => {
    renderHook(() => useRecordDiscoverResearch(emptyUnifiedFilters(), 12))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('poste le périmètre et le nombre de comptes, une seule fois pour le même résultat', () => {
    const filters = { ...emptyUnifiedFilters(), city: 'Lyon' }
    const { rerender } = renderHook(() => useRecordDiscoverResearch(filters, 8))
    rerender()
    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ result_count: 8, filters: expect.objectContaining({ city: 'Lyon' }) }),
    )
  })

  it('un résultat à zéro compte est un vrai zéro mesuré, posté tel quel', () => {
    renderHook(() => useRecordDiscoverResearch({ ...emptyUnifiedFilters(), city: 'Lyon' }, 0))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ result_count: 0 }))
  })
})
