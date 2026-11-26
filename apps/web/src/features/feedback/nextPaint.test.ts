import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextPaint } from './nextPaint'

/**
 * ⚠️ LE DÉFAUT QUE CE TEST GARDE, ET IL EST INVISIBLE AUTREMENT.
 *
 * La capture d'écran attend le rendu suivant pour que le viseur ait quitté le
 * DOM. On attendait deux `requestAnimationFrame` — **et `requestAnimationFrame`
 * ne tire JAMAIS dans un onglet caché.**
 *
 * Mesuré en production le 05/09/2026 (`document.hidden === true`) : le widget
 * restait sur « Capture en cours… » indéfiniment, sans erreur, sans console,
 * sans rien à quoi se raccrocher. Il suffit de changer d'onglet entre le clic
 * et la capture. Aucun test ne pouvait le voir : jsdom fait tirer `rAF`.
 *
 * Le test SIMULE donc l'onglet caché en neutralisant `requestAnimationFrame`.
 * C'est la seule façon de reproduire un environnement où la page ne peint pas.
 */
describe('nextPaint — l’attente est bornée', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('rend la main sur le rendu quand la page peint', async () => {
    // jsdom fait tirer `rAF` : c'est le cas nominal, l'onglet est visible.
    const promise = nextPaint()
    await vi.advanceTimersByTimeAsync(50)
    await expect(promise).resolves.toBeUndefined()
  })

  it('rend la main MALGRÉ TOUT quand la page ne peint pas — onglet caché', async () => {
    // Un `rAF` qui n'appelle jamais son callback : exactement ce que fait
    // Chrome dans un onglet en arrière-plan.
    vi.stubGlobal('requestAnimationFrame', () => 0)

    let settled = false
    const promise = nextPaint().then(() => {
      settled = true
    })

    await vi.advanceTimersByTimeAsync(100)
    expect(settled, 'ne doit pas rendre la main avant le délai').toBe(false)

    await vi.advanceTimersByTimeAsync(400)
    await promise
    expect(settled).toBe(true)
  })

  /**
   * Deux résolutions feraient deux captures — donc deux images, et la seconde
   * prise après que l'écran a changé.
   */
  it('ne rend la main qu’UNE fois, même si les deux chemins arrivent', async () => {
    const resolved = vi.fn()
    const promise = nextPaint().then(resolved)
    await vi.advanceTimersByTimeAsync(600)
    await promise
    expect(resolved).toHaveBeenCalledTimes(1)
  })
})
