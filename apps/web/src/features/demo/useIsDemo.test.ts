import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  credits: { data: undefined, isLoading: false } as { data?: { is_demo?: boolean }; isLoading: boolean },
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: () => h.credits }))

import { useDemoSpaceStatus, useIsDemo } from './useIsDemo'

/** #5024 — la connexion doit pouvoir distinguer « le serveur dit réel » de « le serveur n'a pas encore répondu ». */
describe('useDemoSpaceStatus (#5024)', () => {
  beforeEach(() => {
    h.credits = { data: undefined, isLoading: false }
  })

  it('« demo » seulement quand le serveur le dit', () => {
    h.credits = { data: { is_demo: true }, isLoading: false }
    expect(renderHook(() => useDemoSpaceStatus()).result.current).toBe('demo')
    expect(renderHook(() => useIsDemo()).result.current).toBe(true)
  })

  it('« unknown » tant que la réponse est en vol', () => {
    h.credits = { data: undefined, isLoading: true }
    expect(renderHook(() => useDemoSpaceStatus()).result.current).toBe('unknown')
    expect(renderHook(() => useIsDemo()).result.current).toBe(false)
  })

  it('sait dire NON : `is_demo` absent ou faux, ou requête en échec → « real » (la démo doit se prouver)', () => {
    h.credits = { data: { is_demo: false }, isLoading: false }
    expect(renderHook(() => useDemoSpaceStatus()).result.current).toBe('real')
    h.credits = { data: {}, isLoading: false }
    expect(renderHook(() => useDemoSpaceStatus()).result.current).toBe('real')
    h.credits = { data: undefined, isLoading: false }
    expect(renderHook(() => useDemoSpaceStatus()).result.current).toBe('real')
  })
})
