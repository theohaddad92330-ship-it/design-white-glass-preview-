import { describe, expect, it } from 'vitest'
import type { AuditContradiction } from './commercial-audit-context.js'
import { auditHypothesisSchema, auditHypothesesFrom } from './commercial-audit-hypotheses.js'

/**
 * #2010.10 — RELIRE LES HYPOTHÈSES.
 *
 * Ces tests savent dire NON : à une hypothèse sans texte, à une contradiction
 * sans `possibleExplanation` qui en fabriquerait une quand même, à une liste
 * vide qui ne rendrait pas `[]`.
 */

function contradiction(overrides: Partial<AuditContradiction> = {}): AuditContradiction {
  return {
    ruleId: 'tooManySimultaneousMarkets',
    facts: ['4 secteurs visés'],
    tension: 'Quatre secteurs visés pour une seule personne à temps partiel.',
    possibleExplanation: null,
    questionToValidate: null,
    consequenceIfUnaddressed: null,
    recommendation: 'Choisir deux secteurs pour le trimestre et geler les deux autres.',
    indicator: 'Nombre de secteurs réellement travaillés dans le trimestre',
    confidence: 'single_source',
    ...overrides,
  }
}

describe('auditHypothesisSchema — ce qu’il refuse', () => {
  const valid = {
    ruleId: 'tooManySimultaneousMarkets',
    hypothesis: 'Les quatre secteurs viennent peut-être de quatre missions passées, jamais réellement priorisés.',
    questionToValidate: 'Combien de ces secteurs ont produit une mission dans les 12 derniers mois ?',
    confidence: 'single_source',
  }

  it('accepte une hypothèse complète', () => {
    expect(auditHypothesisSchema.safeParse(valid).success).toBe(true)
  })

  it('refuse une hypothèse sans texte — une hypothèse vide n’en est pas une', () => {
    expect(auditHypothesisSchema.safeParse({ ...valid, hypothesis: '' }).success).toBe(false)
  })

  it('accepte une question à valider absente — non mesuré, pas « aucune »', () => {
    expect(auditHypothesisSchema.safeParse({ ...valid, questionToValidate: null }).success).toBe(true)
  })

  it('accepte une confiance absente — non mesurée, pas la plus faible', () => {
    expect(auditHypothesisSchema.safeParse({ ...valid, confidence: null }).success).toBe(true)
  })
})

describe('auditHypothesesFrom — #2010.10', () => {
  it('rend [] sans contradiction', () => {
    expect(auditHypothesesFrom(null)).toEqual([])
    expect(auditHypothesesFrom(undefined)).toEqual([])
    expect(auditHypothesesFrom([])).toEqual([])
  })

  it('ne fabrique PAS une hypothèse pour une contradiction qui n’en porte pas', () => {
    // Ce test sait dire NON : une contradiction sans `possibleExplanation`
    // ne doit produire AUCUNE entrée — inventer une hypothèse ici serait
    // exactement l’affirmation déguisée que #2064.18 interdit côté prompt.
    expect(auditHypothesesFrom([contradiction({ possibleExplanation: null })])).toEqual([])
  })

  it('reprend l’hypothèse, sa question et sa confiance quand la contradiction en porte une', () => {
    const result = auditHypothesesFrom([
      contradiction({
        ruleId: 'objectivesAboveCapacity',
        possibleExplanation: 'L’objectif a peut-être été fixé avant la réduction de l’équipe commerciale.',
        questionToValidate: 'L’objectif a-t-il été révisé depuis le départ du deuxième commercial ?',
        confidence: 'deduced',
      }),
    ])

    expect(result).toEqual([
      {
        ruleId: 'objectivesAboveCapacity',
        hypothesis: 'L’objectif a peut-être été fixé avant la réduction de l’équipe commerciale.',
        questionToValidate: 'L’objectif a-t-il été révisé depuis le départ du deuxième commercial ?',
        confidence: 'deduced',
      },
    ])
  })

  it('filtre : seules les contradictions AVEC hypothèse traversent, dans leur ordre', () => {
    const result = auditHypothesesFrom([
      contradiction({ ruleId: 'tooManySimultaneousMarkets', possibleExplanation: null }),
      contradiction({ ruleId: 'offerWithoutProof', possibleExplanation: 'Peut-être jamais demandée par un client.' }),
      contradiction({ ruleId: 'poolWithoutAvailability', possibleExplanation: null }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].ruleId).toBe('offerWithoutProof')
  })
})
