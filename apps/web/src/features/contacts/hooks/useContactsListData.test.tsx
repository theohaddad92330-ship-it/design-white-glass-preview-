import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useContactsMock = vi.fn()

vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: (...args: unknown[]) => useContactsMock(...args),
}))

import { useContactsListData } from './useContactsListData'

beforeEach(() => {
  useContactsMock.mockReset()
})

describe('useContactsListData', () => {
  it('returns empty list and undefined total (not measured yet) while loading', () => {
    useContactsMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    })
    const { result } = renderHook(() => useContactsListData({}))
    expect(result.current.contacts).toEqual([])
    expect(result.current.totalContacts).toBeUndefined()
    expect(result.current.isLoading).toBe(true)
  })

  // #2091 — un échec réseau rendait `totalContacts` à 0 (`?? 0`), et
  // `ContactsLifecycleFilter` — pourtant DÉJÀ conçu pour accepter `undefined`
  // et n'afficher aucun compteur — recevait 0 et affichait « Tous 0 » comme
  // si l'espace n'avait aucun contact. `isError` propage désormais `undefined`,
  // jamais un total mesuré.
  it('propage undefined sur isError, jamais 0 (#2091)', () => {
    useContactsMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    })
    const { result } = renderHook(() => useContactsListData({}))
    expect(result.current.totalContacts).toBeUndefined()
    expect(result.current.isError).toBe(true)
  })

  it('flattens pages and deduplicates by id — later pages overwrite earlier duplicates', () => {
    useContactsMock.mockReturnValue({
      data: {
        pages: [
          {
            data: [
              { id: '1', full_name: 'Ada' },
              { id: '2', full_name: 'Grace' },
            ],
            pagination: { totalItems: 5, currentPage: 1, size: 25, totalPages: 1, hasNext: false, hasPrev: false },
          },
          {
            data: [
              { id: '2', full_name: 'Grace (refreshed)' },
              { id: '3', full_name: 'Linus' },
            ],
            pagination: { totalItems: 5, currentPage: 2, size: 25, totalPages: 1, hasNext: false, hasPrev: true },
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
    })
    const { result } = renderHook(() => useContactsListData({}))
    expect(result.current.contacts.map(c => c.id)).toEqual(['1', '2', '3'])
    expect(result.current.contacts.find(c => c.id === '2')?.full_name).toBe('Grace (refreshed)')
    expect(result.current.totalContacts).toBe(5)
  })

  it('forwards pagination flags', () => {
    const fetchNextPage = vi.fn()
    useContactsMock.mockReturnValue({
      data: {
        pages: [
          {
            data: [],
            pagination: { totalItems: 100, currentPage: 1, size: 25, totalPages: 4, hasNext: true, hasPrev: false },
          },
        ],
      },
      isLoading: false,
      isError: false,
      isFetchingNextPage: true,
      hasNextPage: true,
      fetchNextPage,
    })
    const { result } = renderHook(() => useContactsListData({}))
    expect(result.current.hasNextPage).toBe(true)
    expect(result.current.isFetchingNextPage).toBe(true)
    expect(result.current.fetchNextPage).toBe(fetchNextPage)
  })
})
