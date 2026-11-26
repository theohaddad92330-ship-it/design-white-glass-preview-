import { describe, expect, it } from 'vitest'
import { blockedVariablesOf, cadenceLabel } from './sequence-library'

describe('sequence-library (#3756)', () => {
  it('cadenceLabel liste les délais J+n dans l’ordre', () => {
    const steps = [0, 3, 7].map((delay_days, position) => ({ position, delay_days, subject: '', body: 'b' }))
    expect(cadenceLabel({ steps })).toBe('J+0 · J+3 · J+7')
  })

  it('blockedVariablesOf lit les variables bloquantes, et rien d’autre', () => {
    expect(blockedVariablesOf({ blocked_variables: ['Prénom manquant : {{firstName}}'] })).toEqual([
      'Prénom manquant : {{firstName}}',
    ])
    expect(blockedVariablesOf({ email_draft: { body: 'x {{firstName}}' } })).toEqual([])
    expect(blockedVariablesOf({ blocked_variables: 'oops' })).toEqual([])
    expect(blockedVariablesOf(null)).toEqual([])
  })
})
