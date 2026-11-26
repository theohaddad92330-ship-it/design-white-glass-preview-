import { describe, expect, it } from 'vitest'
import { opportunityReadiness } from './opportunity-readiness.js'

/**
 * READINESS (BEL-SC-237, #3266.16) — « dimensions connues, dimensions
 * manquantes, blocage principal, prochaine question, niveau de confiance »,
 * en UNE lecture combinant deux barèmes qui existaient déjà séparément :
 * `btmmpCompleteness` (six axes, annexe méthodo p21) et les manques
 * « opportunité » du barème anti-inflation (`opportunity-ontology.ts`).
 *
 * Ce module ne recalcule ni l'un ni l'autre (GA-26) : il les COMBINE et
 * nomme ce qu'aucun des deux ne dit seul — le blocage LE PLUS urgent.
 */
describe('opportunityReadiness', () => {
  it('nomme le blocage « opportunité » avant tout axe BTMMP manquant', () => {
    const r = opportunityReadiness({
      btmmp: null,
      evidenceGaps: ['no_fit', 'no_perimeter'],
      confidence: 'medium',
    })
    expect(r.main_blocker).toEqual({ kind: 'evidence', gap: 'no_fit' })
    expect(r.missing).toEqual(['budget', 'timing', 'mission', 'management', 'process', 'nextStep'])
  })

  it('retombe sur le premier axe BTMMP manquant une fois les manques « opportunité » comblés', () => {
    const r = opportunityReadiness({
      btmmp: { budget: 'TJM 600', timing: 'Q4' },
      evidenceGaps: [],
      confidence: 'high',
    })
    expect(r.main_blocker).toEqual({ kind: 'btmmp', axis: 'mission' })
  })

  it('ne nomme aucun blocage quand tout est rempli', () => {
    const r = opportunityReadiness({
      btmmp: {
        budget: 'TJM 600',
        timing: 'Q4',
        mission: 'reprise SOC',
        management: 'RSSI',
        process: 'panel via achats',
        nextStep: 'RDV jeudi',
      },
      evidenceGaps: [],
      confidence: 'high',
    })
    expect(r.main_blocker).toBeNull()
    expect(r.missing).toEqual([])
  })

  it('respecte l’ordre de priorité des manques « opportunité »', () => {
    const r = opportunityReadiness({
      btmmp: null,
      evidenceGaps: ['no_next_action', 'no_decision_maker', 'not_expressed'],
      confidence: null,
    })
    expect(r.main_blocker).toEqual({ kind: 'evidence', gap: 'not_expressed' })
  })

  it('un BTMMP absent nomme les six axes comme manquants, jamais comme un score de zéro sur rien', () => {
    const r = opportunityReadiness({ btmmp: undefined, evidenceGaps: [], confidence: null })
    expect(r.known).toEqual([])
    expect(r.missing).toHaveLength(6)
  })

  it('porte la confiance telle que fournie par l’appelant — jamais recalculée ici', () => {
    const r = opportunityReadiness({ btmmp: null, evidenceGaps: [], confidence: 'low' })
    expect(r.confidence).toBe('low')
  })
})
