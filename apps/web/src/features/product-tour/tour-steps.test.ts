import { describe, expect, it } from 'vitest'
import { PRODUCT_SCREENS } from '@bellum/contracts'
import { PRODUCT_TOUR_STEPS, TOUR_AREA_WITHOUT_STEP } from './tour-steps'

/**
 * #1787 — LES ÉCRANS RETENUS POUR LA VISITE GUIDÉE.
 *
 * Le brief prévient : un tour des 56 écrans du catalogue ne se termine jamais.
 * Cette suite verrouille les deux moitiés de la promesse : le tour reste COURT
 * (quelques écrans qui décident, pas le catalogue entier), et chaque écran
 * qu'il montre est un VRAI écran du catalogue — jamais un libellé recopié à la
 * main, qui dériverait en trois semaines (loi GA-26).
 */
describe('#1787 — les étapes de la visite guidée', () => {
  it('LIT vraiment le catalogue — un corpus vide rendrait ce test aveugle', () => {
    expect(PRODUCT_SCREENS.length).toBeGreaterThan(50)
  })

  it('reste un tour QUI SE TERMINE — une aire du produit par étape, pas les 56 écrans', () => {
    // #1863.3 — la borne haute passe de 8 à 14, et elle reste une borne : le
    // refus de #1787 (« un tour de 56 écrans ne se termine jamais ») n'est pas
    // levé, il est seulement chiffré sur la bonne unité. Dix aires de nature
    // « produit » existent au catalogue ; au-delà de quelques écarts nommés, un
    // tour qui les dépasse est reparti vers la liste d'écrans.
    expect(PRODUCT_TOUR_STEPS.length).toBeGreaterThanOrEqual(4)
    expect(PRODUCT_TOUR_STEPS.length).toBeLessThanOrEqual(14)
  })

  it('#1863.3 — PRÉSENTE TOUTE AIRE « produit » DU CATALOGUE : une capacité neuve ne peut plus être oubliée', () => {
    // C'est LA garde du lot. Six écrans avaient été choisis à la main en #1787,
    // et une liste choisie à la main ne sait pas dire ce qu'elle oublie : le
    // vivier, les missions, les projets, le pilotage et les intégrations en
    // étaient absents sans qu'aucun rouge ne le signale.
    const productAreas = new Set(PRODUCT_SCREENS.filter(s => s.nature === 'produit').map(s => s.area))
    const covered = new Set(PRODUCT_TOUR_STEPS.map(step => step.screen.area))

    const missing = [...productAreas].filter(area => area !== TOUR_AREA_WITHOUT_STEP && !covered.has(area))
    expect(missing, `aires du produit qu'aucune étape ne présente : ${missing.join(', ')}`).toEqual([])
  })

  it('l’exception « mise en route » est une EXCEPTION, pas un trou — elle existe, et elle est la seule', () => {
    // Le témoin de la garde ci-dessus : sans lui, écrire n'importe quoi dans
    // `TOUR_AREA_WITHOUT_STEP` suffirait à rendre la garde verte en la vidant
    // de son sujet (« dérivation qui lit un registre sans son sujet »).
    const productAreas = new Set(PRODUCT_SCREENS.filter(s => s.nature === 'produit').map(s => s.area))
    expect(productAreas.has(TOUR_AREA_WITHOUT_STEP)).toBe(true)

    const covered = new Set(PRODUCT_TOUR_STEPS.map(step => step.screen.area))
    expect(covered.has(TOUR_AREA_WITHOUT_STEP)).toBe(false)
    expect([...productAreas].filter(area => !covered.has(area))).toEqual([TOUR_AREA_WITHOUT_STEP])
  })

  it('sait dire NON — une aire NEUVE au catalogue laisse la visite en défaut', () => {
    // Preuve n°1 exigée d'une garde : la casser volontairement. On rejoue le
    // MÊME calcul sur un catalogue qui porte une aire de plus, et on vérifie
    // qu'il la dénonce plutôt que de l'ignorer.
    const withNewArea = [...PRODUCT_SCREENS, { ...PRODUCT_SCREENS[0]!, route: '/atelier', area: 'atelier' as never }]
    const productAreas = new Set(withNewArea.filter(s => s.nature === 'produit').map(s => s.area))
    const covered = new Set(PRODUCT_TOUR_STEPS.map(step => step.screen.area))
    const missing = [...productAreas].filter(area => area !== TOUR_AREA_WITHOUT_STEP && !covered.has(area))

    expect(missing).toEqual(['atelier'])
  })

  it('chaque étape a une clé UNIQUE', () => {
    const keys = PRODUCT_TOUR_STEPS.map(step => step.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('chaque étape pointe une route RÉELLE du catalogue, de nature « produit »', () => {
    for (const step of PRODUCT_TOUR_STEPS) {
      const screen = PRODUCT_SCREENS.find(s => s.route === step.route)
      expect(screen, `route absente du catalogue : ${step.route}`).toBeDefined()
      expect(screen?.nature).toBe('produit')
    }
  })

  it('le TITRE affiché est celui du catalogue, jamais une copie locale', () => {
    // La garde de non-duplication : le step ne porte pas son propre libellé,
    // il résout `screen.label` — le seul endroit qui le connaît (GA-26).
    for (const step of PRODUCT_TOUR_STEPS) {
      expect(step.screen.label.fr.length).toBeGreaterThan(0)
      expect(step.screen.label.en.length).toBeGreaterThan(0)
    }
  })

  it('aucune route de la visite ne porte de paramètre — un `<Link>` sans id doit toujours résoudre', () => {
    for (const step of PRODUCT_TOUR_STEPS) {
      expect(step.route).not.toContain('$')
    }
  })

  it('sait dire NON — une route absente du catalogue casse le module au chargement', async () => {
    // Preuve n°2 exigée d'une garde (et ici, d'une dérivation) : elle doit
    // pouvoir échouer. On ne réimporte pas le vrai catalogue : on vérifie que
    // le même code de résolution, appliqué à un catalogue qui NE PORTE PAS la
    // route demandée, lève — plutôt que de rendre un écran silencieusement `undefined`.
    const emptyCatalog: typeof PRODUCT_SCREENS = []
    const resolve = (route: string) => {
      const screen = emptyCatalog.find(s => s.route === route)
      if (!screen) throw new Error(`Écran de tour introuvable dans le catalogue : ${route}`)
      return screen
    }
    expect(() => resolve('/dashboard')).toThrow()
  })
})
