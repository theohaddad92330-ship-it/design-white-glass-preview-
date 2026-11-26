import { describe, expect, it } from 'vitest'
import { choicesFromAnswerTags } from './types'

/**
 * #2039.6 (épopée #2880) — `dynamicChoicesFromAnswerKey` (`multi`) se résout
 * par cette fonction PURE : un choix par valeur RÉELLEMENT saisie, jamais un
 * catalogue deviné ni une option fabriquée sur un type inattendu.
 */
describe('choicesFromAnswerTags', () => {
  it('rend un choix par valeur du tableau', () => {
    expect(choicesFromAnswerTags(['Cloud & Infrastructure', 'Data & IA'])).toEqual([
      { value: 'Cloud & Infrastructure' },
      { value: 'Data & IA' },
    ])
  })

  it('ignore les entrées vides ou faites uniquement d’espaces', () => {
    expect(choicesFromAnswerTags(['Cloud', '', '   '])).toEqual([{ value: 'Cloud' }])
  })

  it.each([undefined, null, 'Cloud', 42, { value: 'Cloud' }])(
    'rend un tableau vide sur une valeur qui n’est pas un tableau de chaînes (%p)',
    value => {
      expect(choicesFromAnswerTags(value)).toEqual([])
    },
  )

  it('un tableau vide ne produit aucun choix', () => {
    expect(choicesFromAnswerTags([])).toEqual([])
  })
})
