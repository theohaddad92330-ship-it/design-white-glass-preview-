import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscoverResponse } from '@/features/discover/lib/discover-types'
import { JOBS_RETRY_MAX, useJobsPendingRetry } from './useJobsPendingRetry'

const response = (jobsPending: boolean): DiscoverResponse => ({
  candidates: [],
  query: {},
  degraded: [],
  coverage: null,
  ...(jobsPending ? { jobsPending: true } : {}),
})

describe('useJobsPendingRetry', () => {
  it("#4677.2 — le bandeau s'éteint quand aucune carte n'attend plus ses offres, même si le drapeau reste posé", () => {
    const refetch = vi.fn()
    const done = {
      ...response(true),
      candidates: [{ siren: '1', signalsState: 'none', signalsSearched: true }],
    } as unknown as DiscoverResponse
    const waiting = {
      ...response(true),
      candidates: [{ siren: '1', signalsState: 'pending' }],
    } as unknown as DiscoverResponse
    expect(
      renderHook(() => useJobsPendingRetry({ data: waiting, isFetching: false, refetch }, 'q')).result.current,
    ).toBe(true)
    expect(renderHook(() => useJobsPendingRetry({ data: done, isFetching: false, refetch }, 'q')).result.current).toBe(
      false,
    )
  })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('relit après le délai, puis encore tant que des cartes restent en attente', () => {
    const refetch = vi.fn()
    const { result, rerender } = renderHook(
      ({ data }) => useJobsPendingRetry({ data, isFetching: false, refetch }, 'q1', 20_000),
      { initialProps: { data: response(true) } },
    )
    expect(result.current).toBe(true) // « recherche des offres en cours »
    act(() => void vi.advanceTimersByTime(19_000))
    expect(refetch).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(1_000))
    expect(refetch).toHaveBeenCalledTimes(1)
    // Il reste des cartes : un second passage s'arme (jusqu'à 0).
    rerender({ data: response(true) })
    act(() => void vi.advanceTimersByTime(20_000))
    expect(refetch).toHaveBeenCalledTimes(2)
    // Plus rien en attente : la ligne disparaît, plus aucune relecture.
    rerender({ data: response(false) })
    expect(result.current).toBe(false)
    act(() => void vi.advanceTimersByTime(120_000))
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('borne les relectures : jamais une boucle infinie', () => {
    const refetch = vi.fn()
    const { result, rerender } = renderHook(
      ({ n }) => useJobsPendingRetry({ data: response(true), isFetching: false, refetch }, 'q1', 1_000) && n,
      { initialProps: { n: 0 } },
    )
    for (let i = 0; i < JOBS_RETRY_MAX + 3; i++) {
      act(() => void vi.advanceTimersByTime(1_000))
      rerender({ n: i + 1 })
    }
    expect(refetch).toHaveBeenCalledTimes(JOBS_RETRY_MAX)
    expect(result.current).toBe(false)
  })

  it("ne fait rien quand rien n'est en attente", () => {
    const refetch = vi.fn()
    const { result } = renderHook(() =>
      useJobsPendingRetry({ data: response(false), isFetching: false, refetch }, 'q1', 20_000),
    )
    act(() => void vi.advanceTimersByTime(60_000))
    expect(refetch).not.toHaveBeenCalled()
    expect(result.current).toBe(false)
  })

  it('reste « en cours » pendant la relecture', () => {
    const refetch = vi.fn()
    const { result, rerender } = renderHook(
      ({ fetching }) => useJobsPendingRetry({ data: response(true), isFetching: fetching, refetch }, 'q1', 1_000),
      { initialProps: { fetching: false } },
    )
    act(() => void vi.advanceTimersByTime(1_000))
    rerender({ fetching: true })
    expect(result.current).toBe(true)
    // Encore des cartes en attente après la relecture : un autre passage est armé, la ligne reste.
    rerender({ fetching: false })
    expect(result.current).toBe(true)
  })
})
