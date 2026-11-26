import { describe, expect, it } from 'vitest'
import { buildProvisionalScore } from './provisionalScore'
import type { EvaluationViewData } from './evaluationViewData'
import type { ScoreFactorView } from './scoreFactors'

function axis(label: string, weight: number, max = 5): ScoreFactorView {
  return { label, proofType: 'signal', weight, max, kind: 'axis' }
}

function data(partial: Partial<EvaluationViewData>): EvaluationViewData {
  return {
    confidence: 80,
    qualityCapped: false,
    scoreFactors: [],
    ...partial,
  } as EvaluationViewData
}

describe('buildProvisionalScore (TF1 p28)', () => {
  it('annonce la note comme provisoire quand l’IA a plafonné faute de matière', () => {
    const res = buildProvisionalScore(data({ qualityCapped: true }))
    expect(res.provisional).toBe(true)
    expect(res.reason).toBe('qualityCapped')
  })

  it('annonce provisoire quand la confiance donnée est basse', () => {
    const res = buildProvisionalScore(data({ confidence: 42 }))
    expect(res.provisional).toBe(true)
    expect(res.reason).toBe('weakConfidence')
  })

  it('une note appuyée sur des données complètes reste ferme', () => {
    const res = buildProvisionalScore(data({ confidence: 88 }))
    expect(res.provisional).toBe(false)
    expect(res.reason).toBeNull()
  })

  it('classe les leviers du plus gros écart au maximum au plus petit', () => {
    const res = buildProvisionalScore(
      data({ qualityCapped: true, scoreFactors: [axis('Accessibilité', 2), axis('Concurrence', 0)] }),
    )
    expect(res.levers.map(l => l.label)).toEqual(['Concurrence', 'Accessibilité'])
  })

  it('un axe déjà bien noté n’est pas un levier', () => {
    const res = buildProvisionalScore(data({ qualityCapped: true, scoreFactors: [axis('Fit offre', 4)] }))
    expect(res.levers).toEqual([])
  })

  it('ne conseille rien quand le dossier ne porte aucun facteur', () => {
    const res = buildProvisionalScore(data({ qualityCapped: true }))
    expect(res.levers).toEqual([])
  })
})
