import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/onboarding.json'
import en from '@/i18n/locales/en/onboarding.json'
import { recommendationFor } from '@/features/onboarding/lib/question-recommendations'
import { TEMPS1_STAGES, type Question } from '@/features/onboarding/lib/questions'

/**
 * #2024.3 — UNE RECOMMANDATION SE FONDE SUR UNE RÉPONSE ANTÉRIEURE.
 *
 * Ce fichier sait dire NON de trois façons :
 *  1. retirer `recommendedFrom` de `reference_sectors` (ou le fonder sur autre
 *     chose que `target_sectors`) fait rougir le cas « le corpus RÉEL porte la
 *     recommandation » ;
 *  2. laisser passer une valeur absente du catalogue fait rougir « une option
 *     qu'on ne peut pas cocher n'est pas une recommandation » ;
 *  3. il LIT un corpus non vide : la question est prise dans `TEMPS1_STAGES`,
 *     le vrai questionnaire, et les libellés sont relus dans les DEUX fichiers
 *     de traduction.
 *
 * Et il porte son TÉMOIN : les questions voisines, qui ne déclarent aucune
 * source, ne doivent rien recommander — une garde trop gourmande mettrait des
 * options en tête partout.
 */

const allQuestions: Question[] = TEMPS1_STAGES.flatMap(stage => stage.steps.flatMap(step => step.questions))
const questionByKey = (key: string): Question => {
  const found = allQuestions.find(question => question.key === key)
  if (!found) throw new Error(`Question introuvable dans TEMPS1_STAGES : ${key}`)
  return found
}

describe('recommendationFor — le corpus RÉEL du questionnaire', () => {
  it('le corpus n’est pas vide', () => {
    // Sans cette ligne, un `TEMPS1_STAGES` vidé rendrait tout le reste vert en
    // ne lisant rien.
    expect(allQuestions.length).toBeGreaterThan(5)
  })

  it('`reference_sectors` se fonde sur `target_sectors`, et NOMME sa source', () => {
    const question = questionByKey('reference_sectors')
    const recommendation = recommendationFor(question, {
      target_sectors: ['Assurance & Mutuelles', 'Fintech & Services financiers'],
    })

    expect(recommendation?.values).toEqual(['Assurance & Mutuelles', 'Fintech & Services financiers'])
    // La source est NOMMÉE : sans clé de libellé, la recommandation ne
    // s'afficherait pas — c'est tout le point du arbitrage.
    expect(recommendation?.sourceLabelKey).toBe('recommendation.fromTargetSectors')
  })

  it('une valeur HORS catalogue n’est jamais recommandée', () => {
    // Un « Autre » libre saisi sur la question précédente, ou un catalogue qui
    // a changé : proposer une option qu'on ne peut pas cocher serait pire que
    // ne rien proposer.
    const recommendation = recommendationFor(questionByKey('reference_sectors'), {
      target_sectors: ['Assurance & Mutuelles', 'Un secteur tapé à la main'],
    })
    expect(recommendation?.values).toEqual(['Assurance & Mutuelles'])
  })

  it('aucune réponse antérieure → AUCUNE recommandation, jamais un catalogue par défaut', () => {
    const question = questionByKey('reference_sectors')
    expect(recommendationFor(question, {})).toBeNull()
    expect(recommendationFor(question, { target_sectors: [] })).toBeNull()
    expect(recommendationFor(question, { target_sectors: ['Rien de connu ici'] })).toBeNull()
    // Une réponse d'un autre type (donnée abîmée) ne devient pas une liste.
    expect(recommendationFor(question, { target_sectors: 'Assurance & Mutuelles' })).toBeNull()
  })

  it('LE TÉMOIN — les autres questions ne recommandent rien', () => {
    const others = allQuestions.filter(question => question.key !== 'reference_sectors')
    expect(others.length).toBeGreaterThan(5)
    const answers = { target_sectors: ['Assurance & Mutuelles'], expertise_areas: ['Data & IA'] }
    for (const question of others) {
      expect(recommendationFor(question, answers)).toBeNull()
    }
  })
})

describe('recommendationFor — la source est nommée DANS LES DEUX LANGUES', () => {
  const read = (bundle: Record<string, unknown>, path: string): unknown =>
    path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], bundle)

  it('le libellé de source et celui du bouton existent en FR et en EN, et diffèrent', () => {
    for (const key of ['recommendation.fromTargetSectors', 'recommendation.add']) {
      expect(typeof read(fr, key)).toBe('string')
      expect(typeof read(en, key)).toBe('string')
      expect(read(fr, key)).not.toBe(read(en, key))
    }
  })

  it('le libellé de source NOMME la question source — il ne dit pas juste « recommandé »', () => {
    // Un libellé se lit hors contexte : « Recommandé » seul ne dit ni par qui
    // ni d'après quoi, et c'est exactement ce qui rend une suggestion
    // indistinguable d'une invention.
    // ⚠️ FR tutoie (§6 du lexique) : « tes », jamais « vos ».
    expect(String(read(fr, 'recommendation.fromTargetSectors')).toLowerCase()).toContain('tes secteurs cibles')
    expect(String(read(en, 'recommendation.fromTargetSectors')).toLowerCase()).toContain('target sectors')
  })
})
