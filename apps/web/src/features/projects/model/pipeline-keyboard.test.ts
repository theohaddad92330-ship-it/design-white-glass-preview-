import { describe, expect, it } from 'vitest'
import { nextStageCoordinates, type StageRect } from './pipeline-keyboard'

/**
 * #4339.1 — déplacer une affaire d'une colonne à l'autre se fait AUSSI au clavier (GA-32/35) : une flèche saute
 * à la colonne voisine. Avant, seul le pointeur était câblé : « Space » sur la poignée n'avait aucun effet.
 */
const RECTS: StageRect[] = [
  { id: 'detected', left: 0, top: 0, width: 200, height: 400 },
  { id: 'qualified', left: 220, top: 0, width: 200, height: 400 },
  { id: 'proposed', left: 440, top: 0, width: 200, height: 400 },
]
const CARD = { left: 240, top: 40, width: 160, height: 80 }

describe('nextStageCoordinates', () => {
  it('→ pose la carte au centre de la colonne de droite', () => {
    const next = nextStageCoordinates('ArrowRight', CARD, RECTS)
    expect(next).toEqual({ x: 440 + 100 - 80, y: CARD.top })
  })

  it('← pose la carte au centre de la colonne de gauche', () => {
    const next = nextStageCoordinates('ArrowLeft', CARD, RECTS)
    expect(next).toEqual({ x: 0 + 100 - 80, y: CARD.top })
  })

  it('sait dire NON : à la dernière colonne, → ne bouge pas ; ↑/↓ ne changent pas de colonne', () => {
    const last = { ...CARD, left: 460 }
    expect(nextStageCoordinates('ArrowRight', last, RECTS)).toBeNull()
    expect(nextStageCoordinates('ArrowDown', CARD, RECTS)).toBeNull()
    expect(nextStageCoordinates('Tab', CARD, RECTS)).toBeNull()
  })
})
