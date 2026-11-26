import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useOnlineStatus } from './useOnlineStatus'

/**
 * #2084.15 — État « réseau coupé » : le parcours d'onboarding n'avait aucun
 * signal quand la connexion elle-même tombe (distinct d'UN appel qui échoue,
 * déjà couvert par `classifyNetworkFailure`). Sans lui, un formulaire rempli
 * hors ligne semble juste bloqué, jamais expliqué.
 */
describe('useOnlineStatus', () => {
  let originalOnLine: boolean

  beforeEach(() => {
    originalOnLine = window.navigator.onLine
  })

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: originalOnLine, configurable: true })
  })

  it('reads the browser connectivity at mount', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())

    expect(result.current).toBe(true)
  })

  it('flips to false when the browser goes offline', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })

    expect(result.current).toBe(false)
  })

  it('flips back to true when the connection returns', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())

    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
      window.dispatchEvent(new Event('online'))
    })

    expect(result.current).toBe(true)
  })
})
