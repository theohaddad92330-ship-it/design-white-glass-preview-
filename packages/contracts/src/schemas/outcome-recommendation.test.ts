import { describe, expect, it } from 'vitest'
import {
  OUTCOME_RECOMMENDATION_DIMENSIONS,
  classifyCommercialOutcome,
  recommendFromOutcomes,
} from './outcome-recommendation.js'

// #3211.11 (#3234, lot M11 09/10) — une recommandation PAR DIMENSION (cadence,
// route, priorité) tirée des issues DÉCLARÉES de l'espace. Des comptes, jamais
// une probabilité (doctrine, refusé six fois).
describe('recommendFromOutcomes', () => {
  const rows = (value: string, positive: number, negative: number, ignored = 0) => [
    { value, outcome: 'meeting_booked', count: positive },
    { value, outcome: 'no_response', count: negative },
    { value, outcome: 'technical_error', count: ignored },
  ]

  it('recommande la valeur qui a le plus d’issues positives parmi celles assez jugées', () => {
    const result = recommendFromOutcomes('cadence', [...rows('relance', 6, 6), ...rows('preuve_sociale', 8, 4)])
    expect(result.recommended).toBe('preuve_sociale')
    expect(result.reason).toBe('measured')
    expect(result.values).toEqual([
      { value: 'preuve_sociale', positive: 8, judged: 12, sufficient: true },
      { value: 'relance', positive: 6, judged: 12, sufficient: true },
    ])
  })

  it('n’expose JAMAIS de taux ni de probabilité — des comptes seulement', () => {
    const result = recommendFromOutcomes('route', [...rows('partenaire', 9, 3), ...rows('sponsor', 2, 10)])
    const keys = new Set(result.values.flatMap(value => Object.keys(value)))
    expect([...keys].sort()).toEqual(['judged', 'positive', 'sufficient', 'value'])
    expect(JSON.stringify(result)).not.toMatch(/rate|probab|chance|%/i)
  })

  it('SAIT DIRE NON — sous dix issues jugées, la valeur n’est pas comparée', () => {
    const result = recommendFromOutcomes('priority', [...rows('focus', 9, 0), ...rows('volume', 4, 8)])
    expect(result.recommended).toBeNull()
    expect(result.reason).toBe('not_enough_measured')
    expect(result.values.find(value => value.value === 'focus')?.sufficient).toBe(false)
  })

  it('une seule valeur mesurée ne se recommande pas : il n’y a rien à comparer', () => {
    const result = recommendFromOutcomes('cadence', rows('relance', 10, 2))
    expect(result.recommended).toBeNull()
    expect(result.reason).toBe('not_enough_measured')
  })

  it('une égalité ne tranche pas', () => {
    const result = recommendFromOutcomes('cadence', [...rows('relance', 6, 6), ...rows('initial', 6, 6)])
    expect(result.recommended).toBeNull()
    expect(result.reason).toBe('tie')
  })

  it('aucune issue jugée : `no_outcome`, jamais une valeur à zéro', () => {
    const result = recommendFromOutcomes('route', rows('partenaire', 0, 0, 5))
    expect(result).toEqual({ dimension: 'route', recommended: null, reason: 'no_outcome', values: [] })
  })

  it('les trois dimensions sont exactement cadence, route, priorité', () => {
    expect(OUTCOME_RECOMMENDATION_DIMENSIONS).toEqual(['cadence', 'route', 'priority'])
  })
})

describe('classifyCommercialOutcome', () => {
  it('classe le grand livre des outcomes, et ignore ce qui ne juge pas l’approche', () => {
    expect(classifyCommercialOutcome('message_replied')).toBe('positive')
    expect(classifyCommercialOutcome('qualified_relationship')).toBe('positive')
    expect(classifyCommercialOutcome('consultant_positioned')).toBe('positive')
    expect(classifyCommercialOutcome('declined')).toBe('negative')
    expect(classifyCommercialOutcome('incorrect_contact')).toBeNull()
    expect(classifyCommercialOutcome('partner_relevant')).toBeNull()
  })
})
