import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const trackSearchPerformed = vi.hoisted(() => vi.fn())
vi.mock('@/lib/product-tracker', () => ({ trackSearchPerformed }))

import { useTrackSearchPerformed } from './useTrackSearchPerformed'

// #2154.30 — `search_performed` : un écran, un nombre de résultats, jamais le texte tapé.
describe('useTrackSearchPerformed', () => {
  beforeEach(() => trackSearchPerformed.mockClear())

  it('émet UNE fois, quand la recherche résout, avec le total et l’écran — jamais la requête', () => {
    const { rerender } = renderHook(
      ({ total, isLoading }) => useTrackSearchPerformed('/accounts', 'acme', total, isLoading),
      { initialProps: { total: undefined as number | undefined, isLoading: true } },
    )
    expect(trackSearchPerformed).not.toHaveBeenCalled()
    rerender({ total: 3, isLoading: false })
    rerender({ total: 3, isLoading: false })
    expect(trackSearchPerformed).toHaveBeenCalledTimes(1)
    expect(trackSearchPerformed).toHaveBeenCalledWith('/accounts', 3)
  })

  it('un total inconnu (échec réseau) n’émet pas : non mesuré n’est jamais 0', () => {
    renderHook(() => useTrackSearchPerformed('/accounts', 'acme', undefined, false))
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })

  it('⚠️ SAIT DIRE NON — sans texte tapé, parcourir la liste n’est pas une recherche', () => {
    renderHook(() => useTrackSearchPerformed('/accounts', '   ', 12, false))
    expect(trackSearchPerformed).not.toHaveBeenCalled()
  })

  it('un zéro résultat réel est mesuré (c’est ce qui rend « recherche vide » exploitable)', () => {
    renderHook(() => useTrackSearchPerformed('/consultants', 'rust', 0, false))
    expect(trackSearchPerformed).toHaveBeenCalledWith('/consultants', 0)
  })

  it('une nouvelle requête émet de nouveau', () => {
    const { rerender } = renderHook(({ q }) => useTrackSearchPerformed('/projects', q, 2, false), {
      initialProps: { q: 'a' },
    })
    rerender({ q: 'ab' })
    expect(trackSearchPerformed).toHaveBeenCalledTimes(2)
  })
})
