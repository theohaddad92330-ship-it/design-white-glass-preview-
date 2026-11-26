import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useInfiniteScrollSentinel } from './use-infinite-scroll-sentinel'

class IntersectionObserverMock {
  static instances: IntersectionObserverMock[] = []
  callback: IntersectionObserverCallback

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    IntersectionObserverMock.instances.push(this)
  }

  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
  takeRecords = vi.fn(() => [])

  emit(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

describe('useInfiniteScrollSentinel', () => {
  it('does not loop fetch on mount while sentinel stays visible', async () => {
    IntersectionObserverMock.instances = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)

    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useInfiniteScrollSentinel({ hasNextPage: true, isFetchingNextPage: false, fetchNextPage }),
    )

    const node = document.createElement('div')
    act(() => result.current(node))

    const observer = IntersectionObserverMock.instances[0]
    await act(async () => {
      observer.emit(true)
      observer.emit(true)
      await Promise.resolve()
    })

    expect(fetchNextPage).toHaveBeenCalledTimes(1)
  })

  it('does not call fetch while query is already fetching', () => {
    IntersectionObserverMock.instances = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)

    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useInfiniteScrollSentinel({ hasNextPage: true, isFetchingNextPage: true, fetchNextPage }),
    )

    act(() => result.current(document.createElement('div')))
    const observer = IntersectionObserverMock.instances[0]
    act(() => observer.emit(true))

    expect(fetchNextPage).not.toHaveBeenCalled()
  })

  it('stops when hasNextPage is false', () => {
    IntersectionObserverMock.instances = []
    vi.stubGlobal('IntersectionObserver', IntersectionObserverMock as unknown as typeof IntersectionObserver)

    const fetchNextPage = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useInfiniteScrollSentinel({ hasNextPage: false, isFetchingNextPage: false, fetchNextPage }),
    )

    act(() => result.current(document.createElement('div')))
    const observer = IntersectionObserverMock.instances[0]
    act(() => observer.emit(true))

    expect(fetchNextPage).not.toHaveBeenCalled()
  })
})
