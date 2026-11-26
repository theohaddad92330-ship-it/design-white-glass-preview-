import { describe, expect, it } from 'vitest'
import {
  METHOD_RULE_CONTRADICTION_MIN_OUTCOMES,
  classifyRuleOutcome,
  METHOD_RULE_CADENCE_FOLLOW_UP,
  METHOD_RULE_PLAN_STEP,
  computeContradictedRuleIds,
  workspaceDeactivatedRuleIds,
  learnedRuleRef,
  parseLearnedRuleRef,
  tallyLearnedRuleOutcomes,
} from './method-rule-outcomes.js'
import { METHOD_CORPUS_V1 } from './method-corpus.js'

const rows = (rule: string, outcome: string, n: number) =>
  Array.from({ length: n }, () => ({ method_rule: rule, outcome }))

describe('classifyRuleOutcome — #3264.41', () => {
  it('un résultat positif, un négatif, et ce qui ne dit rien de la règle', () => {
    expect(classifyRuleOutcome('meeting_booked')).toBe('positive')
    expect(classifyRuleOutcome('no_response')).toBe('negative')
    expect(classifyRuleOutcome('declined')).toBe('negative')
    for (const outcome of ['wrong_contact', 'technical_error', 'other', 'abandoned', null]) {
      expect(classifyRuleOutcome(outcome)).toBeNull()
    }
  })
})

describe('computeContradictedRuleIds — #3264.41', () => {
  const N = METHOD_RULE_CONTRADICTION_MIN_OUTCOMES

  it('une règle suivie N fois sans AUCUN résultat positif est contredite par cet espace', () => {
    expect(computeContradictedRuleIds(rows('r1', 'no_response', N))).toEqual(['r1'])
  })

  it('NON — sous le seuil, rien n’est contredit (le silence de deux relances n’est pas un verdict)', () => {
    expect(computeContradictedRuleIds(rows('r1', 'no_response', N - 1))).toEqual([])
  })

  it('NON — un seul résultat positif suffit à ne pas contredire', () => {
    expect(computeContradictedRuleIds([...rows('r1', 'no_response', N), ...rows('r1', 'positive', 1)])).toEqual([])
  })

  it('NON — les résultats hors sujet (mauvais contact, erreur technique) ne comptent pas dans le seuil', () => {
    expect(
      computeContradictedRuleIds([...rows('r1', 'no_response', N - 1), ...rows('r1', 'wrong_contact', 10)]),
    ).toEqual([])
  })

  it('juge chaque règle séparément et rend un ordre stable', () => {
    const out = computeContradictedRuleIds([
      ...rows('b', 'declined', N),
      ...rows('a', 'no_answer', N),
      ...rows('c', 'positive', N),
    ])
    expect(out).toEqual(['a', 'b'])
  })
})

describe('workspaceDeactivatedRuleIds — #3274.4 : resolveRuleActivation sur le chemin réel', () => {
  const N = METHOD_RULE_CONTRADICTION_MIN_OUTCOMES
  const covered = 'couverture_multi_roles_niveaux_entites'

  it('une règle du corpus que l’espace a contredite est désactivée POUR cet espace', () => {
    expect(workspaceDeactivatedRuleIds(rows(covered, 'no_response', N))).toEqual([covered])
  })

  it('NON — sous le seuil, ou avec un seul succès, rien n’est désactivé', () => {
    expect(workspaceDeactivatedRuleIds(rows(covered, 'no_response', N - 1))).toEqual([])
    expect(
      workspaceDeactivatedRuleIds([...rows(covered, 'no_response', N), ...rows(covered, 'meeting_booked', 1)]),
    ).toEqual([])
  })

  it('NON — un identifiant inconnu du corpus n’est pas une règle qu’on désactive', () => {
    expect(workspaceDeactivatedRuleIds(rows('regle_inventee', 'no_response', N))).toEqual([])
  })

  it('NON — une règle déjà désactivée GLOBALEMENT n’a rien à écarter pour l’espace', () => {
    const corpus = {
      ...METHOD_CORPUS_V1,
      governance: METHOD_CORPUS_V1.governance.map(g => (g.rule_id === covered ? { ...g, enabled: false } : g)),
    }
    expect(workspaceDeactivatedRuleIds(rows(covered, 'no_response', N), corpus)).toEqual([])
  })
})

describe('les règles que les écrivains d’actions posent — #3274.4', () => {
  it('chacune existe dans METHOD_CORPUS_V1, et elles sont distinctes de celle du contact', () => {
    const known = new Set(METHOD_CORPUS_V1.rules.map(rule => rule.rule_id))
    expect(known.has(METHOD_RULE_PLAN_STEP)).toBe(true)
    expect(known.has(METHOD_RULE_CADENCE_FOLLOW_UP)).toBe(true)
    expect(
      new Set([METHOD_RULE_PLAN_STEP, METHOD_RULE_CADENCE_FOLLOW_UP, 'couverture_multi_roles_niveaux_entites']).size,
    ).toBe(3)
  })
})

/**
 * #3295 (A/B par règle promue) — l'ATTRIBUTION : une action peut citer une règle
 * apprise de l'espace (`learned:<uuid>`), et ses issues se comptent par règle.
 * Des comptes, jamais un taux ni une comparaison devinée.
 */
describe('règle apprise — attribution et mesure (#3295)', () => {
  const ID = '0b9f3a52-6c1e-4c53-9b7e-2f4f1f0a9d11'

  it('la référence aller-retour, et refuse tout ce qui n’en est pas une', () => {
    expect(parseLearnedRuleRef(learnedRuleRef(ID))).toBe(ID)
    expect(parseLearnedRuleRef('couverture_multi_roles_niveaux_entites')).toBeNull()
    expect(parseLearnedRuleRef('learned:pas-un-uuid')).toBeNull()
    expect(parseLearnedRuleRef(null)).toBeNull()
  })

  it('compte suivies / positives / négatives / sans effet / en attente, par règle', () => {
    const ref = learnedRuleRef(ID)
    const tally = tallyLearnedRuleOutcomes([
      { method_rule: ref, outcome: 'meeting_booked', execution_status: 'done' },
      { method_rule: ref, outcome: 'no_response', execution_status: 'done' },
      { method_rule: ref, outcome: 'wrong_contact', execution_status: 'done' },
      { method_rule: ref, outcome: null, execution_status: 'pending' },
      { method_rule: 'couverture_multi_roles_niveaux_entites', outcome: 'positive', execution_status: 'done' },
    ])
    expect(tally).toEqual([
      { rule_id: ID, followed: 4, positive: 1, negative: 1, inconclusive: 1, open: 1, contradicted: false },
    ])
  })

  it('contredite : même seuil que le corpus, zéro succès — jamais en dessous', () => {
    const ref = learnedRuleRef(ID)
    const done = (outcome: string, n: number) =>
      Array.from({ length: n }, () => ({ method_rule: ref, outcome, execution_status: 'done' }))
    expect(tallyLearnedRuleOutcomes(done('no_response', METHOD_RULE_CONTRADICTION_MIN_OUTCOMES))[0]?.contradicted).toBe(
      true,
    )
    expect(
      tallyLearnedRuleOutcomes(done('no_response', METHOD_RULE_CONTRADICTION_MIN_OUTCOMES - 1))[0]?.contradicted,
    ).toBe(false)
    expect(
      tallyLearnedRuleOutcomes([
        ...done('no_response', METHOD_RULE_CONTRADICTION_MIN_OUTCOMES),
        ...done('meeting_booked', 1),
      ])[0]?.contradicted,
    ).toBe(false)
  })
})
