import { describe, expect, it } from 'vitest'
import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'
import {
  asksEnrichmentCost,
  ENRICHMENT_COST_PREFERENCE_KEY,
  readSkipEnrichmentCost,
} from './enrichment-cost-preference.js'
import { userPreferencesPatchSchema } from './reply-preferences.js'

// #4016.L8b — « ne plus me demander » le coût d'un enrichissement.
describe('readSkipEnrichmentCost — la préférence de CETTE personne', () => {
  it('vrai seulement quand la clé vaut exactement `true`', () => {
    expect(readSkipEnrichmentCost({ [ENRICHMENT_COST_PREFERENCE_KEY]: true })).toBe(true)
  })

  it('sait dire NON : absente, inconnue ou sac vide = on redemande', () => {
    expect(readSkipEnrichmentCost(null)).toBe(false)
    expect(readSkipEnrichmentCost({})).toBe(false)
    expect(readSkipEnrichmentCost({ [ENRICHMENT_COST_PREFERENCE_KEY]: 'true' })).toBe(false)
    expect(readSkipEnrichmentCost({ [ENRICHMENT_COST_PREFERENCE_KEY]: false })).toBe(false)
  })
})

describe('asksEnrichmentCost — la question de coût respecte la préférence', () => {
  const one = CREDIT_WEIGHTS.contact_enrichment

  it('sans préférence, la question se pose toujours', () => {
    expect(asksEnrichmentCost({ skip: false, credits: one })).toBe(true)
  })

  it('avec la préférence, UN contact part sans question', () => {
    expect(asksEnrichmentCost({ skip: true, credits: one })).toBe(false)
  })

  it('sait dire NON : un lot (plus d’un contact) redemande toujours (GA-49)', () => {
    expect(asksEnrichmentCost({ skip: true, credits: one * 2 })).toBe(true)
  })
})

describe('PATCH /memory/preferences — une valeur inconnue est refusée à la porte', () => {
  it('accepte `true`, refuse le reste', () => {
    expect(userPreferencesPatchSchema.safeParse({ [ENRICHMENT_COST_PREFERENCE_KEY]: true }).success).toBe(true)
    expect(userPreferencesPatchSchema.safeParse({ [ENRICHMENT_COST_PREFERENCE_KEY]: 'oui' }).success).toBe(false)
    expect(userPreferencesPatchSchema.safeParse({ [ENRICHMENT_COST_PREFERENCE_KEY]: false }).success).toBe(false)
  })
})
