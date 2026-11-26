import type { EsnAnswers } from '@bellum/contracts'
import {
  isProfileAnswerFilled,
  type ProfileBlock,
  type ProfileQuestion,
  type ProfileQuestionContext,
  questionsOfBlock,
  visibleProfileBlocks,
} from '@bellum/contracts'
import {
  TEMPS1_DEFERRED_QUESTIONS,
  type Question,
  questionsMatchingConditions,
} from '@/features/onboarding/lib/questions'

/**
 * Le pont entre le CATALOGUE partagé (`@bellum/contracts/profile-questionnaire`)
 * et le rendu de champ existant (`QuestionField`).
 *
 * Le catalogue vit dans les contrats parce que l'API compte le même avancement
 * que l'écran ; le rendu vit ici parce que lui seul connaît i18n. Les `value`
 * restent celles du catalogue — persistées verbatim, jamais traduites — et
 * seuls les libellés d'écran (`label`, `subtitle`) sont des clés i18n.
 */
export function toWebQuestion(question: ProfileQuestion): Question {
  const base = {
    key: question.key as Question['key'],
    label: `profileQuestions.items.${question.key}.label`,
    subtitle: `profileQuestions.items.${question.key}.subtitle`,
  }
  if (question.kind === 'tags') {
    return { ...base, kind: 'tags', max: question.max }
  }
  const choices = (question.choices ?? []).map(value => ({ value }))
  if (question.kind === 'multi') {
    return { ...base, kind: 'multi', choices, max: question.max, allowOther: question.allowOther }
  }
  return { ...base, kind: 'single', choices }
}

/**
 * #2626.1 — les questions que le Temps 1 a RENDUES et qu'il faut encore poser,
 * condition de branchement comprise.
 *
 * `questionsMatchingConditions` et non `visibleQuestions` : ce dernier écarte
 * précisément les questions reportées (c'est son travail au Temps 1). Ici, on
 * est AU Temps 2 — le seul filtre qui vaut encore est la condition.
 *
 * Une question déjà répondue reste dans la liste : le Temps 2 la REPOSE avec sa
 * réponse affichée, modifiable. Une correction humaine gagne toujours, et on
 * n'efface jamais une réponse en la reposant.
 */
export function deferredQuestionsToAsk(answers: Partial<EsnAnswers>): readonly Question[] {
  return questionsMatchingConditions(TEMPS1_DEFERRED_QUESTIONS, answers as Readonly<Record<string, unknown>>)
}

/**
 * #2626.1 — CE QUI RESTE À AFFINER, mesuré.
 *
 * `remaining` est un nombre de questions ENCORE À POSER, jamais un « 0 »
 * affiché à la place d'une valeur absente (GA-18/GA-19) : une question non
 * posée n'est pas une question répondue vide. Quand `total` vaut 0, l'écran
 * n'affiche rien plutôt que « 0/0 ».
 */
export function deferredProgress(answers: Partial<EsnAnswers>): {
  answered: number
  total: number
  remaining: number
} {
  const questions = deferredQuestionsToAsk(answers)
  const answered = questions.filter(q => isProfileAnswerFilled(answers[q.key as keyof EsnAnswers])).length
  return { answered, total: questions.length, remaining: questions.length - answered }
}

/** Une étape du parcours : l'intro d'un bloc, puis ses questions. */
type ProfileStep =
  | { kind: 'block-intro'; block: ProfileBlock; questionCount: number }
  | { kind: 'question'; block: ProfileBlock; question: ProfileQuestion }
  // #2626.1 — la section « Ce qui reste à affiner » : les questions que le
  // Temps 1 a rendues. Elles sont DÉJÀ des `Question` d'écran (libellés i18n
  // compris) — pas de conversion, pas de second catalogue.
  | { kind: 'deferred-intro'; questionCount: number }
  | { kind: 'deferred'; question: Question }
  | { kind: 'notifications' }
  | { kind: 'summary' }

/**
 * Le parcours complet, à plat : intro de bloc → questions du bloc → … →
 * notifications → synthèse.
 *
 * Recalculé à chaque réponse, parce que la logique conditionnelle du §28 dépend
 * des réponses déjà données : cocher « secteur public » fait apparaître une
 * question, choisir « je travaille seul » en fait disparaître deux.
 *
 * #2018.5 — l'étape `notifications` n'est PAS une question de plus du
 * catalogue : `notification_preferences` n'est pas `esn_profiles`, et une clé
 * `EsnAnswers` qui la dupliquerait romprait « un réglage vit à un seul
 * endroit » (GA-26). Elle vit donc hors de `PROFILE_QUESTIONS`, une seule fois,
 * juste avant la synthèse — l'écran (`ProfileQuestionnaireDialog`) l'affiche en
 * lisant/écrivant directement `useNotificationPreferences`, le MÊME chemin que
 * Réglages › Notifications.
 */
export function buildProfileSteps(
  answers: Partial<EsnAnswers>,
  context: ProfileQuestionContext,
): readonly ProfileStep[] {
  const steps: ProfileStep[] = []
  for (const block of visibleProfileBlocks(answers, context)) {
    const questions = questionsOfBlock(block, answers, context)
    steps.push({ kind: 'block-intro', block, questionCount: questions.length })
    for (const question of questions) {
      steps.push({ kind: 'question', block, question })
    }
  }
  // #2626.1 — puis ce que le Temps 1 a rendu, dans l'ordre du parcours
  // d'origine. Placées APRÈS les six blocs : celles-là ont été écartées pour
  // tenir la promesse des cinq minutes, elles ne reprennent pas la tête.
  const deferred = deferredQuestionsToAsk(answers)
  if (deferred.length > 0) {
    steps.push({ kind: 'deferred-intro', questionCount: deferred.length })
    for (const question of deferred) {
      steps.push({ kind: 'deferred', question })
    }
  }
  // #2018.5 — notifications juste avant la synthèse, après le rattrapage
  // Temps 1 : ni un bloc du catalogue ni une clé EsnAnswers (GA-26).
  steps.push({ kind: 'notifications' })
  steps.push({ kind: 'summary' })
  return steps
}
