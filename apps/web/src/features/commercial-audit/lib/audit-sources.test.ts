import { describe, expect, it } from 'vitest'
import { AUDIT_COMPUTED_BLOCK_STAGES, AUDIT_HEADLINE_SOURCES, answerQuestionOf, answerStageOf } from './audit-sources'

// #4425.1 — une table « d'où vient cette valeur » qui ment (une clé qui n'existe
// plus, une étape qui ne la pose pas) enverrait la personne corriger au mauvais endroit.
describe('audit-sources', () => {
  it('chaque champ source d’un en-tête est une vraie question du questionnaire, avec son étape', () => {
    for (const [headline, keys] of Object.entries(AUDIT_HEADLINE_SOURCES)) {
      expect(keys.length, headline).toBeGreaterThan(0)
      for (const key of keys) {
        expect(answerQuestionOf(key), `${headline} ← ${key}`).not.toBeNull()
        expect(answerStageOf(key), `${headline} ← ${key}`).not.toBeNull()
      }
    }
  })

  it('une clé inconnue du questionnaire dit NON (null), jamais une étape devinée', () => {
    expect(answerQuestionOf('not_a_question' as never)).toBeNull()
    expect(answerStageOf('not_a_question' as never)).toBeNull()
  })

  it('le mode d’intervention vient de l’étape Offre, le frein de l’étape Marché', () => {
    expect(answerStageOf('positioning')).toBe('offer_expertise')
    expect(answerStageOf('main_sales_pain')).toBe('target_market')
  })

  it('chaque bloc calculé nomme au moins une étape qui existe', () => {
    for (const [block, stages] of Object.entries(AUDIT_COMPUTED_BLOCK_STAGES)) {
      expect(stages.length, block).toBeGreaterThan(0)
      for (const stage of stages) expect(['company_info', 'offer_expertise', 'target_market'], block).toContain(stage)
    }
  })
})
