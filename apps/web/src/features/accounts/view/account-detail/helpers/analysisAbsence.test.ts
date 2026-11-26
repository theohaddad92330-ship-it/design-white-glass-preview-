import { describe, expect, it } from 'vitest'
import { accountAnalysisAbsence } from './analysisAbsence'

/**
 * #2502.2 — la même classification que `planAbsence` (tome, `plan/planAbsence.ts`),
 * généralisée : POURQUOI une section dérivée de l'analyse est vide dépend de
 * l'état de l'analyse, pas de la section qui la lit. `planAbsence` devient un
 * alias de cette fonction (voir `plan/planAbsence.ts`) — une seule
 * implémentation, GA-26.
 */
describe('accountAnalysisAbsence', () => {
  it("dit que l'analyse est en cours plutôt que d'annoncer une section vide", () => {
    expect(accountAnalysisAbsence({ status: 'analyzing', last_analyzed_at: null })).toBe('analysis-running')
  })

  it("n'accuse pas l'utilisateur quand la dernière analyse a échoué", () => {
    expect(accountAnalysisAbsence({ status: 'error', last_analyzed_at: '2026-08-28T12:33:26.000Z' })).toBe(
      'analysis-incomplete',
    )
  })

  it('traite une analyse annulée comme une analyse non terminée', () => {
    expect(accountAnalysisAbsence({ status: 'canceled', last_analyzed_at: null })).toBe('analysis-incomplete')
  })

  it("dit qu'un dossier jamais analysé n'a pas encore de section", () => {
    expect(accountAnalysisAbsence({ status: 'prospect', last_analyzed_at: null })).toBe('not-analyzed')
  })

  it("ne prétend pas qu'un dossier ANALYSÉ n'a jamais été analysé, même sans date", () => {
    expect(accountAnalysisAbsence({ status: 'completed', last_analyzed_at: null })).toBe('analysis-complete')
  })

  it("dit que l'analyse a abouti quand elle a réellement abouti", () => {
    expect(accountAnalysisAbsence({ status: 'completed', last_analyzed_at: '2026-08-28T12:33:26.000Z' })).toBe(
      'analysis-complete',
    )
  })

  it("tolère l'absence de la date, que l'API rend optionnelle", () => {
    expect(accountAnalysisAbsence({ status: 'completed' })).toBe('analysis-complete')
  })
})
