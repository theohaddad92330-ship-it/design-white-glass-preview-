import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSearchMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
}))

import { useContactsSearchState } from './useContactsSearchState'

beforeEach(() => {
  useSearchMock.mockReset()
})

describe('useContactsSearchState', () => {
  it('applies defaults for missing URL params', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current).toEqual({
      query: '',
      roleFilter: 'all',
      companyFilter: undefined,
      channelFilter: undefined,
    })
  })

  it('passes URL params through unchanged', () => {
    useSearchMock.mockReturnValue({
      q: 'ada',
      role: 'sponsor',
      company: 'Acme',
      channel: 'with_linkedin',
    })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current).toEqual({
      query: 'ada',
      roleFilter: 'sponsor',
      companyFilter: 'Acme',
      channelFilter: 'with_linkedin',
    })
  })

  /** #1800 — un vieux lien partagé avant ce lot peut encore porter
   *  `?favorite=true` : le state n'expose plus cette clé. */
  it('#1800 — ignore `favorite` même si l’URL le porte encore', () => {
    useSearchMock.mockReturnValue({ favorite: true })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current).not.toHaveProperty('favoriteFilter')
  })
})

describe('useContactsSearchState — réseau dormant', () => {
  it('reads the dormant threshold from the URL', () => {
    useSearchMock.mockReturnValue({ dormant: '6' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.dormantFilter).toBe('6')
  })
})

// #2158.61 — le filtre « Localisation » de la liste de contacts.
describe('useContactsSearchState — filtre Localisation (#2158.61)', () => {
  it('reads the location filter from the URL', () => {
    useSearchMock.mockReturnValue({ location: 'Lyon' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.locationFilter).toBe('Lyon')
  })

  it('défaut à `undefined` — pas de filtre plutôt qu’une chaîne vide', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.locationFilter).toBeUndefined()
  })
})

// #2158.65 — le filtre « Owner » de la liste de contacts.
describe('useContactsSearchState — filtre Owner (#2158.65)', () => {
  it('reads the assignedTo filter from the URL', () => {
    useSearchMock.mockReturnValue({ assignedTo: 'member-1' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.assignedToFilter).toBe('member-1')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.assignedToFilter).toBeUndefined()
  })
})

// #2158.60 — le filtre « Famille métier » de la liste de contacts.
describe('useContactsSearchState — filtre Famille métier (#2158.60)', () => {
  it('reads the family filter from the URL', () => {
    useSearchMock.mockReturnValue({ family: 'IT' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.familyFilter).toBe('IT')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.familyFilter).toBeUndefined()
  })
})

// #2158.57 — le filtre « Entité » de la liste de contacts.
describe('useContactsSearchState — filtre Entité (#2158.57)', () => {
  it('reads the entity filter from the URL', () => {
    useSearchMock.mockReturnValue({ entity: 'DSI' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.entityFilter).toBe('DSI')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.entityFilter).toBeUndefined()
  })
})

// #2158.58 — le filtre « Fonction » de la liste de contacts.
describe('useContactsSearchState — filtre Fonction (#2158.58)', () => {
  it('reads the title filter from the URL', () => {
    useSearchMock.mockReturnValue({ title: 'DSI' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.titleFilter).toBe('DSI')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.titleFilter).toBeUndefined()
  })
})

// #2158.67 — le filtre « Fraîcheur » de la liste de contacts.
describe('useContactsSearchState — filtre Fraîcheur (#2158.67)', () => {
  it('reads the updatedWithin filter from the URL', () => {
    useSearchMock.mockReturnValue({ updatedWithin: '6' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.updatedWithinFilter).toBe('6')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.updatedWithinFilter).toBeUndefined()
  })
})

// #2158.68 — le filtre « Cible » de la liste de contacts.
describe('useContactsSearchState — filtre Cible (#2158.68)', () => {
  it('reads the targetListId filter from the URL', () => {
    useSearchMock.mockReturnValue({ targetListId: '11111111-1111-1111-1111-111111111111' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.targetListIdFilter).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.targetListIdFilter).toBeUndefined()
  })
})

// #2158.66 — le filtre « Source » de la liste de contacts.
describe('useContactsSearchState — filtre Source (#2158.66)', () => {
  it('reads the source filter from the URL', () => {
    useSearchMock.mockReturnValue({ source: 'apollo' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.sourceFilter).toBe('apollo')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.sourceFilter).toBeUndefined()
  })
})

// #2158.14 (#2997) — le filtre « Sans prochaine action ».
describe('useContactsSearchState — filtre Sans prochaine action (#2158.14)', () => {
  it('reads the withoutNextAction filter from the URL', () => {
    useSearchMock.mockReturnValue({ withoutNextAction: true })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.withoutNextActionFilter).toBe(true)
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.withoutNextActionFilter).toBeUndefined()
  })
})

// #2158.69 (#2997) — le filtre « Dernière action » (nature).
describe('useContactsSearchState — filtre Dernière action (#2158.69)', () => {
  it('reads the lastActivityKind filter from the URL', () => {
    useSearchMock.mockReturnValue({ lastActivityKind: 'call' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.lastActivityKindFilter).toBe('call')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.lastActivityKindFilter).toBeUndefined()
  })
})

// #3718 — le filtre statut « Répondu » (recette démo 10/10 : aucun filtre ne l'offrait).
describe('useContactsSearchState — filtre statut (#3718)', () => {
  it('reads the userStatus filter from the URL', () => {
    useSearchMock.mockReturnValue({ userStatus: 'replied' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.userStatusFilter).toBe('replied')
  })

  it('défaut à `undefined`', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.userStatusFilter).toBeUndefined()
  })
})

// #2158.6 — la vue sélectionnée (`ContactsViewChips`) devient bookmarkable :
// jusqu'ici `ContactContent` la gardait en `useState` local, un lien direct
// vers « à contacter » n'avait donc rien à cibler.
describe('useContactsSearchState — vue sélectionnée (#2158.6)', () => {
  it('reads the view filter from the URL', () => {
    useSearchMock.mockReturnValue({ view: 'known' })
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.viewFilter).toBe('known')
  })

  it('défaut à `undefined` — pas de préférence explicite dans l’URL', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsSearchState())
    expect(result.current.viewFilter).toBeUndefined()
  })
})
