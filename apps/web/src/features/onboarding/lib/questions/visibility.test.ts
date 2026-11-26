import { describe, expect, it } from 'vitest'
import { ESN_ACTIVITY_IN_CREATION, hasNoCommercialHistory } from './maturite'
import type { Question } from './types'
import {
  answered,
  isConditionMet,
  isDeferredToTemps2,
  isQuestionVisible,
  questionsMatchingConditions,
  visibleQuestions,
} from './visibility'

/**
 * #2085.24 — « Unitaires : branchements ». Le registre (16/09) n'avait
 * trouvé aucun référent avec confiance ; il existe : `visibility.ts` (#2023.5,
 * « LE BRANCHEMENT ADAPTATIF, à un seul endroit ») n'avait encore aucun
 * fichier de test. Ce fichier verrouille les cinq fonctions qu'il exporte —
 * les cinq consommateurs cités dans son propre commentaire (écran, bouton
 * Continuer, progression, reprise, relecture) en dépendent tous, et
 * divergeraient silencieusement si l'une d'elles changeait de comportement
 * sans qu'un test le remarque.
 */

const TEXT_QUESTION: Question = {
  key: 'esn_name',
  kind: 'text',
  label: 'questions.esnName.label',
}

const BRANCHED_QUESTION: Question = {
  key: 'client_base_missions_ongoing_band',
  kind: 'single',
  label: 'questions.clientBaseMissionsOngoingBand.label',
  choices: [{ value: '1-5', labelKey: 'questions.clientBaseMissionsOngoingBand.choices.1To5' }],
  when: answers => !hasNoCommercialHistory(answers),
}

describe('#2085.24 — branchement adaptatif (visibility.ts)', () => {
  describe('isConditionMet', () => {
    it("une question SANS `when` est toujours posée, à l'octet près (comportement historique)", () => {
      expect(isConditionMet(TEXT_QUESTION, {})).toBe(true)
    })

    it('une question AVEC `when` reste posée quand la condition tient', () => {
      expect(isConditionMet(BRANCHED_QUESTION, { esn_maturity_situation: 'Activité stabilisée' })).toBe(true)
    })

    it("dit NON : une question AVEC `when` n'est plus posée quand la condition tombe", () => {
      expect(isConditionMet(BRANCHED_QUESTION, { esn_maturity_situation: ESN_ACTIVITY_IN_CREATION })).toBe(false)
    })
  })

  describe('questionsMatchingConditions', () => {
    it('garde les questions sans condition et celles dont la condition tient, retire les autres', () => {
      const result = questionsMatchingConditions([TEXT_QUESTION, BRANCHED_QUESTION], {
        esn_maturity_situation: ESN_ACTIVITY_IN_CREATION,
      })
      expect(result).toEqual([TEXT_QUESTION])
    })
  })

  describe('isQuestionVisible / visibleQuestions', () => {
    it('une question du Temps 1 (esn_name, TEMPS1_REQUIRED_KEYS) reste visible même sans réponse', () => {
      expect(isQuestionVisible(TEXT_QUESTION, {})).toBe(true)
    })

    it("dit NON : une question reportée au Temps 2 n'est jamais visible au Temps 1, même si sa condition `when` tient", () => {
      // `client_base_missions_ongoing_band` n'est pas dans TEMPS1_REQUIRED_KEYS
      // (@bellum/contracts) : elle est reportée, quel que soit `when`.
      expect(isQuestionVisible(BRANCHED_QUESTION, { esn_maturity_situation: 'Activité stabilisée' })).toBe(false)
    })

    it('visibleQuestions filtre la liste dans le même sens que isQuestionVisible, un par un', () => {
      expect(visibleQuestions([TEXT_QUESTION, BRANCHED_QUESTION], {})).toEqual([TEXT_QUESTION])
    })
  })

  describe('isDeferredToTemps2', () => {
    it('dit NON pour une clé du Temps 1 (esn_name)', () => {
      expect(isDeferredToTemps2(TEXT_QUESTION)).toBe(false)
    })

    it('dit OUI pour une clé qui ne figure pas dans TEMPS1_REQUIRED_KEYS', () => {
      expect(isDeferredToTemps2(BRANCHED_QUESTION)).toBe(true)
    })
  })

  describe('answered — le prédicat que `when` utilise', () => {
    it('dit NON sur null/undefined/chaîne vide/tableau vide', () => {
      expect(answered(null)).toBe(false)
      expect(answered(undefined)).toBe(false)
      expect(answered('')).toBe(false)
      expect(answered('   ')).toBe(false)
      expect(answered([])).toBe(false)
    })

    it('dit OUI sur une chaîne non vide et un tableau non vide', () => {
      expect(answered('Activité stabilisée')).toBe(true)
      expect(answered(['a'])).toBe(true)
    })

    it('dit OUI sur un objet structuré (esn_objectives) sans jamais le transformer en chaîne', () => {
      expect(answered({ kind: 'grow_revenue' })).toBe(true)
    })
  })
})
