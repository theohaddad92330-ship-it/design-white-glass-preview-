import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const useContactsMock = vi.fn()

vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: (...args: unknown[]) => useContactsMock(...args),
}))

import { useContactsTotal } from './useContactsTotal'

beforeEach(() => {
  useContactsMock.mockReset()
})

describe('useContactsTotal', () => {
  it('returns 0 when there is no data yet', () => {
    useContactsMock.mockReturnValue({ data: undefined })
    const { result } = renderHook(() => useContactsTotal({}))
    expect(result.current).toBe(0)
  })

  it('returns the pagination total of the first page', () => {
    useContactsMock.mockReturnValue({
      data: {
        pages: [
          {
            data: [],
            pagination: { totalItems: 42, currentPage: 1, size: 25, totalPages: 2, hasNext: true, hasPrev: false },
          },
        ],
      },
    })
    const { result } = renderHook(() => useContactsTotal({}))
    expect(result.current).toBe(42)
  })

  it('returns the real total (no implicit cap) even for large counts', () => {
    useContactsMock.mockReturnValue({
      data: {
        pages: [
          {
            data: [],
            pagination: {
              totalItems: 12_345,
              currentPage: 1,
              size: 25,
              totalPages: 494,
              hasNext: true,
              hasPrev: false,
            },
          },
        ],
      },
    })
    const { result } = renderHook(() => useContactsTotal({}))
    expect(result.current).toBe(12_345)
  })
})
