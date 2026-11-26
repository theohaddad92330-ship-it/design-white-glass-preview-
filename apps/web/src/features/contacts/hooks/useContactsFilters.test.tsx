import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useSearchMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useSearch: (...args: unknown[]) => useSearchMock(...args),
}))

import { useContactsFilters } from './useContactsFilters'

beforeEach(() => {
  useSearchMock.mockReset()
})

describe('useContactsFilters', () => {
  it('builds the API filter object from URL params and trims the query', () => {
    useSearchMock.mockReturnValue({
      q: '  ada  ',
      role: 'champion',
      company: 'Acme',
      channel: 'with_email',
    })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current).toEqual({
      q: 'ada',
      role: 'champion',
      company: 'Acme',
      channel: 'with_email',
    })
  })

  /** #1800 — même quand l'URL porte encore un vieux lien avec `favorite=true`
   *  (partagé avant ce lot), le filtre ne construit plus la clé. */
  it("#1800 — ne construit plus la clé `favorite`, même si l'URL la porte encore", () => {
    useSearchMock.mockReturnValue({ favorite: true })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current).not.toHaveProperty('favorite')
  })

  it('omits the query when blank after trim', () => {
    useSearchMock.mockReturnValue({ q: '   ' })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.q).toBeUndefined()
  })

  it('defaults role to "all" when missing', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.role).toBe('all')
  })
})

/* Le RÉSEAU DORMANT (tome 1 lot 10). Le filtre a été câblé dans un module
 * `useContactsPage` que PLUS RIEN n'importait : le menu proposait l'option,
 * l'URL portait le paramètre, et la requête partait sans lui. La liste ne
 * bougeait pas d'une ligne. */
describe('useContactsFilters — réseau dormant', () => {
  it('passes the dormant threshold to the API as a number of months', () => {
    useSearchMock.mockReturnValue({ dormant: '12' })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.dormantMonths).toBe(12)
  })

  it('ignores an unreadable threshold rather than falling back on a default', () => {
    useSearchMock.mockReturnValue({ dormant: 'douze' })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.dormantMonths).toBeUndefined()
  })

  it('sends nothing when no threshold is set', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.dormantMonths).toBeUndefined()
  })
})

// #2158.61 — le filtre « Localisation » de la liste de contacts.
describe('useContactsFilters — filtre Localisation (#2158.61)', () => {
  it('passes the location filter to the API', () => {
    useSearchMock.mockReturnValue({ location: 'Lyon' })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.location).toBe('Lyon')
  })

  it('sends nothing when no location filter is set', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.location).toBeUndefined()
  })
})

// #2158.65 — le filtre « Owner » de la liste de contacts.
describe('useContactsFilters — filtre Owner (#2158.65)', () => {
  it('passes the assignedTo filter to the API', () => {
    useSearchMock.mockReturnValue({ assignedTo: 'member-1' })
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.assignedTo).toBe('member-1')
  })

  it('sends nothing when no assignedTo filter is set', () => {
    useSearchMock.mockReturnValue({})
    const { result } = renderHook(() => useContactsFilters())
    expect(result.current.assignedTo).toBeUndefined()
  })
})
