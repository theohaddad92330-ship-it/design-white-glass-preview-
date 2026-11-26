import { describe, expect, it } from 'vitest'
import { safeArray, safeString } from './safe'

/**
 * #2130.45 — recette du scénario « donnée inconnue ».
 *
 * `safeString`/`safeArray` sont les deux replis PARTAGÉS (GA-26) que le
 * dossier compte appelle dès qu'une donnée peut être absente ou mal formée
 * (`plan.ts`, `orgStructureData.ts`, `scoreFactors.ts`, `evaluationViewData.ts`
 * — huit appelants réels, aucun test qui prouve ce qu'ils rendent sur une
 * valeur VRAIMENT inconnue). La doctrine (GA-18/GA-19, « une valeur absente
 * ne s'affiche jamais "0" ») exige un repli qui se TAIT plutôt qu'un repli
 * qui invente — cette garde le prouve pour les deux fonctions, sur les formes
 * qu'une donnée « inconnue » prend réellement : `null`, `undefined`, un objet
 * sans aucune clé lisible.
 */
describe('#2130.45 — une donnée inconnue ne s’affiche jamais comme une valeur inventée', () => {
  it('safeString rend une chaîne VIDE sur null/undefined — jamais "null", "undefined" ou "0"', () => {
    expect(safeString(null)).toBe('')
    expect(safeString(undefined)).toBe('')
  })

  it('safeString rend une chaîne VIDE sur un objet sans aucune clé lisible — jamais "[object Object]"', () => {
    expect(safeString({})).toBe('')
    expect(safeString({ internalId: 42 })).toBe('')
  })

  it('safeString EXTRAIT la clé lisible quand la donnée EST connue — le repli ne masque pas une vraie valeur', () => {
    expect(safeString({ name: 'Thales' })).toBe('Thales')
    expect(safeString('Airbus')).toBe('Airbus')
    // sait dire NON : une valeur réellement connue ne doit jamais retomber sur ''.
    expect(safeString('Airbus')).not.toBe('')
  })

  it('safeArray rend un tableau VIDE sur null/undefined/une valeur scalaire — jamais une liste inventée', () => {
    expect(safeArray(null)).toEqual([])
    expect(safeArray(undefined)).toEqual([])
    expect(safeArray('pas une liste')).toEqual([])
  })

  it('safeArray RENVOIE la liste réelle quand elle existe — le repli ne tronque pas une donnée connue', () => {
    expect(safeArray(['DSI', 'DAF'])).toEqual(['DSI', 'DAF'])
  })
})
