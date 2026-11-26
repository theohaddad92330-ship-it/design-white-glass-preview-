import type { EsnAnswers } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildFramingExport, framingAnswerCount, stageProgress } from './framing'
import { TEMPS1_STAGES } from '@/features/onboarding/lib/questions'

const NOW = '2026-10-22T10:00:00.000Z'

/**
 * Théo D settings-espace.N2 — le cadrage compté et exporté : une seule lecture de « renseignée » (GA-26), et un
 * fichier qui ne contient QUE ce qui a été répondu.
 */
describe('framing — progression et export du cadrage', () => {
  it('LIT les vrais thèmes du questionnaire (une garde qui compterait zéro thème serait verte à vide)', () => {
    expect(TEMPS1_STAGES.length).toBeGreaterThan(0)
    expect(stageProgress(TEMPS1_STAGES[0]!, {} as EsnAnswers).total).toBeGreaterThan(0)
  })

  it('une réponse donnée augmente le total, jamais plus que le nombre de questions', () => {
    const before = framingAnswerCount({} as EsnAnswers)
    const after = framingAnswerCount({ esn_name: 'Altaïs Conseil' } as EsnAnswers)
    expect(after).toBe(before + 1)
  })

  it('l’export ne contient que les réponses données, rangées par thème', () => {
    const exported = buildFramingExport({ esn_name: 'Altaïs Conseil' } as EsnAnswers, NOW)
    expect(exported.exportedAt).toBe(NOW)
    expect(exported.themes).toEqual([{ theme: 'company_info', answers: { esn_name: 'Altaïs Conseil' } }])
  })

  it('NON : aucune réponse = aucun thème dans le fichier — jamais de clé vide ni de zéro', () => {
    expect(buildFramingExport({} as EsnAnswers, NOW).themes).toEqual([])
    expect(buildFramingExport({ esn_name: '   ' } as EsnAnswers, NOW).themes).toEqual([])
  })
})
