import { describe, expect, it } from 'vitest'
import { MESSAGE_OBJECTIVE_CODES } from './message-parameters'
import {
  APPROACH_QUESTIONS,
  approachChoice,
  directApproach,
  needsApproachQuestion,
  recommendedAnswers,
} from './approach-quiz'

describe('#3633 — le QCM d’approche avant de rédiger l’e-mail suggéré', () => {
  it('pose au moins trois questions, chacune à au moins deux réponses', () => {
    expect(APPROACH_QUESTIONS.length).toBeGreaterThanOrEqual(3)
    for (const question of APPROACH_QUESTIONS) expect(question.options.length).toBeGreaterThanOrEqual(2)
  })

  it('ne propose que des objectifs que le moteur connaît (sinon 422)', () => {
    const objective = APPROACH_QUESTIONS.find(question => question.key === 'objective')
    for (const option of objective?.options ?? []) {
      expect(MESSAGE_OBJECTIVE_CODES as readonly string[]).toContain(option)
    }
  })

  it('le rang du contact pré-coche un objectif — un bloqueur se valide, un décideur s’ouvre', () => {
    // #2204.21 — « valider un contexte » mène à `demande_information` (GA-26), jamais à un objectif de plus.
    expect(recommendedAnswers('blocker').objective).toBe('demande_information')
    expect(recommendedAnswers('economic').objective).toBe('ouverture_compte')
    // Rang inconnu : rien n'est deviné, la question reste ouverte.
    expect(recommendedAnswers('unknown').objective).toBeUndefined()
    expect(recommendedAnswers(null).objective).toBeUndefined()
  })

  it('traduit les réponses dans le contrat EXISTANT de /ia/message : objectif, angle, contraintes de forme', () => {
    const choice = approachChoice({ objective: 'demande_information', angle: 'signal', tone: 'direct' })
    expect(choice).not.toBeNull()
    expect(choice?.parameters.objective).toBe('demande_information')
    expect(choice?.angle.length).toBeGreaterThan(0)
    expect(choice?.parameters.constraints?.length).toBeGreaterThan(0)
    expect(choice?.parameters.constraints?.length ?? 0).toBeLessThanOrEqual(300)
  })

  it('#3694.5 — refuse de rédiger sans objectif ; l’angle et le ton affinent sans bloquer', () => {
    expect(approachChoice({})).toBeNull()
    expect(approachChoice({ angle: 'signal', tone: 'direct' })).toBeNull()
    const objectiveOnly = approachChoice({ objective: 'relance' })
    expect(objectiveOnly).toEqual({ angle: '', parameters: { objective: 'relance' } })
  })

  it('#3694.5 — un rang connu (dossier complet) n’attend aucune question ; un rang inconnu pose celle de l’objectif', () => {
    expect(needsApproachQuestion('economic')).toBe(false)
    expect(directApproach('economic')).toEqual({ angle: '', parameters: { objective: 'ouverture_compte' } })
    expect(needsApproachQuestion('unknown')).toBe(true)
    expect(needsApproachQuestion(null)).toBe(true)
    expect(directApproach(null)).toBeNull()
  })
})
