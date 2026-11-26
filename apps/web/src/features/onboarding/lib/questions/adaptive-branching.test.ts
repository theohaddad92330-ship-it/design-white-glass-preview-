import { describe, expect, it } from 'vitest'
import { TEMPS1_REQUIRED_KEYS, type EsnAnswers } from '@bellum/contracts'
import { computeResultProgress } from '@/features/onboarding/lib/onboarding-progress'
import { firstPendingSubStep } from '@/features/onboarding/lib/pending-steps'
import type { OnboardingAnswers } from '@/stores/onboardingStore'
import { TEMPS1_STAGES, findCatalogueSubStep, stageQuestions } from './index'
import { deferredProgress } from '@/features/onboarding/lib/profile-questions'
import { questionsMatchingConditions } from './visibility'

/**
 * #2023.5 — « un branchement adaptatif peut changer le nombre de questions ».
 *
 * Trois choses à prouver, et la troisième est celle qui manquait aux six
 * gardes borgnes de la semaine : que le mécanisme sait dire NON (une question
 * branchée DISPARAÎT quand sa condition est fausse), qu'il LIT un corpus non
 * vide (le questionnaire réel porte au moins une question `when`), et qu'il
 * n'attrape pas ce qu'il ne vise pas (une question SANS `when` n'est jamais
 * masquée, quelles que soient les réponses).
 */

const LIST_KEYS: readonly string[] = ['expertise_areas', 'target_sectors', 'target_company_types', 'geo_zones']

function answers(over: Partial<EsnAnswers> = {}): EsnAnswers {
  const blank = Object.fromEntries(ALL_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : null]))
  return { ...blank, ...over } as EsnAnswers
}

/** Le store d'écran ne porte JAMAIS de `null` (`OnboardingAnswers`) : une
 *  réponse absente y est une chaîne vide ou un tableau vide. */
function storeAnswers(over: Record<string, string | string[]> = {}): OnboardingAnswers {
  const blank = Object.fromEntries(ALL_KEYS.map(key => [key, LIST_KEYS.includes(key) ? [] : '']))
  return { ...blank, ...over } as OnboardingAnswers
}

const ALL_QUESTIONS = TEMPS1_STAGES.flatMap(stageQuestions)
// #2626.1 — le CATALOGUE, pas le parcours : depuis l'arbitrage du 20/09/2026,
// le branchement adaptatif joue au Temps 2 sur les questions que le Temps 1 a
// rendues. Le mécanisme est le même ; c'est la scène qui a changé.
const ALL_KEYS = ALL_QUESTIONS.map(q => q.key)

describe('#2023.5 — le questionnaire s’adapte aux réponses déjà données', () => {
  it('LIT un corpus non vide : au moins une question réelle porte une condition', () => {
    const branchees = ALL_QUESTIONS.filter(q => typeof q.when === 'function')
    expect(branchees.length).toBeGreaterThan(0)
    // La branche réelle du 16/09 : « Pourquoi ? » n'a aucun sens tant que
    // « Qu'est-ce qui s'est arrêté ? » est vide.
    expect(branchees.map(q => q.key)).toContain('frein_stopped_reason')
  })

  it('sait dire NON : la question branchée disparaît tant que sa condition est fausse', () => {
    const freins = findCatalogueSubStep('target_market', 'freins')
    expect(freins).toBeDefined()

    const sansCause = questionsMatchingConditions(freins!.questions, answers())
    expect(sansCause.map(q => q.key)).not.toContain('frein_stopped_reason')

    const avecCause = questionsMatchingConditions(
      freins!.questions,
      answers({ frein_stopped: 'la relance a été abandonnée' }),
    )
    expect(avecCause.map(q => q.key)).toContain('frein_stopped_reason')
  })

  it('LE TÉMOIN — une question sans condition n’est JAMAIS masquée', () => {
    const sansCondition = ALL_QUESTIONS.filter(q => q.when === undefined)
    expect(sansCondition.length).toBeGreaterThan(50)
    const visibles = questionsMatchingConditions(sansCondition, answers())
    expect(visibles).toHaveLength(sansCondition.length)
  })

  it('change le NOMBRE de questions comptées — c’est la demande exacte du point', () => {
    // #2626.1 — `frein_stopped` et `frein_stopped_reason` sont reposées au
    // Temps 2 : c'est donc le dénominateur DU TEMPS 2 que la branche fait
    // bouger, pas celui du Temps 1. Le mécanisme est inchangé.
    const sansCause = deferredProgress({})
    const avecCause = deferredProgress({ frein_stopped: 'la relance a été abandonnée' } as never)

    expect(avecCause.total).toBe(sansCause.total + 1)
    expect(avecCause.answered).toBe(sansCause.answered + 1)
    // Et le Temps 1, lui, ne bouge pas d'un cran : il ne pose plus ces
    // questions-là (c'est tout l'objet de l'arbitrage).
    expect(computeResultProgress(storeAnswers({ frein_stopped: 'abandon' })).total).toBe(
      computeResultProgress(storeAnswers()).total,
    )
  })

  it('une question masquée ne BLOQUE pas la reprise (elle n’est pas « en attente »)', () => {
    // #2626.1 — la reprise du Temps 1 ne regarde plus que les 10 clés exigées.
    // Une question branchée reposée au Temps 2 ne peut donc plus la bloquer,
    // quelle que soit sa condition : c'est la propriété que le report devait
    // produire, et c'est elle qu'on garde ici.
    const requises = Object.fromEntries(
      TEMPS1_REQUIRED_KEYS.map(key => [key, LIST_KEYS.includes(key) ? ['rempli'] : 'rempli']),
    ) as Partial<EsnAnswers>
    expect(firstPendingSubStep(answers(requises), [])).toBeNull()
    // Même espace, la branche ouverte : toujours rien en attente au Temps 1.
    expect(firstPendingSubStep(answers({ ...requises, frein_stopped: 'abandon' }), [])).toBeNull()
  })
})
