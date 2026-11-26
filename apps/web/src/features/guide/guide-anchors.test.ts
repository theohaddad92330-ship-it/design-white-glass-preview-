import { afterEach, describe, expect, it } from 'vitest'
import { guideAnchorIdSchema } from '@bellum/contracts'
import {
  GUIDE_ANCHOR_ATTRIBUTE,
  GUIDE_ANCHOR_CATALOGUE,
  findGuideAnchorElement,
  guideAnchorProps,
  isDeclaredGuideAnchor,
} from './guide-anchors'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('le catalogue des ancrages (#2212.16)', () => {
  /**
   * ⚠️ Une garde aveugle n'est pas une exemption. Un catalogue vide rendrait
   * VERTE la garde qui vérifie que chaque ancrage est posé dans le code — sans
   * rien vérifier.
   */
  it('n’est pas vide', () => {
    expect(GUIDE_ANCHOR_CATALOGUE.length).toBeGreaterThan(0)
  })

  it('ne contient que des ancrages valides au sens du contrat', () => {
    for (const anchor of GUIDE_ANCHOR_CATALOGUE) {
      expect(guideAnchorIdSchema.safeParse(anchor).success).toBe(true)
    }
  })

  it('ne contient aucun doublon — un ancrage désigne UN endroit', () => {
    expect(new Set(GUIDE_ANCHOR_CATALOGUE).size).toBe(GUIDE_ANCHOR_CATALOGUE.length)
  })

  it('reconnaît ce qui est déclaré, et seulement ça (#2212.37)', () => {
    expect(isDeclaredGuideAnchor(GUIDE_ANCHOR_CATALOGUE[0]!)).toBe(true)
    expect(isDeclaredGuideAnchor('inconnu.jamais-declare')).toBe(false)
  })
})

describe('poser un ancrage dans un composant', () => {
  it('rend l’attribut que le moteur lira', () => {
    const props = guideAnchorProps(GUIDE_ANCHOR_CATALOGUE[0]!)
    expect(props[GUIDE_ANCHOR_ATTRIBUTE]).toBe(GUIDE_ANCHOR_CATALOGUE[0])
  })
})

describe('retrouver un ancrage dans la page', () => {
  it('le trouve par son attribut', () => {
    document.body.innerHTML = `<button ${GUIDE_ANCHOR_ATTRIBUTE}="retour.bouton-declencheur">x</button>`
    expect(findGuideAnchorElement('retour.bouton-declencheur')).not.toBeNull()
  })

  it('rend null quand il n’est pas dans la page — sans lever (#2212.38/.39)', () => {
    expect(() => findGuideAnchorElement('retour.bouton-declencheur')).not.toThrow()
    expect(findGuideAnchorElement('retour.bouton-declencheur')).toBeNull()
  })

  /**
   * #2212.25 — une cible dans un tiroir ou une modale. Les surcouches du produit
   * se rendent par portail dans `document.body` : une recherche à l'échelle du
   * document les trouve sans que le moteur ait à connaître le tiroir.
   */
  it('le trouve dans une surcouche rendue par portail', () => {
    const portal = document.createElement('div')
    portal.innerHTML = `<div role="dialog"><button ${GUIDE_ANCHOR_ATTRIBUTE}="retour.bouton-declencheur">x</button></div>`
    document.body.appendChild(portal)
    expect(findGuideAnchorElement('retour.bouton-declencheur')).not.toBeNull()
  })

  /**
   * ⚠️ LA BARRIÈRE QUI EMPÊCHE LE MOTEUR DE REDEVENIR UN SÉLECTEUR CSS (#1787).
   * Un ancrage invalide ne construit AUCUN sélecteur : sinon
   * `findGuideAnchorElement('"] , *')` deviendrait un sélecteur arbitraire, et
   * le moteur se remettrait à deviner la structure du DOM.
   */
  it('refuse un ancrage qui n’est pas un ancrage, sans construire de sélecteur', () => {
    document.body.innerHTML = `<button ${GUIDE_ANCHOR_ATTRIBUTE}="retour.bouton-declencheur">x</button>`
    for (const junk of ['"] , *', '.sidebar > a', '#nav', '[data-x]']) {
      expect(() => findGuideAnchorElement(junk)).not.toThrow()
      expect(findGuideAnchorElement(junk)).toBeNull()
    }
  })

  it('refuse le rail de navigation, écarté par #1787', () => {
    document.body.innerHTML = `<a ${GUIDE_ANCHOR_ATTRIBUTE}="rail-de-navigation.comptes">x</a>`
    expect(findGuideAnchorElement('rail-de-navigation.comptes')).toBeNull()
  })
})

/**
 * #2212.15 — REMPLIR UN CHAMP POUR DE VRAI, PAS SEULEMENT SON ATTRIBUT DOM.
 */
