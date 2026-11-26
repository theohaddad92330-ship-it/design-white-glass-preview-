import { describe, expect, it } from 'vitest'
import {
  projectSynthesisHasVaguePhraseWithoutFact,
  projectSynthesisSchema,
  PROJECT_SYNTHESIS_FORBIDDEN_PHRASES,
} from './project-synthesis.js'

const SYNTHESIS = {
  projectId: '11111111-1111-4111-8111-111111111111',
  problem: 'Le client veut fiabiliser ses flux de suivi logistique.',
  confirmed: ['Le sponsor a validé le budget 2027'],
  hypotheses: ['Le DSI pourrait bloquer sur le choix technique'],
  decisionMaker: 'Décideur',
  blockingConditions: ['Le budget 2027 doit être voté avant novembre'],
  nextToObtain: 'Un rendez-vous avec le DSI',
  whatNotToDo: 'Ne pas relancer avant le vote du budget',
  generatedAt: '2026-09-26T09:00:00.000Z',
}

describe('projectSynthesisSchema', () => {
  it('accepte une synthèse valide, aux sept questions du contrat', () => {
    expect(projectSynthesisSchema.parse(SYNTHESIS)).toEqual(SYNTHESIS)
  })

  it('accepte un décideur non identifié — null, jamais deviné', () => {
    expect(projectSynthesisSchema.parse({ ...SYNTHESIS, decisionMaker: null }).decisionMaker).toBeNull()
  })

  it('refuse un problème vide — une synthèse qui ne dit rien n’est pas une synthèse', () => {
    expect(() => projectSynthesisSchema.parse({ ...SYNTHESIS, problem: '' })).toThrow()
  })
})

describe('projectSynthesisHasVaguePhraseWithoutFact', () => {
  it('couvre les trois phrases interdites verbatim de #2171.28', () => {
    expect(PROJECT_SYNTHESIS_FORBIDDEN_PHRASES).toEqual(['Opportunité intéressante', 'Bon potentiel', 'À suivre'])
  })

  it('détecte une phrase vague SANS aucun fait pour l’étayer', () => {
    const vague = { ...SYNTHESIS, problem: 'Opportunité intéressante.', confirmed: [], hypotheses: [] }
    expect(projectSynthesisHasVaguePhraseWithoutFact(vague)).toBe(true)
  })

  it('n’attrape pas une phrase vague ACCOMPAGNÉE d’un fait confirmé', () => {
    const withFact = { ...SYNTHESIS, problem: 'Bon potentiel : le sponsor a déjà validé le budget.' }
    expect(projectSynthesisHasVaguePhraseWithoutFact(withFact)).toBe(false)
  })

  it('ne dit pas NON sur une synthèse sans aucune phrase vague', () => {
    expect(projectSynthesisHasVaguePhraseWithoutFact({ ...SYNTHESIS, confirmed: [], hypotheses: [] })).toBe(false)
  })
})
