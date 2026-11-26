import { describe, expect, it } from 'vitest'
import { esnAnswersSchema } from '../onboarding.js'

describe('#3923.a — placed_roles voyage avec les réponses', () => {
  it('garde les métiers déclarés, nettoyés', () => {
    const parsed = esnAnswersSchema.shape.placed_roles.parse(['  Développeur Java ', 'Architecte cloud'])
    expect(parsed).toEqual(['Développeur Java', 'Architecte cloud'])
  })

  it('dégrade une valeur illisible en liste vide — « non évaluable », jamais une erreur de profil', () => {
    expect(esnAnswersSchema.shape.placed_roles.parse('développeur')).toEqual([])
    expect(esnAnswersSchema.shape.placed_roles.parse(['', '  '])).toEqual([])
    expect(esnAnswersSchema.shape.placed_roles.parse(undefined)).toBeUndefined()
  })
})
