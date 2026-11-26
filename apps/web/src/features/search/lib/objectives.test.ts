import { ANALYSIS_OBJECTIVES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  MAIN_OBJECTIVES,
  OTHER_OBJECTIVES,
  initialObjectives,
  presetForObjectives,
  toggleObjective,
} from './objectives'

// Théo B r1-recherche.R4/N1 — quatre objectifs principaux + « Autres objectifs », choix multiples.
describe('objectifs d’une analyse', () => {
  it('range les huit objectifs de la table du contrat : quatre en vue, quatre repliés, aucun perdu', () => {
    expect(MAIN_OBJECTIVES).toEqual(['open_account', 'prepare_meeting', 'find_decision_makers', 'understand_group'])
    expect([...MAIN_OBJECTIVES, ...OTHER_OBJECTIVES].sort()).toEqual([...ANALYSIS_OBJECTIVES].sort())
  })

  it('le preset de contexte suit le DERNIER objectif choisi, « Autre » sans objectif', () => {
    expect(presetForObjectives(['open_account', 'verify_signal'])).toBe('signal')
    expect(presetForObjectives(['prepare_meeting'])).toBe('known-account')
    expect(presetForObjectives(['map_partners_competitors'])).toBe('incumbent')
    expect(presetForObjectives(['prepare_listing'])).toBe('push-offer')
    expect(presetForObjectives([])).toBe('free')
  })

  it('une arrivée par un preset (Laura, Découvrir, URL) allume l’objectif qui lui correspond', () => {
    expect(initialObjectives('strategic')).toEqual(['open_account'])
    expect(initialObjectives('known-account')).toEqual(['prepare_meeting'])
    expect(initialObjectives('signal')).toEqual(['verify_signal'])
    expect(initialObjectives('free')).toEqual(['other'])
    // « Approfondir une analyse » n’a pas d’objectif propre : rien d’inventé, « un autre objectif ».
    expect(initialObjectives('retry')).toEqual(['other'])
  })

  it('ajoute et retire sans doublon, dans l’ordre des clics', () => {
    expect(toggleObjective(['open_account'], 'find_decision_makers')).toEqual(['open_account', 'find_decision_makers'])
    expect(toggleObjective(['open_account', 'find_decision_makers'], 'open_account')).toEqual(['find_decision_makers'])
    expect(toggleObjective([], 'other')).toEqual(['other'])
  })
})
