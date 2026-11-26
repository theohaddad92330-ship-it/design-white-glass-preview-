import { describe, expect, it } from 'vitest'
import { cardFade, stagger, tabSlide } from './motion'

/**
 * Garde anti-« fond flou vide ». Un variant qui pose `transform: translate3d(...)`
 * en CHAÎNE laisse ce transform dans le DOM même au repos : l'élément devient alors
 * un bloc conteneur, et tout `position: fixed` descendant (un modal, un panneau)
 * se cale sur LUI au lieu de la fenêtre — donc hors écran sur un onglet plus haut
 * que la fenêtre. On exige des valeurs numériques (`x`/`y`), que framer remet à
 * `transform: none` une fois l'animation finie.
 */
const restStates = [
  ['cardFade.visible', cardFade.visible],
  ['stagger.visible', stagger.visible],
  ['tabSlide(false).visible', tabSlide(false).visible],
  ['tabSlide(true).visible', tabSlide(true).visible],
] as const

describe('variants du détail de compte', () => {
  it.each(restStates)('%s ne fige aucun transform en chaîne', (_name, state) => {
    expect(state).not.toHaveProperty('transform')
  })

  it('anime en valeurs numériques, pas en chaînes translate3d', () => {
    expect(cardFade.hidden).toMatchObject({ y: expect.any(Number) })
    expect(tabSlide(false).hidden).toMatchObject({ x: expect.any(Number) })
    expect(tabSlide(false).exit).toMatchObject({ x: expect.any(Number) })
  })

  it('respecte le mouvement réduit — aucun déplacement, seulement l’opacité', () => {
    const reduced = tabSlide(true)
    expect(reduced.hidden).toEqual({ opacity: 0 })
    expect(reduced.exit).toEqual({ opacity: 0 })
  })
})
