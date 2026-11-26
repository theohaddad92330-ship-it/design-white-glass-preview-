import { describe, expect, it } from 'vitest'
import { deriveCompleteness } from './completeness.js'
import { EXPLAINABLE_NUMBERS, canExplainNumber, type NumberExplanation } from './number-explanation.js'

/** Le taux d'intercontrat du §5.1, recopié de la source. */
function explanation(over: Partial<NumberExplanation> = {}): NumberExplanation {
  return {
    metric: 'bench_rate',
    formula: 'consultants sans affectation active / effectif total',
    calculation: '7 / 56',
    source: { label: 'mission_assignments', computedAt: '2026-09-01T06:12:00.000Z' },
    completeness: { counted: 53, total: 56, excluded: ['3 consultants sans affectation renseignée'] },
    thresholds: ['< 5 % piloté', '> 15 % critique'],
    decision: 'si > 10 % : plan de push profils, revue des TJM',
    ...over,
  }
}

describe('canExplainNumber — un chiffre qui ne sait pas expliquer n’affiche pas le geste', () => {
  it('accepte une explication complète', () => {
    expect(canExplainNumber(explanation())).toBe(true)
  })

  it('refuse quand il n’y a rien à expliquer', () => {
    expect(canExplainNumber(null)).toBe(false)
    expect(canExplainNumber(undefined)).toBe(false)
  })

  it('refuse une FORMULE vide — le panneau ne répondrait pas à la question', () => {
    expect(canExplainNumber(explanation({ formula: '   ' }))).toBe(false)
  })

  it('refuse un CALCUL non lu — c’est ce que l’utilisateur venait chercher', () => {
    expect(canExplainNumber(explanation({ calculation: null }))).toBe(false)
    expect(canExplainNumber(explanation({ calculation: '' }))).toBe(false)
  })

  it('refuse une SOURCE vide — un chiffre sans origine n’est pas vérifiable', () => {
    expect(canExplainNumber(explanation({ source: { label: '', computedAt: null } }))).toBe(false)
  })

  it('accepte une date de calcul INCONNUE — « quand » manque, pas « quoi »', () => {
    expect(canExplainNumber(explanation({ source: { label: 'mission_assignments', computedAt: null } }))).toBe(true)
  })

  it('accepte les QUATRE verdicts de complétude, y compris un total non lu', () => {
    // « Calculé sur 12 comptes, population totale non lue » est une réponse
    // honnête. La refuser ferait disparaître le geste là où il sert le plus.
    for (const completeness of [
      { counted: 53, total: 56 },
      { counted: 56, total: 56 },
      { counted: 12, total: null },
      { counted: 0, total: 0 },
    ]) {
      expect(canExplainNumber(explanation({ completeness }))).toBe(true)
    }
  })

  it('accepte l’ABSENCE de seuil et de décision — on n’en invente pas', () => {
    expect(canExplainNumber(explanation({ thresholds: [], decision: null }))).toBe(true)
  })
})

describe('la ligne COMPLÉTUDE — obligatoire, et elle NOMME ce qui est sorti', () => {
  it('rend la phrase partielle du §5.1 : 53 sur 56, 3 écartés et nommés', () => {
    const verdict = deriveCompleteness(explanation().completeness)
    expect(verdict.kind).toBe('partial')
    if (verdict.kind === 'partial') {
      expect(verdict.counted).toBe(53)
      expect(verdict.total).toBe(56)
      expect(verdict.share).toBe(95)
    }
    expect(verdict.excluded).toEqual(['3 consultants sans affectation renseignée'])
  })

  it('ne peut pas être omise — le type la rend obligatoire', () => {
    // @ts-expect-error `completeness` manque : c'est exactement ce qu'on interdit.
    const incomplete: NumberExplanation = {
      metric: 'dso_days',
      formula: 'médiane des délais de paiement',
      calculation: '12 factures',
      source: { label: 'invoice_readiness', computedAt: null },
      thresholds: [],
      decision: null,
    }
    expect(incomplete).toBeDefined()
  })
})

describe('EXPLAINABLE_NUMBERS — les chiffres réellement dotés du geste', () => {
  it('en nomme QUATRE, livrés complètement', () => {
    expect(EXPLAINABLE_NUMBERS).toEqual(['bench_rate', 'gross_margin', 'dso_days', 'signed_revenue'])
  })
})
