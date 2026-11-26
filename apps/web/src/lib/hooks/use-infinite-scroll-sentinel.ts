import { useCallback, useEffect, useRef } from 'react'

type SentinelOptions = {
  hasNextPage: boolean | undefined
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
}

/**
 * Returns a callback ref to attach to a sentinel element at the bottom
 * of an infinite list. When the sentinel enters the viewport, the hook
 * triggers `fetchNextPage` — provided `hasNextPage` is true and no
 * fetch is already in flight.
 *
 * The ref is stable across renders (empty deps): including the state
 * args in `useCallback` deps would rebuild the `IntersectionObserver`
 * on every change, which then fires synchronously for an
 * already-intersecting sentinel and chains `fetchNextPage` for every
 * page without the user scrolling at all (BellumAI prod incident:
 * /contacts hammered the API to a 429 throttle on first paint).
 *
 * The latest options are read through `stateRef` inside the observer
 * callback so the observer itself can stay mounted.
 */
export function useInfiniteScrollSentinel(options: SentinelOptions) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const stateRef = useRef(options)
  const requestInFlightRef = useRef(false)
  const wasIntersectingRef = useRef(false)

  useEffect(() => {
    stateRef.current = options
  })

  return useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    wasIntersectingRef.current = false
    if (!node) return
    observerRef.current = new IntersectionObserver(entries => {
      const isIntersecting = entries.some(entry => entry.isIntersecting)
      if (!isIntersecting) {
        wasIntersectingRef.current = false
        return
      }
      if (wasIntersectingRef.current) return
      wasIntersectingRef.current = true

      const { hasNextPage, isFetchingNextPage, fetchNextPage } = stateRef.current
      if (!hasNextPage || isFetchingNextPage || requestInFlightRef.current) return
      requestInFlightRef.current = true
      void fetchNextPage().finally(() => {
        requestInFlightRef.current = false
      })
    })
    observerRef.current.observe(node)
  }, [])
}
