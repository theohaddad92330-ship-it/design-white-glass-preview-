import { describe, expect, it } from 'vitest'
import { talentAvailabilityMeasure } from './talent.js'

/**
 * #1839 — « DISPONIBLES MAINTENANT : 0 » SUR UN VIVIER QUI SE TAIT.
 *
 * Le patron est `accountResourceMeasure` (`laura-account-context.ts`) : deux
 * moitiés, et on n'affirme rien tant que la mesure n'en tient pas une vraie.
 * Ici les deux moitiés ARRIVENT (`availableNow` + `availabilityUnknownCount`,
 * même population) — ce qui manquait est la conclusion : quand PERSONNE n'a
 * d'affectation enregistrée, le dénominateur de la disponibilité dérivée est
 * VIDE, et « 0 disponible » n'est pas un fait, c'est un silence rendu en
 * chiffre.
 *
 * La frontière est celle du dépôt, mot pour mot : « le vivier illisible se
 * TAIT ; le vivier lisible et vide DIT zéro, parce que c'est un fait ».
 */
describe('talentAvailabilityMeasure — #1839', () => {
  it('dit zéro quand la population est LISIBLE et vide : c’est un fait, pas un silence', () => {
    const measure = talentAvailabilityMeasure({ total: 7, availableNow: 0, availabilityUnknownCount: 0 })
    expect(measure).toEqual({ state: 'measured', availableNow: 0, unmeasurable: 0 })
  })

  it('mesure sur la part LISIBLE quand une part seulement se tait, et rapporte l’autre moitié', () => {
    // 30 fiches, 10 mesurables (dont 3 libres), 20 sans aucune affectation :
    // « 3 » est vrai, et le compagnon dit sur quoi il ne porte pas.
    const measure = talentAvailabilityMeasure({ total: 30, availableNow: 3, availabilityUnknownCount: 20 })
    expect(measure).toEqual({ state: 'measured', availableNow: 3, unmeasurable: 20 })
  })

  it('REFUSE d’affirmer « 0 » quand la population entière se tait — le dénominateur est vide', () => {
    // Le cas mesuré en production : 30 talents, aucune affectation enregistrée.
    // `deriveStaffing` rend `unknown` pour les 30, donc AUCUNE fiche n'est
    // évaluable — un axe non évaluable sort du dénominateur (doctrine).
    const measure = talentAvailabilityMeasure({ total: 30, availableNow: 0, availabilityUnknownCount: 30 })
    expect(measure).toEqual({ state: 'unmeasured', unmeasurable: 30 })
  })

  it('un vivier VIDE reste un fait : zéro talent, zéro disponible', () => {
    // Rien ne se tait ici — il n'y a personne. Se taire ferait chercher une
    // panne là où l'espace est simplement neuf.
    const measure = talentAvailabilityMeasure({ total: 0, availableNow: 0, availabilityUnknownCount: 0 })
    expect(measure).toEqual({ state: 'measured', availableNow: 0, unmeasurable: 0 })
  })

  it('sait dire NON à une paire incohérente plutôt que de composer un chiffre', () => {
    // Plus de fiches muettes que de fiches : la lecture est fausse quelque
    // part, et une mesure fausse est pire qu'une mesure absente.
    expect(talentAvailabilityMeasure({ total: 5, availableNow: 1, availabilityUnknownCount: 9 })).toEqual({
      state: 'unmeasured',
      unmeasurable: 9,
    })
    // Un compte négatif ou non entier n'est pas un compte.
    expect(talentAvailabilityMeasure({ total: 5, availableNow: -1, availabilityUnknownCount: 0 })).toEqual({
      state: 'unmeasured',
      unmeasurable: 0,
    })
    expect(talentAvailabilityMeasure({ total: 5, availableNow: 1.5, availabilityUnknownCount: 0 })).toEqual({
      state: 'unmeasured',
      unmeasurable: 0,
    })
  })
})
