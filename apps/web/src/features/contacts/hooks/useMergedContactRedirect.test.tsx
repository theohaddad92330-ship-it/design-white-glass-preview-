import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'

const useNavigateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: (...args: unknown[]) => useNavigateMock(...args),
}))

import { useMergedContactRedirect } from './useMergedContactRedirect'

const navigate = vi.fn()

const contact = (over: Partial<Contact>): Contact => ({ id: 'new-id', ...over }) as Contact

beforeEach(() => {
  navigate.mockReset()
  useNavigateMock.mockReturnValue(navigate)
})

describe('useMergedContactRedirect', () => {
  it('rewrites the URL to the survivor when the requested id was merged away', () => {
    renderHook(() => useMergedContactRedirect(contact({ id: 'new-id', merged_from: 'old-id' }), 'old-id'))

    expect(navigate).toHaveBeenCalledWith({
      to: '/contacts/$id',
      params: { id: 'new-id' },
      // The dead id must not stay in the history stack.
      replace: true,
    })
  })

  it('does nothing for a contact reached by its own id', () => {
    renderHook(() => useMergedContactRedirect(contact({ id: 'c1' }), 'c1'))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does nothing while the contact is still loading', () => {
    renderHook(() => useMergedContactRedirect(undefined, 'old-id'))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not loop once the URL already shows the survivor', () => {
    // After the redirect the page re-renders with requestedId === survivor.
    const { rerender } = renderHook(({ id }) => useMergedContactRedirect(contact({ id: 'new-id' }), id), {
      initialProps: { id: 'new-id' },
    })
    rerender({ id: 'new-id' })
    expect(navigate).not.toHaveBeenCalled()
  })
})
