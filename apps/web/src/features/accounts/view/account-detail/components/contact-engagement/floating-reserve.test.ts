import { afterEach, describe, expect, it } from 'vitest'
import {
  ABOVE_FLOATING_BUTTONS_BOTTOM,
  FLOATING_BUTTONS_RESERVE_PX,
  FLOATING_BUTTONS_RESERVE_REM,
  panelPlacement,
} from './floating-reserve'

// #3487.3 / #3418 — recette prod 01/10 : le bord bas du composeur (chip, bouton
// d'envoi) passait sous les boutons flottants Laura / Signaler (1rem → 4rem).
const FLOATING_TOP_PX = 4 * 16

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
}

afterEach(() => setViewport(1024, 768))

describe('panelPlacement — réserve sous les boutons flottants', () => {
  it.each([
    ['sans ancre', undefined],
    ['ancré sur un onglet', { top: 700, left: 1300, width: 165, height: 28 } as DOMRect],
    ['ancré trop bas (collé au bord)', { top: 800, left: 1300, width: 165, height: 28 } as DOMRect],
  ])('panneau ouvert %s : bord bas au-dessus des flottants', (_nom, anchorRect) => {
    setViewport(1536, 827)
    const placement = panelPlacement({ anchorRect, maximized: false })
    expect(placement).toBeDefined()
    const bottomEdge = (placement?.top ?? 0) + (placement?.height ?? 0)
    expect(bottomEdge).toBeLessThanOrEqual(827 - FLOATING_TOP_PX)
  })

  it('panneau agrandi : bord bas au-dessus des flottants même si le cadre descend plus bas', () => {
    setViewport(1536, 827)
    const placement = panelPlacement({ maximized: true })
    expect((placement?.top ?? 0) + (placement?.height ?? 0)).toBeLessThanOrEqual(827 - FLOATING_TOP_PX)
  })

  it('#3696.7 — grand écran : un panneau assez large pour lire le message (560 px)', () => {
    setViewport(1536, 827)
    expect(panelPlacement({ maximized: false })?.width).toBe(560)
  })

  it('#3696.7 — petite largeur : le panneau prend la place utile, sans déborder', () => {
    setViewport(390, 800)
    const placement = panelPlacement({ maximized: false })
    expect(placement?.width).toBe(374)
    expect(placement?.left).toBe(8)
    expect((placement?.left ?? 0) + (placement?.width ?? 0)).toBeLessThanOrEqual(390)
  })

  it('la réserve couvre la hauteur des flottants', () => {
    expect(FLOATING_BUTTONS_RESERVE_PX).toBeGreaterThan(FLOATING_TOP_PX)
  })

  it('la classe Tailwind littérale reste égale à la constante en rem', () => {
    expect(ABOVE_FLOATING_BUTTONS_BOTTOM).toContain(`calc(${FLOATING_BUTTONS_RESERVE_REM}rem+`)
  })
})
