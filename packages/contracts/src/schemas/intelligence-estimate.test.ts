import { describe, expect, it } from 'vitest'
import { ACCOUNT_INTELLIGENCE_SOURCES } from './account-intelligence-context.js'
import { angleEstimateKind, ESTIMATE_KINDS, intelligenceEstimateKind } from './intelligence-estimate.js'

// #4016.L4 — chaque valeur estimée est marquée, jamais présentée comme un fait.
describe('intelligenceEstimateKind — un fait du contexte canonique qui n’est PAS une observation du compte', () => {
  it('l’inférence, la mémoire marché et les priors de référence sont badgés', () => {
    expect(intelligenceEstimateKind('inference', 'probable')).toBe('probable')
    expect(intelligenceEstimateKind('dataforge', 'hypothesis')).toBe('hypothesis')
    expect(intelligenceEstimateKind('market_memory', 'probable')).toBe('probable')
  })

  it('sait dire NON : une observation ou une correction ne se badge jamais « estimé »', () => {
    const observed = ACCOUNT_INTELLIGENCE_SOURCES.filter(
      source => !['inference', 'dataforge', 'market_memory'].includes(source),
    )
    expect(observed.length).toBeGreaterThan(0)
    for (const source of observed) expect(intelligenceEstimateKind(source, 'probable')).toBeNull()
  })
})

describe('angleEstimateKind — un angle sans preuve mobilisable est une HYPOTHÈSE', () => {
  it('absente, non vérifiable ou non vérifiée : hypothèse', () => {
    expect(angleEstimateKind('absent')).toBe('hypothesis')
    expect(angleEstimateKind('non_verifiable')).toBe('hypothesis')
    expect(angleEstimateKind('non_verifie')).toBe('hypothesis')
  })

  it('sait dire NON : une preuve mobilisable fait de l’angle autre chose qu’une hypothèse', () => {
    expect(angleEstimateKind('mobilisable')).toBeNull()
  })

  it('les formes d’estimation sont une liste fermée, en fin de liste seulement (GA-08)', () => {
    expect([...ESTIMATE_KINDS]).toEqual(['estimated', 'probable', 'hypothesis', 'suggested'])
  })
})
