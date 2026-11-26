import { describe, expect, it } from 'vitest'
import type { ExclusionSeverity, MatchExclusion } from './match.js'
import {
  deriveMatchVerdict,
  EXCLUSION_REASONS,
  EXCLUSION_SEVERITY,
  MATCH_AXES,
  MATCH_BUCKETS,
  MATCH_AXIS_WEIGHTS,
  MATCH_DISPLAY_ONLY_AXES,
  matchNextAction,
  matchWeightsSchema,
  matchScoreIsMeasured,
  normaliseMatchWeights,
} from './match.js'

describe('les treize axes', () => {
  it('sont quatorze et pèsent 100', () => {
    // #2176.21 — treize depuis l'ajout de l'axe « risks » (signaux gradués,
    // distincts du binaire `client_constraints`).
    // #4072.6 — quatorze avec « client_history » (affaires et besoins chez ce client).
    // #2176.13 — quinze avec « comparable_experience », affiché à POIDS 0.
    expect(MATCH_AXES).toHaveLength(15)
    expect(Object.values(MATCH_AXIS_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  // #2176.13 — arbitrage Louis (31/10) : l'axe « Expérience comparable » se
  // VOIT mais ne PÈSE pas — la pondération figée des quatorze autres ne bouge pas.
  it('pose « comparable_experience » à poids 0 sans toucher les quatorze autres poids', () => {
    expect(MATCH_AXIS_WEIGHTS.comparable_experience).toBe(0)
    expect(MATCH_DISPLAY_ONLY_AXES).toEqual(['comparable_experience'])
    expect(MATCH_AXIS_WEIGHTS).toMatchObject({
      must_have: 23,
      nice_to_have: 6,
      seniority: 8,
      sector: 7,
      environment: 7,
      language: 5,
      location: 8,
      availability: 11,
      contract_status: 4,
      rate: 7,
      evidence_quality: 4,
      client_constraints: 2,
      risks: 5,
      client_history: 3,
    })
  })

  it('refuse qu’un réglage d’espace donne du poids à un axe affiché seulement', () => {
    const forced = normaliseMatchWeights({ comparable_experience: 40 })
    expect(forced.comparable_experience).toBe(0)
    expect(forced).toEqual(MATCH_AXIS_WEIGHTS)
  })

  it('relit une pondération journalisée AVANT l’axe (clé absente) sans la rejeter', () => {
    const { comparable_experience: _ignored, ...stored } = MATCH_AXIS_WEIGHTS
    const parsed = matchWeightsSchema.safeParse(stored)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.comparable_experience).toBe(0)
    expect(matchWeightsSchema.safeParse({ ...MATCH_AXIS_WEIGHTS, comparable_experience: 5 }).success).toBe(false)
  })

  it('portent un poids pour chaque axe, sans clé orpheline', () => {
    expect(Object.keys(MATCH_AXIS_WEIGHTS).sort()).toEqual([...MATCH_AXES].sort())
  })
})

describe('les onze motifs d’exclusion', () => {
  it('sont onze et forment une liste fermée', () => {
    expect(EXCLUSION_REASONS).toHaveLength(11)
  })

  it('portent tous une nature — aucun motif sans effet déclaré', () => {
    for (const reason of EXCLUSION_REASONS) expect(EXCLUSION_SEVERITY[reason]).toBeDefined()
  })
})

describe('matchScoreIsMeasured', () => {
  const axis = (score: number | null) => ({ score })

  it('refuse un score quand AUCUN axe n’a pu être évalué', () => {
    // Le cas du pré-filtrage : le profil est écarté avant les douze axes, le
    // service compose `axes: []` et deux zéros que le contrat impose. Ces deux
    // zéros ne sont pas des notes.
    expect(matchScoreIsMeasured([])).toBe(false)
  })

  it('refuse un score sous trois axes évaluables', () => {
    expect(matchScoreIsMeasured([axis(100), axis(80), axis(null)])).toBe(false)
  })

  it('rend un score dès trois axes évaluables, les non évaluables ne comptant pas', () => {
    expect(matchScoreIsMeasured([axis(100), axis(80), axis(70), axis(null), axis(null)])).toBe(true)
  })

  it('compte un axe à ZÉRO comme évalué — zéro mesuré n’est pas non mesuré', () => {
    // La symétrie de la règle : « non mesuré n'est pas zéro » ne veut pas dire
    // « zéro n'est pas mesuré ». Un axe noté 0 a été regardé.
    expect(matchScoreIsMeasured([axis(0), axis(0), axis(0)])).toBe(true)
  })

  it('ne compte pas un axe à poids 0 (#2176.13) : il ne fait pas passer un profil en « mesuré »', () => {
    expect(
      matchScoreIsMeasured([
        { axis: 'must_have' as const, score: 100 },
        { axis: 'sector' as const, score: 80 },
        { axis: 'comparable_experience' as const, score: 100 },
      ]),
    ).toBe(false)
  })
})

describe('normaliseMatchWeights', () => {
  it('rend exactement 100 quelle que soit l’échelle donnée', () => {
    const doubled = normaliseMatchWeights(
      Object.fromEntries(MATCH_AXES.map(axis => [axis, MATCH_AXIS_WEIGHTS[axis] * 2])),
    )
    expect(Object.values(doubled).reduce((sum, value) => sum + value, 0)).toBe(100)
    expect(doubled).toEqual(MATCH_AXIS_WEIGHTS)
  })

  it('somme à 100 même sur des poids qui ne tombent pas juste', () => {
    const odd = normaliseMatchWeights(Object.fromEntries(MATCH_AXES.map(axis => [axis, 7])))
    expect(Object.values(odd).reduce((sum, value) => sum + value, 0)).toBe(100)
  })

  it('retombe sur les défauts quand tous les poids valent zéro', () => {
    // Un réglage absurde dégrade vers le comportement connu, il ne divise pas par zéro.
    expect(normaliseMatchWeights(Object.fromEntries(MATCH_AXES.map(axis => [axis, 0])))).toEqual(MATCH_AXIS_WEIGHTS)
  })

  it('complète les axes absents avec leur poids par défaut', () => {
    expect(normaliseMatchWeights({ must_have: MATCH_AXIS_WEIGHTS.must_have })).toEqual(MATCH_AXIS_WEIGHTS)
  })

  it('est stable — deux appels sur la même entrée rendent la même pondération', () => {
    const input = { must_have: 40, availability: 30, rate: 3 }
    expect(normaliseMatchWeights(input)).toEqual(normaliseMatchWeights(input))
  })
})

describe('deriveMatchVerdict (#2330.1/.5/.3/.9 — LAU-FINAL-071)', () => {
  const exclusion = (
    severity: ExclusionSeverity,
    detail = 'compétence obligatoire absente : test',
  ): MatchExclusion => ({
    reason: 'missing_required_skill',
    severity,
    detail,
  })

  it('rend fortement_defendable sur le bloc recommandé', () => {
    expect(deriveMatchVerdict('recommended', [])).toBe('fortement_defendable')
  })

  it('rend non_evaluable sur le bloc non évaluable', () => {
    expect(deriveMatchVerdict('not_evaluable', [exclusion('not_evaluable')])).toBe('non_evaluable')
  })

  it('rend non_defendable sur le bloc écarté', () => {
    expect(deriveMatchVerdict('excluded', [exclusion('blocking')])).toBe('non_defendable')
  })

  it('sépare "limites" en deux verdicts : alternative si un blocage existe, à qualifier sinon', () => {
    // `classify()` (engine.ts) range en `borderline` DEUX situations distinctes :
    // un blocage décisif malgré une bonne correspondance (compromis identifiable),
    // ou aucun blocage mais un poussable sous le seuil (rien ne bloque, mais il
    // reste à confirmer). Le verdict les NOMME séparément sans toucher au bucket.
    expect(deriveMatchVerdict('borderline', [exclusion('blocking')])).toBe('alternative')
    expect(deriveMatchVerdict('borderline', [exclusion('warning')])).toBe('a_qualifier')
    expect(deriveMatchVerdict('borderline', [])).toBe('a_qualifier')
  })

  it('NO-GO (#2330.3/.9) : une exclusion bloquante n’est jamais fortement défendable, sur aucun bucket', () => {
    for (const bucket of MATCH_BUCKETS) {
      expect(deriveMatchVerdict(bucket, [exclusion('blocking')])).not.toBe('fortement_defendable')
    }
  })
})

describe('matchNextAction (#2330.6 — LAU-FINAL-071)', () => {
  const exclusion = (
    severity: ExclusionSeverity,
    detail = 'compétence obligatoire absente : test',
  ): MatchExclusion => ({
    reason: 'missing_required_skill',
    severity,
    detail,
  })

  it('ne propose rien sur un profil non défendable — il n’y a rien à faire avec CE profil', () => {
    expect(matchNextAction('non_defendable', { exclusions: [], questionsToValidate: [] })).toBeNull()
  })

  it('reprend le motif bloquant sur une alternative — c’est le compromis à vérifier', () => {
    expect(matchNextAction('alternative', { exclusions: [exclusion('blocking')], questionsToValidate: [] })).toContain(
      'compétence obligatoire absente',
    )
  })

  it('reprend la première question à valider sur un profil à qualifier', () => {
    expect(
      matchNextAction('a_qualifier', {
        exclusions: [],
        questionsToValidate: ['confirmer la disponibilité annoncée'],
      }),
    ).toContain('confirmer la disponibilité annoncée')
  })

  it('invite à compléter la fiche sur un profil non évaluable', () => {
    expect(matchNextAction('non_evaluable', { exclusions: [], questionsToValidate: [] })).toMatch(/compléter/)
  })

  it('invite à proposer le profil sur un profil fortement défendable', () => {
    expect(matchNextAction('fortement_defendable', { exclusions: [], questionsToValidate: [] })).toMatch(/proposer/)
  })
})
