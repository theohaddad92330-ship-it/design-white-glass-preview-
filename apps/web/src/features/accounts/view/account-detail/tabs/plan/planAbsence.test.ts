import { describe, expect, it } from 'vitest'
import { planAbsence } from './planAbsence'

describe('planAbsence', () => {
  it("dit que l'analyse est en cours plutôt que d'annoncer un plan vide", () => {
    expect(planAbsence({ status: 'analyzing', last_analyzed_at: null })).toBe('analysis-running')
  })

  it("n'accuse pas l'utilisateur quand la dernière analyse a échoué", () => {
    // Le cas des 8 `PHASE_TIMEOUT` sur `phase=plan` mesurés en production sur
    // 30 jours : le dossier existe, la phase 4 n'a pas rendu son plan.
    expect(planAbsence({ status: 'error', last_analyzed_at: '2026-08-28T12:33:26.000Z' })).toBe('analysis-incomplete')
  })

  it('traite une analyse annulée comme une analyse non terminée, pas comme un plan vide', () => {
    expect(planAbsence({ status: 'canceled', last_analyzed_at: null })).toBe('analysis-incomplete')
  })

  it("dit qu'un dossier jamais analysé n'a pas encore de plan", () => {
    expect(planAbsence({ status: 'prospect', last_analyzed_at: null })).toBe('not-analyzed')
  })

  it("ne prétend pas qu'un dossier ANALYSÉ n'a jamais été analysé, même sans date", () => {
    // `run_skipped` (portail go/no-go) marque le compte `completed` sans que la
    // phase 4 ait tourné. Écrire « pas encore analysé » serait faux.
    expect(planAbsence({ status: 'completed', last_analyzed_at: null })).toBe('no-actions')
  })

  it("garde la copie d'origine quand l'analyse a réussi et que le plan est réellement vide", () => {
    expect(planAbsence({ status: 'completed', last_analyzed_at: '2026-08-28T12:33:26.000Z' })).toBe('no-actions')
  })

  it("tolère l'absence de la date, que l'API rend optionnelle", () => {
    expect(planAbsence({ status: 'completed' })).toBe('no-actions')
  })
})
