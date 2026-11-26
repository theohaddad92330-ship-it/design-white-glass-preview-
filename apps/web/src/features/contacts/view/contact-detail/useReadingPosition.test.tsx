import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReadingPosition } from './useReadingPosition'

describe('useReadingPosition (#3688.10 — position de lecture préservée)', () => {
  const scrollTo = vi.fn()

  beforeEach(() => {
    window.sessionStorage.clear()
    scrollTo.mockReset()
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)
      return 0
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('retient où on lisait en quittant la fiche, et y revient au retour', () => {
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true })
    renderHook(() => useReadingPosition('c-1')).unmount()
    expect(window.sessionStorage.getItem('bellum:scroll:c-1')).toBe('640')

    renderHook(() => useReadingPosition('c-1'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 640 })
  })

  it('ne ramène nulle part une fiche ouverte pour la première fois, ni une autre fiche', () => {
    renderHook(() => useReadingPosition('c-2'))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('ne se bat pas contre une ancre demandée (`?tab=`) : désactivé, rien n’est restauré', () => {
    window.sessionStorage.setItem('bellum:scroll:c-1', '900')
    renderHook(() => useReadingPosition('c-1', false))
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('en haut de page, il n’y a rien à retenir : la clé est retirée', () => {
    window.sessionStorage.setItem('bellum:scroll:c-1', '900')
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
    renderHook(() => useReadingPosition('c-1', false)).unmount()
    expect(window.sessionStorage.getItem('bellum:scroll:c-1')).toBeNull()
  })
})
