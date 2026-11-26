import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useVisualViewportInset } from './useVisualViewportInset'

/**
 * #2435.5 — LA HAUTEUR DU CLAVIER, MESURÉE.
 *
 * jsdom n'implémente pas `window.visualViewport` : chaque test le pose lui-même
 * sur un `EventTarget` minimal, comme `SidebarCollapse.test.tsx` le fait pour
 * `matchMedia`.
 */
class FakeVisualViewport extends EventTarget {
  height: number
  offsetTop = 0
  constructor(height: number) {
    super()
    this.height = height
  }
}

describe('useVisualViewportInset (#2435.5)', () => {
  let originalVisualViewport: VisualViewport | null
  let originalInnerHeight: number

  beforeEach(() => {
    originalVisualViewport = window.visualViewport
    originalInnerHeight = window.innerHeight
  })

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: originalVisualViewport, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: originalInnerHeight, configurable: true })
  })

  it('vaut 0 sans clavier ouvert (viewport visuel = viewport de mise en page)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const fake = new FakeVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })

    const { result } = renderHook(() => useVisualViewportInset())
    expect(result.current).toBe(0)
  })

  it('vaut la hauteur du clavier quand le viewport visuel rétrécit', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const fake = new FakeVisualViewport(800)
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })

    const { result } = renderHook(() => useVisualViewportInset())

    act(() => {
      fake.height = 500
      fake.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(300)
  })

  it('revient à 0 quand le clavier se referme (le viewport visuel reprend sa hauteur)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true })
    const fake = new FakeVisualViewport(500)
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })

    const { result } = renderHook(() => useVisualViewportInset())
    expect(result.current).toBe(300)

    act(() => {
      fake.height = 800
      fake.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe(0)
  })

  it('sans `visualViewport` (navigateur ancien), reste 0 sans planter', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
    const { result } = renderHook(() => useVisualViewportInset())
    expect(result.current).toBe(0)
  })
})
