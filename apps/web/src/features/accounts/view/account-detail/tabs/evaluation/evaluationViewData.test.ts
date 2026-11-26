import type { Account } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildEvaluationViewData } from './evaluationViewData'

describe('buildEvaluationViewData', () => {
  it('normalizes root quick wins with operational details', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: {
          quick_wins: [
            {
              action: 'Contacter Al',
              channel: 'linkedin',
              contact: 'Al (Data Scientist)',
              time_required: '< 5 minutes',
              expected_impact: 'Ouvrir une conversation.',
            },
          ],
        },
      }),
    )

    expect(data.quickWins).toEqual([
      {
        text: 'Contacter Al — Al (Data Scientist) · linkedin · < 5 minutes · Ouvrir une conversation.',
        // Dossier sans traçabilité : aucune date ni preuve inventée (p28).
        computedAt: null,
        proofType: null,
        proof: null,
        proofDate: null,
      },
    ])
  })

  it('normalizes root risks with qualification details', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: {
          evaluation: {
            risks: [
              {
                risk: 'Absence de décideur budgétaire',
                impact: 'important',
                mitigation: 'Obtenir une introduction vers le Head of AI.',
                probability: 'haute',
              },
            ],
          },
        },
      }),
    )

    expect(data.risks).toEqual([
      {
        text: 'Absence de décideur budgétaire — haute · important · Obtenir une introduction vers le Head of AI.',
        computedAt: null,
        proofType: null,
        proof: null,
        proofDate: null,
      },
    ])
  })

  it('carries the recompute date and the proof of a quick win (p28)', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: {
          quick_wins: [
            {
              action: 'Envoyer un message LinkedIn',
              computed_at: '2026-07-22T09:00:00+00:00',
              proof_type: 'signal',
              proof: 'Recrutement plateforme streaming — France Travail',
              proof_date: '2026-05-12',
            },
          ],
        },
      }),
    )

    expect(data.quickWins[0]).toMatchObject({
      computedAt: '2026-07-22T09:00:00+00:00',
      proofType: 'signal',
      proof: 'Recrutement plateforme streaming — France Travail',
      proofDate: '2026-05-12',
    })
  })

  it('keeps the dated item when the same list also exists un-dated elsewhere', () => {
    // Le même quick win peut vivre sous `plan` (daté, recalculé) et sous
    // `evaluation` (copie historique). La 1re occurrence gagne : celle du plan.
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: {
          evaluation: { quick_wins: [{ action: 'Appeler la DSI', computed_at: '2026-07-22T09:00:00+00:00' }] },
          quick_wins: [{ action: 'Appeler la DSI' }],
        },
      }),
    )

    expect(data.quickWins).toHaveLength(1)
    expect(data.quickWins[0]?.computedAt).toBe('2026-07-22T09:00:00+00:00')
  })

  it('surfaces the two axes: confidence + tier and the score factors (Théo P1)', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        confidence: { score: 38, tier: 'low' },
        plan: {
          commercialScore: 80,
          scoreFactors: [
            { label: 'Accessibilité commerciale', proof_type: 'contact', weight: 5, kind: 'axis', max: 5 },
            { label: 'Verdict GO — règle /25', proof_type: 'business_rule', weight: 21, kind: 'total', max: 25 },
          ],
        },
      }),
    )

    expect(data.confidence).toBe(38)
    expect(data.confidenceTier).toBe('low')
    expect(data.commercialScore).toBe(80)
    expect(data.scoreFactors).toEqual([
      { label: 'Accessibilité commerciale', proofType: 'contact', weight: 5, kind: 'axis', max: 5 },
      { label: 'Verdict GO — règle /25', proofType: 'business_rule', weight: 21, kind: 'total', max: 25 },
    ])
  })

  it('reads the snake_case score_factors mirror and leaves tier null when absent', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        confidence: { score: 72 },
        plan: { score_factors: [{ label: 'Urgence business', proof_type: 'signal' }] },
      }),
    )

    expect(data.confidenceTier).toBeNull()
    expect(data.scoreFactors).toEqual([
      { label: 'Urgence business', proofType: 'signal', weight: null, kind: 'axis', max: null },
    ])
  })

  it('has no factors and null confidence on a bare analysis (backward-compatible)', () => {
    const data = buildEvaluationViewData(accountWithAnalysis({}))
    expect(data.confidence).toBeNull()
    expect(data.confidenceTier).toBeNull()
    expect(data.commercialScore).toBeNull()
    expect(data.scoreFactors).toEqual([])
  })
})

function accountWithAnalysis(rawAnalysis: Record<string, unknown>): Account {
  return {
    priority_score: 3,
    priority_justification: '',
    raw_analysis: rawAnalysis,
  } as Account
}

