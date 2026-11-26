import { shouldAutoScroll, shouldLoadOlderMessages } from './should-auto-scroll'

/**
 * #2441.12 — l'auto-scroll ne doit JAMAIS interrompre la lecture d'un message
 * plus haut dans le fil : il ne resaute en bas que si la personne y était
 * déjà (à quelques pixels près, pour absorber l'arrondi du navigateur).
 */
describe('shouldAutoScroll (#2441.12)', () => {
  it('dit OUI quand la personne est déjà tout en bas', () => {
    expect(shouldAutoScroll({ scrollTop: 920, scrollHeight: 1000, clientHeight: 80 })).toBe(true)
  })

  it('dit OUI à quelques pixels près (arrondi navigateur)', () => {
    expect(shouldAutoScroll({ scrollTop: 918, scrollHeight: 1000, clientHeight: 80 })).toBe(true)
  })

  it('dit NON quand la personne a remonté lire un message plus haut', () => {
    expect(shouldAutoScroll({ scrollTop: 100, scrollHeight: 1000, clientHeight: 80 })).toBe(false)
  })

  it('dit OUI sur un fil qui tient entièrement dans la boîte (rien à scroller)', () => {
    expect(shouldAutoScroll({ scrollTop: 0, scrollHeight: 80, clientHeight: 80 })).toBe(true)
  })

  it('témoin — un seuil à 0 rendrait NON pour la même position "presque en bas"', () => {
    expect(shouldAutoScroll({ scrollTop: 918, scrollHeight: 1000, clientHeight: 80 }, 0)).toBe(false)
  })
})

/**
 * #1944.20 — symétrique de `shouldAutoScroll`, côté HAUT du fil : remonter
 * près du sommet charge les messages plus anciens. Même raison d'être à part
 * (jsdom ne calcule jamais de vraie hauteur, voir l'en-tête du fichier).
 */
describe('shouldLoadOlderMessages (#1944.20)', () => {
  it('dit OUI quand la personne est tout en haut', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 0, scrollHeight: 1000, clientHeight: 80 })).toBe(true)
  })

  it('dit OUI à quelques pixels près (arrondi navigateur)', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 12, scrollHeight: 1000, clientHeight: 80 })).toBe(true)
  })

  it('dit NON au milieu du fil', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 400, scrollHeight: 1000, clientHeight: 80 })).toBe(false)
  })

  it('dit OUI sur un fil qui tient entièrement dans la boîte (rien à scroller)', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 0, scrollHeight: 80, clientHeight: 80 })).toBe(true)
  })

  it('témoin — un seuil à 0 rendrait NON à 12 px du haut', () => {
    expect(shouldLoadOlderMessages({ scrollTop: 12, scrollHeight: 1000, clientHeight: 80 }, 0)).toBe(false)
  })
})
