import { describe, expect, it } from 'vitest'
import { computeVirtualWindow } from './message-list-window'

// #2441.11 — la fenêtre qui décide QUELS messages rendre pour un fil de 1000+
// éléments, sans monter les 1000 nœuds DOM. Fonction pure (pas de DOM, pas de
// mesure de layout réelle) : jsdom ne calcule jamais de vraie hauteur, donc
// c'est CETTE fonction qui décide, comme `should-auto-scroll.ts` à côté.
describe('computeVirtualWindow', () => {
  it('ne rend rien sur une liste vide', () => {
    const w = computeVirtualWindow({ itemHeights: [], scrollTop: 0, viewportHeight: 600 })
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(-1)
    expect(w.totalHeight).toBe(0)
    expect(w.offsetTop).toBe(0)
  })

  it('rend la liste entière quand elle tient déjà dans le viewport', () => {
    const itemHeights = [80, 80, 80, 80]
    const w = computeVirtualWindow({ itemHeights, scrollTop: 0, viewportHeight: 600 })
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(3)
    expect(w.totalHeight).toBe(320)
  })

  it("ne rend que la fenêtre visible plus l'overscan sur une longue liste, en haut", () => {
    const itemHeights = Array.from({ length: 1000 }, () => 80)
    const w = computeVirtualWindow({ itemHeights, scrollTop: 0, viewportHeight: 600, overscan: 2 })
    // 600 / 80 = 7.5 → 8 items visibles, + 2 overscan en bas (clampé à 0 en haut)
    expect(w.startIndex).toBe(0)
    expect(w.endIndex).toBe(9)
    expect(w.endIndex).toBeLessThan(999)
    expect(w.totalHeight).toBe(80000)
  })

  it('déplace la fenêtre au scroll, sans dépasser les bornes', () => {
    const itemHeights = Array.from({ length: 1000 }, () => 80)
    // scrollTop au milieu du fil
    const w = computeVirtualWindow({ itemHeights, scrollTop: 40000, viewportHeight: 600, overscan: 2 })
    expect(w.startIndex).toBeGreaterThan(0)
    expect(w.startIndex).toBeLessThan(w.endIndex)
    expect(w.endIndex).toBeLessThan(999)
    // offsetTop = hauteur cumulée des messages avant startIndex, pour le spacer
    expect(w.offsetTop).toBe(w.startIndex * 80)
  })

  it('clampe la fenêtre en bas de liste (pas d’index hors bornes)', () => {
    const itemHeights = Array.from({ length: 50 }, () => 80)
    const w = computeVirtualWindow({ itemHeights, scrollTop: 100000, viewportHeight: 600, overscan: 3 })
    expect(w.endIndex).toBe(49)
    expect(w.startIndex).toBeGreaterThanOrEqual(0)
  })

  it('gère des hauteurs variables (bulles de tailles différentes)', () => {
    const itemHeights = [40, 400, 40, 40, 600, 40, 40, 40]
    // scrollTop juste après la grosse bulle de 400 (index 1), au début de l'index 2
    const w = computeVirtualWindow({ itemHeights, scrollTop: 440, viewportHeight: 100, overscan: 0 })
    expect(w.startIndex).toBe(2)
    expect(w.totalHeight).toBe(40 + 400 + 40 + 40 + 600 + 40 + 40 + 40)
  })

  it('scrollTop négatif est clampé à 0 (jamais de fenêtre négative)', () => {
    const itemHeights = Array.from({ length: 100 }, () => 50)
    const w = computeVirtualWindow({ itemHeights, scrollTop: -500, viewportHeight: 200, overscan: 1 })
    expect(w.startIndex).toBe(0)
  })
})
