import { beforeEach, describe, expect, it } from 'vitest'
import { PRODUCT_TOUR_STEPS } from './tour-steps'
import { useProductTourStore } from './product-tour-store'

/**
 * #1863.3 — LE FIL SE TIENT DANS LE STORE, PAS DANS L'ÉCRAN.
 *
 * Ce que cette suite verrouille, c'est exactement le défaut mesuré : la visite
 * ne doit PAS se terminer quand on ouvre l'écran d'une étape, et le rang ne
 * doit pas se perdre en chemin.
 */
describe('#1863.3 — le store de la visite guidée', () => {
  beforeEach(() => {
    useProductTourStore.setState({ phase: 'off', index: 0, hasVisited: false })
  })

  it('au repos, aucune visite — rien ne surgit sans qu’on l’ait demandé', () => {
    expect(useProductTourStore.getState().phase).toBe('off')
  })

  it('`start` ouvre la LECTURE au premier écran', () => {
    useProductTourStore.getState().start()
    expect(useProductTourStore.getState().phase).toBe('reading')
    expect(useProductTourStore.getState().index).toBe(0)
  })

  it('LE DÉFAUT MESURÉ — ouvrir l’écran d’une étape ne termine PAS la visite, et garde le rang', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().goTo(2)
    useProductTourStore.getState().visit()

    // Avant #1863.3 : la visite était finie ici, et plus rien n'en portait trace.
    expect(useProductTourStore.getState().phase).toBe('visiting')
    expect(useProductTourStore.getState().index).toBe(2)
  })

  it('depuis l’écran, on revient au DÉTAIL de la même étape — le rang ne bouge pas', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().goTo(3)
    useProductTourStore.getState().visit()
    useProductTourStore.getState().read()

    expect(useProductTourStore.getState().phase).toBe('reading')
    expect(useProductTourStore.getState().index).toBe(3)
  })

  it('`stop` termine la visite ET repart à zéro — une visite est une session, pas un signet', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().goTo(4)
    useProductTourStore.getState().stop()

    expect(useProductTourStore.getState().phase).toBe('off')
    expect(useProductTourStore.getState().index).toBe(0)
  })

  it('`goTo` refuse un rang HORS BORNES plutôt que d’inventer une étape', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().goTo(1)

    useProductTourStore.getState().goTo(-1)
    expect(useProductTourStore.getState().index).toBe(1)

    useProductTourStore.getState().goTo(PRODUCT_TOUR_STEPS.length)
    expect(useProductTourStore.getState().index).toBe(1)

    useProductTourStore.getState().goTo(1.5)
    expect(useProductTourStore.getState().index).toBe(1)
  })

  it('fermer le DÉTAIL rend la main à la barre quand la visite a déjà emmené quelque part', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().goTo(3)
    useProductTourStore.getState().visit() // on est allé sur l'écran…
    useProductTourStore.getState().read() // …puis on a rouvert le détail

    useProductTourStore.getState().closeDetails()

    // Terminer la visite ici reperdrait le fil — exactement le défaut du lot.
    expect(useProductTourStore.getState().phase).toBe('visiting')
    expect(useProductTourStore.getState().index).toBe(3)
  })

  it('fermer la TOUTE PREMIÈRE modale quitte : personne n’a encore rien visité', () => {
    useProductTourStore.getState().start()

    useProductTourStore.getState().closeDetails()

    expect(useProductTourStore.getState().phase).toBe('off')
    expect(useProductTourStore.getState().index).toBe(0)
  })

  it('une visite NEUVE oublie qu’une précédente avait emmené quelque part', () => {
    useProductTourStore.getState().start()
    useProductTourStore.getState().visit()
    useProductTourStore.getState().stop()

    useProductTourStore.getState().start()
    useProductTourStore.getState().closeDetails()

    // Sans la remise à zéro, ce « non merci » laisserait une barre orpheline.
    expect(useProductTourStore.getState().phase).toBe('off')
  })

  it('`read` et `visit` ne RESSUSCITENT pas une visite terminée', () => {
    useProductTourStore.getState().read()
    expect(useProductTourStore.getState().phase).toBe('off')

    useProductTourStore.getState().visit()
    expect(useProductTourStore.getState().phase).toBe('off')
  })
})
