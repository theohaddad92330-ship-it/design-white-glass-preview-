import { describe, expect, it } from 'vitest'
import { analysisScopeGuardrailFor } from './analysis-scope-guardrail.js'

describe('analysisScopeGuardrailFor', () => {
  it('suggests a narrower scope for a GE (grande entreprise) with no scope precised', () => {
    const guardrail = analysisScopeGuardrailFor({ sizeClass: 'GE', requestedScopeMode: null })
    expect(guardrail).toEqual({
      suggestedScopeMode: 'business_unit',
      reason: expect.stringContaining('groupe'),
    })
  })

  it('is case-insensitive on the registry category', () => {
    expect(analysisScopeGuardrailFor({ sizeClass: 'ge' })).not.toBeNull()
  })

  it('stays silent once the caller already precised a scope', () => {
    expect(analysisScopeGuardrailFor({ sizeClass: 'GE', requestedScopeMode: 'site' })).toBeNull()
  })

  it('stays silent on a PME/ETI — never invents a size that was not measured as GE', () => {
    expect(analysisScopeGuardrailFor({ sizeClass: 'PME' })).toBeNull()
    expect(analysisScopeGuardrailFor({ sizeClass: 'ETI' })).toBeNull()
  })

  it('stays silent when size is not measured — never a guessed default', () => {
    expect(analysisScopeGuardrailFor({ sizeClass: null })).toBeNull()
    expect(analysisScopeGuardrailFor({})).toBeNull()
  })

  it('renders the English reason under locale "en"', () => {
    const guardrail = analysisScopeGuardrailFor({ sizeClass: 'GE' }, 'en')
    expect(guardrail?.reason).toMatch(/group/i)
  })

  // #3434 — « Analyse Michelin. » : le registre ne classe pas toujours `GE`, mais
  // publie la tranche d'effectif. Une tranche dont le MINIMUM atteint 5 000 est une GE.
  it('flags a published headcount band whose floor reaches 5 000', () => {
    expect(analysisScopeGuardrailFor({ headcountLabel: '10 000 salariés et plus' })).not.toBeNull()
    expect(analysisScopeGuardrailFor({ headcountLabel: '5 000 à 9 999 salariés' })).not.toBeNull()
  })

  it('stays silent on a band below 5 000 or an unreadable label', () => {
    expect(analysisScopeGuardrailFor({ headcountLabel: '2 000 à 4 999 salariés' })).toBeNull()
    expect(analysisScopeGuardrailFor({ headcountLabel: '500 à 999 salariés' })).toBeNull()
    expect(analysisScopeGuardrailFor({ headcountLabel: 'NN' })).toBeNull()
    expect(analysisScopeGuardrailFor({ headcountLabel: null })).toBeNull()
  })
})

describe('#3434 — effectif Pappers (employeesMin)', () => {
  it('un effectif minimum publié ≥ 5 000 déclenche le garde-fou, sans size_class ni libellé', () => {
    expect(analysisScopeGuardrailFor({ employeesMin: 10000 })?.suggestedScopeMode).toBe('business_unit')
  })
  it('sous 5 000, absent ou nul ⇒ rien (jamais une taille devinée)', () => {
    expect(analysisScopeGuardrailFor({ employeesMin: 4999 })).toBeNull()
    expect(analysisScopeGuardrailFor({ employeesMin: null })).toBeNull()
    expect(analysisScopeGuardrailFor({})).toBeNull()
  })
})
