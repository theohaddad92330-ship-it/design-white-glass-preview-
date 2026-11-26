import { describe, expect, it } from 'vitest'
import { composeAssumptions } from './clarification-assumptions'

describe('composeAssumptions (#3224)', () => {
  it('une phrase déjà rédigée n’est jamais préfixée, ponctuation unique', () => {
    expect(composeAssumptions(['Je conserve tes secteurs… ne les modifies pas..'])).toEqual({
      phrases: null,
      sentences: 'Je conserve tes secteurs… ne les modifies pas.',
    })
  })
  it('un groupe nominal reste préfixable, sans point final', () => {
    expect(composeAssumptions(['une disponibilité sous 30 jours.'])).toEqual({
      phrases: 'une disponibilité sous 30 jours',
      sentences: null,
    })
  })
  it('J’ élidé est une phrase aussi', () => {
    expect(composeAssumptions(['J’écarte Lyon'])).toEqual({ phrases: null, sentences: 'J’écarte Lyon.' })
  })
  it('vide → rien', () => {
    expect(composeAssumptions(['', '  '])).toEqual({ phrases: null, sentences: null })
  })
})
