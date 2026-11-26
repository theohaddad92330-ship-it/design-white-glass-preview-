import { describe, expect, it } from 'vitest'
import { toFormAnswerValue } from './onboarding.js'

/**
 * Intégration vague 12 — le défaut que la fusion a rendu visible.
 *
 * Jusqu'au 16/09/2026, TOUTE valeur d'`EsnAnswers` était une chaîne ou une
 * liste de chaînes, et trois endroits du web refaisaient la même boucle :
 *
 *     out[key] = Array.isArray(value) ? value : (value ?? '')
 *
 * `#2052` a ajouté `esn_objectives`, un tableau d'OBJETS. Les trois boucles
 * ont cessé de compiler le même jour (`onboardingStore.ts`,
 * `useProfileAnswers.ts`, `EsnSection.tsx`) — et le pire correctif possible
 * aurait été un `as string[]` : un tableau d'objets serait alors arrivé
 * intact dans un champ de formulaire, pour s'afficher « [object Object] ».
 *
 * La projection vit donc à UN seul endroit (GA-26) et dit NON explicitement :
 * ce qui n'est pas éditable dans un champ texte rend `null`, et l'appelant
 * SAUTE la clé au lieu de la déformer.
 */
describe('toFormAnswerValue — ce qu’un formulaire sait éditer, et ce qu’il ne sait pas', () => {
  it('rend la chaîne telle quelle', () => {
    expect(toFormAnswerValue('Bellum')).toBe('Bellum')
    expect(toFormAnswerValue('')).toBe('')
  })

  it('rend une liste de chaînes telle quelle, sans la recopier', () => {
    const liste = ['data', 'cloud']
    expect(toFormAnswerValue(liste)).toBe(liste)
  })

  it('rend la chaîne vide pour une absence — un champ vide, jamais « null »', () => {
    expect(toFormAnswerValue(null)).toBe('')
    expect(toFormAnswerValue(undefined)).toBe('')
  })

  it('rend le tableau vide tel quel — « aucune réponse » reste une liste', () => {
    expect(toFormAnswerValue([])).toEqual([])
  })

  it('sait dire NON : un tableau d’OBJETS (esn_objectives) n’est pas une valeur de formulaire', () => {
    const objectifs = [{ kind: 'meetings', target: 12, period: 'month' }]
    expect(toFormAnswerValue(objectifs)).toBeNull()
  })

  it('sait dire NON : un objet nu non plus', () => {
    expect(toFormAnswerValue({ kind: 'meetings' })).toBeNull()
  })

  it('#2088.12 — rend un nombre en chaîne : consultant_count / annual_revenue_amount sont éditables comme le reste', () => {
    expect(toFormAnswerValue(12)).toBe('12')
    expect(toFormAnswerValue(0)).toBe('0')
  })

  it('#2088.12 — sait dire NON à un nombre qui n’en est plus un (NaN, Infinity)', () => {
    expect(toFormAnswerValue(Number.NaN)).toBe('')
    expect(toFormAnswerValue(Number.POSITIVE_INFINITY)).toBe('')
  })

  it('n’attrape pas ce qu’elle ne vise pas : une liste dont UNE seule entrée est une chaîne vide reste éditable', () => {
    expect(toFormAnswerValue(['', 'cloud'])).toEqual(['', 'cloud'])
  })
})
