import { isAnswerFilled, toFormAnswerValue, type EsnAnswers } from '@bellum/contracts'
import { stageQuestions, TEMPS1_STAGES, type OnboardingStageDef } from '@/features/onboarding/lib/questions'
import { presentedValue } from '@/features/onboarding/lib/validation'

/**
 * LE CADRAGE — ce que Réglages › Mon espace › Profil commercial compte et exporte (maquette `settings-espace`,
 * Théo V22 — Louis 22/10/2026, N2).
 *
 * Une seule lecture de « cette réponse est-elle renseignée ? » (`isAnswerFilled` sur la valeur PRÉSENTÉE) pour la
 * progression d'un thème, le total et l'export : trois chiffres qui divergeraient sinon (GA-26).
 */

/** Les réponses renseignées d'un thème, sur le nombre de questions qu'il pose. */
export function stageProgress(stage: OnboardingStageDef, answers: EsnAnswers): { filled: number; total: number } {
  const questions = stageQuestions(stage)
  const filled = questions.filter(q => isAnswerFilled(presentedValue(q, toFormAnswerValue(answers[q.key])))).length
  return { filled, total: questions.length }
}

/** Le nombre de réponses renseignées sur l'ensemble des thèmes du cadrage. */
export function framingAnswerCount(answers: EsnAnswers): number {
  return TEMPS1_STAGES.reduce((sum, stage) => sum + stageProgress(stage, answers).filled, 0)
}

/**
 * Le JSON du cadrage : UNIQUEMENT les réponses renseignées, rangées par thème. Une question sans réponse n'apparaît
 * pas — jamais « null » ni « 0 » qui se liraient comme une réponse. `exportedAt` est fourni par l'appelant (pas
 * d'horloge cachée ici : la fonction reste pure).
 */
export function buildFramingExport(
  answers: EsnAnswers,
  exportedAt: string,
): { exportedAt: string; themes: { theme: string; answers: Record<string, unknown> }[] } {
  const themes = TEMPS1_STAGES.map(stage => {
    const filled: Record<string, unknown> = {}
    for (const question of stageQuestions(stage)) {
      const value = answers[question.key]
      // Réponse RÉELLEMENT donnée : la valeur PAR DÉFAUT d'une question (qui compte dans la progression) n'est pas
      // une réponse, et ne part pas dans le fichier.
      if (isAnswerFilled(toFormAnswerValue(value))) filled[question.key] = value
    }
    return { theme: stage.code, answers: filled }
  }).filter(theme => Object.keys(theme.answers).length > 0)
  return { exportedAt, themes }
}
