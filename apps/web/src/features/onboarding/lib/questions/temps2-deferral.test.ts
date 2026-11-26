import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS } from '@bellum/contracts'
import {
  TEMPS1_DEFERRED_QUESTIONS,
  TEMPS1_QUESTION_KEYS,
  TEMPS1_STAGES,
  TEMPS1_SUBSTEPS,
  isDeferredToTemps2,
  isQuestionVisible,
  stageQuestions,
} from './index'

/**
 * #2626.1 — « tenir le Temps 1 sous cinq minutes ».
 *
 * Mesuré avant ce lot : 135 questions posées, 125 bloquant « Continuer », pour
 * une porte de complétion qui en exige 10. Arbitrage Louis du 20/09/2026 :
 * **les 125 basculent en Temps 2** (l'option « on les rend facultatives, elles
 * restent affichées » lui a été proposée et refusée).
 *
 * Ce que ce fichier garde :
 *  1. le Temps 1 ne pose plus QUE ce qu'il exige ;
 *  2. rien n'est perdu — tout ce qui sort du Temps 1 est REPRIS, nommément,
 *     par `TEMPS1_DEFERRED_QUESTIONS`, l'entrée du Temps 2 ;
 *  3. une sous-étape vidée disparaît du parcours au lieu d'afficher une page
 *     blanche.
 */
const ALL_QUESTIONS = TEMPS1_STAGES.flatMap(stageQuestions)

describe('#2626.1 — les questions non exigées basculent en Temps 2', () => {
  it('le catalogue garde ses 135 questions — on archive, on ne supprime pas', () => {
    expect(ALL_QUESTIONS.length).toBeGreaterThanOrEqual(135)
  })

  it('le Temps 1 ne POSE plus que les 10 clés exigées', () => {
    expect([...new Set(TEMPS1_QUESTION_KEYS)].sort()).toEqual([...TEMPS1_REQUIRED_KEYS].sort())
  })

  it('tout ce qui sort du Temps 1 est repris par le Temps 2, un pour un', () => {
    const deferred = ALL_QUESTIONS.filter(isDeferredToTemps2)
    expect(TEMPS1_DEFERRED_QUESTIONS.map(q => q.key)).toEqual(deferred.map(q => q.key))
    // La partition est totale : posée au Temps 1 + reportée au Temps 2 = tout.
    expect(TEMPS1_QUESTION_KEYS.length + TEMPS1_DEFERRED_QUESTIONS.length).toBe(ALL_QUESTIONS.length)
    expect(TEMPS1_DEFERRED_QUESTIONS.length).toBeGreaterThan(100)
  })

  it('une question reportée n’est JAMAIS visible au Temps 1, même condition remplie', () => {
    const reportee = TEMPS1_DEFERRED_QUESTIONS.find(q => !q.when)
    expect(reportee).toBeDefined()
    expect(isQuestionVisible(reportee!, {})).toBe(false)
  })

  it('une question exigée reste visible, elle n’est pas emportée par le tri', () => {
    const exigee = ALL_QUESTIONS.find(q => q.key === 'esn_name')
    expect(exigee).toBeDefined()
    expect(isDeferredToTemps2(exigee!)).toBe(false)
    expect(isQuestionVisible(exigee!, {})).toBe(true)
  })

  it('aucune sous-étape du parcours n’est vide — une page blanche n’est pas une étape', () => {
    expect(TEMPS1_SUBSTEPS.length).toBeGreaterThan(0)
    for (const sub of TEMPS1_SUBSTEPS) {
      expect(sub.questions.length).toBeGreaterThan(0)
    }
    // Les index restent contigus après le retrait des sous-étapes vidées.
    expect(TEMPS1_SUBSTEPS.map(s => s.index)).toEqual(TEMPS1_SUBSTEPS.map((_, i) => i))
  })

  it('les 10 clés exigées restent toutes ATTEIGNABLES dans le parcours', () => {
    const posees = new Set(TEMPS1_SUBSTEPS.flatMap(s => s.questions.map(q => q.key)))
    for (const key of TEMPS1_REQUIRED_KEYS) {
      expect(posees.has(key)).toBe(true)
    }
  })
})
