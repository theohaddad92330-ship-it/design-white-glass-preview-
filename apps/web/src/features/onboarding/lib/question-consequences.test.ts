import { describe, expect, it } from 'vitest'
import en from '@/i18n/locales/en/onboarding.json'
import fr from '@/i18n/locales/fr/onboarding.json'
import { TEMPS1_STAGES } from './questions'
import { QUESTION_CONSEQUENCE_KEY } from './question-consequences'

/**
 * GOLDEN — #2024.10 / #2025.1 : chaque question Temps-1 dit ce qu'elle change.
 *
 * Le motif que ce dépôt refabrique sans cesse : du texte écrit, testé, jamais
 * lu par personne (`ComplementQuestion.impact`, Temps-2, en est un exemple
 * vivant — aucun appelant ne le rend). Ces trois gardes visent le lookup
 * Temps-1 précisément :
 *  1. sait dire NON — retirer une clé du lookup (ou en ajouter une hors
 *     Temps-1) fait rougir le premier test ;
 *  2. lit quelque chose — les DEUX fichiers de traduction réels, pas un stub ;
 *  3. ne promet ni score ni probabilité, la ligne rouge du produit.
 */
function allTemps1Keys(): string[] {
  return TEMPS1_STAGES.flatMap(stage => stage.steps)
    .flatMap(step => step.questions)
    .map(question => question.key)
}

describe('question-consequences — lookup Temps-1 (golden)', () => {
  it('couvre exactement les questions Temps-1, sans orphelin ni intrus', () => {
    const expected = [...new Set(allTemps1Keys())].sort()
    expect(Object.keys(QUESTION_CONSEQUENCE_KEY).sort()).toEqual(expected)
  })

  it('chaque clé a un texte non vide en FR et en EN', () => {
    const frConsequence = fr.consequence as Record<string, string>
    const enConsequence = en.consequence as Record<string, string>
    for (const i18nKey of Object.values(QUESTION_CONSEQUENCE_KEY)) {
      const leaf = i18nKey.replace('consequence.', '')
      expect(frConsequence[leaf], `fr manquant: ${i18nKey}`).toBeTruthy()
      expect(enConsequence[leaf], `en manquant: ${i18nKey}`).toBeTruthy()
    }
  })

  it('ne promet ni score ni probabilité (doctrine c26_probabilite)', () => {
    const forbidden = /%|probabilit|chance de|score de/i
    for (const [leaf, text] of Object.entries(fr.consequence as Record<string, string>)) {
      expect(text, `${leaf}: ${text}`).not.toMatch(forbidden)
    }
    for (const [leaf, text] of Object.entries(en.consequence as Record<string, string>)) {
      expect(text, `${leaf}: ${text}`).not.toMatch(forbidden)
    }
  })
})
