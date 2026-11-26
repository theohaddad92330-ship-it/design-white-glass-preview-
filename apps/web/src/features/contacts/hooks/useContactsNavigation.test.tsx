import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useNavigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: (...args: unknown[]) => useNavigateMock(...args),
}))

// #1687 — un espion, pas le module réel : ce fichier vérifie ce que
// `onAddFilter` ÉMET, exactement.
const trackFilterApplied = vi.fn()
vi.mock('@/lib/product-tracker', () => ({
  trackFilterApplied: (...args: unknown[]) => trackFilterApplied(...args),
}))

import { useContactsNavigation } from './useContactsNavigation'

const navigate = vi.fn()

beforeEach(() => {
  navigate.mockReset()
  trackFilterApplied.mockClear()
  useNavigateMock.mockReturnValue(navigate)
})

describe('useContactsNavigation', () => {
  it('writes a non-blank query into search and replaces history', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onQueryChange('  hello  ')
    const call = navigate.mock.calls[0][0]
    expect(call.replace).toBe(true)
    expect(call.search({ q: 'old' })).toEqual({ q: '  hello  ' })
  })

  it('clears the query when the input is blank after trim', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onQueryChange('   ')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'old' })).toEqual({ q: undefined })
  })

  it('normalises filter bar updates and treats role="all" as cleared', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onFiltersChange([
      { id: 'role', value: 'all' },
      { id: 'company', value: 'Acme' },
    ])
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'kept', role: 'sponsor', company: 'old', channel: 'with_email' })).toEqual({
      q: 'kept',
      role: undefined,
      company: 'Acme',
      channel: undefined,
    })
  })

  it('addFilter merges into the existing search', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onAddFilter('company', 'Acme')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x' })).toEqual({ q: 'x', company: 'Acme' })
  })

  /**
   * #1687 — `onAddFilter` émet `trackFilterApplied("/contacts", filterId)` —
   * le NOM du filtre, jamais sa valeur (« Acme » désigne une société ciblée).
   */
  it('#1687 — addFilter émet trackFilterApplied("/contacts", filterId), jamais la valeur', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onAddFilter('company', 'Acme')
    expect(trackFilterApplied).toHaveBeenCalledTimes(1)
    expect(trackFilterApplied).toHaveBeenCalledWith('/contacts', 'company')
    expect(trackFilterApplied.mock.calls[0]).not.toContain('Acme')
  })

  /**
   * #1800 — TÉMOIN : la capacité VOISINE (l'onglet « À qualifier », #1473)
   * n'est pas de la même famille que les favoris et n'a pas été touchée par ce
   * lot. Elle continue de fonctionner exactement comme avant.
   */
  it('unassigned scope writes its flag', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onScopeChange('unassigned')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x', company: 'Acme' })).toEqual({
      q: 'x',
      company: 'Acme',
      unassigned: true,
    })
  })

  it('all scope clears the unassigned flag', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onScopeChange('all')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x', company: 'Acme', unassigned: true })).toEqual({
      q: 'x',
      company: 'Acme',
      unassigned: undefined,
    })
  })

  it('clearFilters wipes role/company/channel/unassigned but preserves the query', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onClearFilters()
    const call = navigate.mock.calls[0][0]
    expect(
      call.search({
        q: 'kept',
        role: 'sponsor',
        company: 'Acme',
        channel: 'with_email',
        unassigned: true,
      }),
    ).toEqual({
      q: 'kept',
      role: undefined,
      company: undefined,
      channel: undefined,
      // #1473 — « Effacer les filtres » ramène aussi la portée à « Toutes ».
      unassigned: undefined,
      dormant: undefined,
      state: undefined,
    })
  })

  /**
   * #1800 — « tu peux supprimer la notion de favori » (Louis). Un vieux lien
   * partagé avant ce lot peut encore porter `?favorite=true` dans l'URL : la
   * portée n'existe plus, donc `onScopeChange` ne l'écrit plus jamais, quelle
   * que soit la portée demandée.
   */
  it("#1800 — n'écrit plus jamais la clé `favorite`, pour aucune portée", () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onScopeChange('unassigned')
    expect(navigate.mock.calls[0][0].search({})).not.toHaveProperty('favorite')

    navigate.mockClear()
    result.current.onScopeChange('all')
    expect(navigate.mock.calls[0][0].search({})).not.toHaveProperty('favorite')
  })
})

/**
 * #2158.6 — la vue sélectionnée devient bookmarkable. `to_contact` est le
 * DÉFAUT (#2158.72) : elle ne s'écrit donc jamais dans l'URL, exactement comme
 * `role=all` plus haut — un lien partagé ne doit pas porter une valeur qu'il
 * n'a pas choisie.
 */
describe('useContactsNavigation — vue sélectionnée (#2158.6)', () => {
  it('writes a non-default view into search', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onViewChange('known')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x' })).toEqual({ q: 'x', view: 'known' })
  })

  // #3527 (Louis 01/10) — « Toutes » est le défaut de l'état de travail.
  it('treats "all" as the default and omits it from the URL', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onViewChange('all')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x', view: 'known' })).toEqual({ q: 'x', view: undefined })
  })

  it('writes "to_contact" explicitly — it is no longer the default', () => {
    const { result } = renderHook(() => useContactsNavigation())
    result.current.onViewChange('to_contact')
    const call = navigate.mock.calls[0][0]
    expect(call.search({ q: 'x' })).toEqual({ q: 'x', view: 'to_contact' })
  })
})