describe('score /25 canonique + verdict (Annexe méthodo p25, restitution p28/p29)', () => {
  it('lit le score /25 que l’IA calcule, pas seulement la projection /10', () => {
    // `phase4_plan` écrit `evaluation.score` = le /25 canonique (5 axes × 5) et
    // `evaluation.globalScore` = sa projection /10. Le front n'affichait que le
    // /10 : TF1 montrait « 3/10 » sous une grille qui totalise 10/25.
    const data = buildEvaluationViewData(
      accountWithAnalysis({ plan: { evaluation: { score: 10, globalScore: 3, verdict: 'EXPLORER' } } }),
    )
    expect(data.score25).toBe(10)
  })

  it('préfère le verdict CANONIQUE au goNoGo legacy — sinon EXPLORER se perd', () => {
    // Le legacy `goNoGo` mappe EXPLORER → CONDITIONNEL : lire cette clé en
    // priorité effaçait le verdict que l'analyse a réellement rendu.
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: { evaluation: { score: 10, verdict: 'EXPLORER', goNoGo: 'CONDITIONNEL' } },
      }),
    )
    expect(data.goNoGo).toBe('EXPLORER')
  })

  it('retombe sur le goNoGo legacy quand aucun verdict canonique n’est présent', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({ plan: { evaluation: { globalScore: 8, goNoGo: 'GO' } } }),
    )
    expect(data.goNoGo).toBe('GO')
  })

  it('sans score /25 dans le dossier, score25 est null (jamais une valeur inventée)', () => {
    const data = buildEvaluationViewData(accountWithAnalysis({ plan: { evaluation: { globalScore: 6 } } }))
    expect(data.score25).toBeNull()
  })

  it('borne le /25 à sa plage', () => {
    const data = buildEvaluationViewData(accountWithAnalysis({ plan: { evaluation: { score: 99 } } }))
    expect(data.score25).toBe(25)
  })

  // #2932 — le badge « Verdict » de l'onglet Score doit pouvoir distinguer les
  // deux visages de STOP (verdict nommé), sur le même déclencheur que
  // `dossierReadViewData.normalizeNoGo`.
  it('#2932 — hasNoGoTrigger est vrai quand dossier_read.no_go.trigger est renseigné', () => {
    const data = buildEvaluationViewData(
      accountWithAnalysis({
        plan: {
          evaluation: {
            verdict: 'STOP',
            dossier_read: {
              no_go: { temporary: true, context: null, trigger: 'Renouvellement de l’accord-cadre en 2027' },
            },
          },
        },
      }),
    )
    expect(data.hasNoGoTrigger).toBe(true)
  })

  it('#2932 — hasNoGoTrigger est faux sans déclencheur identifié', () => {
    const data = buildEvaluationViewData(accountWithAnalysis({ plan: { evaluation: { verdict: 'STOP' } } }))
    expect(data.hasNoGoTrigger).toBe(false)
  })
})

describe('score non arbitré (D10, recette 06/10/2026)', () => {
  it('relaie `raw_analysis.score_unarbitrated` pour que l’onglet Score ne tranche pas', () => {
    expect(buildEvaluationViewData(accountWithAnalysis({ score_unarbitrated: true })).scoreUnarbitrated).toBe(true)
  })

  it('absent ou faux : le score est arbitré', () => {
    expect(buildEvaluationViewData(accountWithAnalysis({})).scoreUnarbitrated).toBe(false)
  })
})

// #3680.5 (reste de #3777, lot W9) — un score ABSENT n'est pas « 0 » : la valeur rendue est `null`.
describe('buildEvaluationViewData — score absent (#3680.5)', () => {
  it('un dossier sans aucun score en porte `null`, jamais 0', () => {
    const data = buildEvaluationViewData({ id: 'a-1', company_name: 'X', raw_analysis: {} } as never)
    expect(data.score).toBeNull()
    expect(data.hasEvaluation).toBe(false)
    expect(data.goNoGo).toBe('À QUALIFIER')
  })

  it('un score sur le dossier (priority_score) ou dans l’évaluation est lu comme avant', () => {
    expect(buildEvaluationViewData({ id: 'a', priority_score: 8, raw_analysis: {} } as never).score).toBe(8)
    const fromEval = buildEvaluationViewData({
      id: 'a',
      raw_analysis: { evaluation: { score_global: 6 } },
    } as never)
    expect(fromEval.score).toBe(6)
    expect(fromEval.hasEvaluation).toBe(true)
  })

  it('un 0 réellement posé reste 0 (une mesure), et ne fait pas une évaluation', () => {
    const data = buildEvaluationViewData({ id: 'a', priority_score: 0, raw_analysis: {} } as never)
    expect(data.score).toBe(0)
    expect(data.hasEvaluation).toBe(false)
  })
})
