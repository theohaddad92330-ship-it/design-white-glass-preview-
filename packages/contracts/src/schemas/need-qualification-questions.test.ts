import { describe, expect, it } from 'vitest'
import { needQualificationQuestions, type NeedQualificationQuestionsInput } from './need-qualification-questions.js'

/**
 * #2323.32/.34/.35/.36 — LA QUESTION QUI CHANGE LE PLUS CHAQUE AXE, SANS POIDS.
 *
 * Ce qui mérite un test : que l'ordre des champs par axe est bien celui tranché
 * (registre #2323, coordinateur, 25/09/2026), que le PREMIER champ absent
 * gagne — jamais une somme ni un poids — et qu'un axe complet ne produit
 * RIEN, pas une question vide.
 */
function complete(): NeedQualificationQuestionsInput {
  return {
    skills: [{ term: 'React' }],
    seniority: 'senior',
    stack: ['TypeScript'],
    languages: [{ code: 'fr' }],
    clearances: ['Confidentiel Défense'],
    location: 'Paris',
    remote: null,
    start_on: '2026-10-01',
    budget_cents: 60000,
    target_tjm_cents: 60000,
    profile_type_agreement: 'agreed',
    presentation_process: 'Deux entretiens, puis décision.',
    deadline_at: '2026-10-15T00:00:00.000Z',
    urgency: 'haute',
  }
}

describe('needQualificationQuestions — un axe complet ne produit RIEN', () => {
  it('rend un tableau vide quand les quatre axes sont complets', () => {
    expect(needQualificationQuestions(complete())).toEqual([])
  })
})

describe('needQualificationQuestions — axe matching, ordre : compétences → séniorité → stack → langues', () => {
  it('demande les compétences clés en premier', () => {
    const result = needQualificationQuestions({ ...complete(), skills: [], seniority: null, stack: [] })
    const matching = result.find(question => question.axis === 'matching')
    expect(matching?.field).toBe('skills')
  })

  it('demande la séniorité quand les compétences sont là mais pas le reste', () => {
    const result = needQualificationQuestions({ ...complete(), seniority: null, stack: [] })
    const matching = result.find(question => question.axis === 'matching')
    expect(matching?.field).toBe('seniority')
  })

  it('demande le stack en dernier avant les langues', () => {
    const result = needQualificationQuestions({ ...complete(), stack: [] })
    const matching = result.find(question => question.axis === 'matching')
    expect(matching?.field).toBe('stack')
  })

  it('chaque question porte un texte FR et EN', () => {
    const result = needQualificationQuestions({ ...complete(), skills: [] })
    const matching = result.find(question => question.axis === 'matching')
    expect(matching?.question.fr).toBeTruthy()
    expect(matching?.question.en).toBeTruthy()
  })
})

describe('needQualificationQuestions — axe faisabilité : habilitations → lieu/présence → démarrage → TJM/budget', () => {
  it('demande les habilitations en premier', () => {
    const result = needQualificationQuestions({
      ...complete(),
      clearances: [],
      location: null,
      start_on: null,
      budget_cents: null,
      target_tjm_cents: null,
    })
    const feasibility = result.find(question => question.axis === 'feasibility')
    expect(feasibility?.field).toBe('clearances')
  })

  it('un mode de télétravail renseigné vaut lieu — la question passe au démarrage', () => {
    const result = needQualificationQuestions({ ...complete(), location: null, remote: 'full_remote', start_on: null })
    const feasibility = result.find(question => question.axis === 'feasibility')
    expect(feasibility?.field).toBe('start_on')
  })

  it('demande le TJM/budget en dernier', () => {
    const result = needQualificationQuestions({ ...complete(), budget_cents: null, target_tjm_cents: null })
    const feasibility = result.find(question => question.axis === 'feasibility')
    expect(feasibility?.field).toBe('budget')
  })
})

describe('needQualificationQuestions — axe consentement : type de profil validé → processus', () => {
  it('demande l’accord de type de profil en premier — `unknown` compte comme absent', () => {
    const result = needQualificationQuestions({ ...complete(), profile_type_agreement: 'unknown' })
    const consent = result.find(question => question.axis === 'consent')
    expect(consent?.field).toBe('profileTypeAgreement')
  })

  it('un refus explicite (`not_agreed`) compte comme RÉPONDU — la question passe au processus', () => {
    const result = needQualificationQuestions({
      ...complete(),
      profile_type_agreement: 'not_agreed',
      presentation_process: null,
    })
    const consent = result.find(question => question.axis === 'consent')
    expect(consent?.field).toBe('presentationProcess')
  })
})

describe('needQualificationQuestions — axe timing : démarrage → décision → urgence', () => {
  it('demande le démarrage en premier', () => {
    const result = needQualificationQuestions({ ...complete(), start_on: null, deadline_at: null, urgency: null })
    const timing = result.find(question => question.axis === 'timing')
    expect(timing?.field).toBe('startOn')
  })

  it('demande la date de décision ensuite', () => {
    const result = needQualificationQuestions({ ...complete(), deadline_at: null, urgency: null })
    const timing = result.find(question => question.axis === 'timing')
    expect(timing?.field).toBe('deadlineAt')
  })

  it('demande l’urgence en dernier', () => {
    const result = needQualificationQuestions({ ...complete(), urgency: null })
    const timing = result.find(question => question.axis === 'timing')
    expect(timing?.field).toBe('urgency')
  })
})

describe('needQualificationQuestions — aucun poids, aucun score', () => {
  it('ne rend jamais un nombre agrégé — seulement axe/champ/question', () => {
    const result = needQualificationQuestions({ ...complete(), skills: [] })
    for (const question of result) {
      expect(Object.keys(question).sort()).toEqual(['axis', 'field', 'question'])
    }
  })
})
