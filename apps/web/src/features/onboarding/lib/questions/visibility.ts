import { onboardingMomentOf } from '@bellum/contracts'
import type { Question, QuestionVisibilityAnswers } from './types'

/**
 * #2023.5 — LE BRANCHEMENT ADAPTATIF, à un seul endroit (GA-26).
 *
 * `onboarding-progress.ts:77` disait jusqu'ici, en toutes lettres, que `when`
 * « n'existe pas encore sur `Question` ». Il existe maintenant, et ce fichier
 * est le SEUL qui sache le lire : cinq consommateurs posent la même question
 * (« cette question est-elle posée à CETTE personne, en l'état de ses
 * réponses ? ») — l'écran, le bouton Continuer, la progression, la reprise et
 * la relecture. Cinq copies du prédicat divergeraient à la première branche
 * ajoutée, et la divergence la plus coûteuse est déjà connue : une question
 * MASQUÉE mais comptée « manquante » bloque un bouton que rien à l'écran ne
 * permet de débloquer.
 *
 * ⚠️ Masquer n'EFFACE rien. Une réponse déjà donnée reste en base et redevient
 * visible si la condition redevient vraie — « on archive, on ne supprime pas ».
 * Et une question masquée n'est pas une question à zéro : elle sort du
 * DÉNOMINATEUR (« non mesuré n'est jamais 0 »), elle n'y entre pas comme
 * non répondue.
 */
/**
 * #2626.1 — cette question est-elle REPORTÉE au Temps 2 ?
 *
 * Distincte de `when`, et nommée pour ça : `when` masque une question
 * IRRELEVANTE (« tu travailles seul, la question d'équipe ne te concerne pas ») ;
 * ce prédicat-ci écarte une question qui se pose PLUS TARD, quand le commercial
 * aura vu un dossier. L'écran doit pouvoir dire la différence — « ce qui reste
 * à affiner » n'est pas « ce qui ne te concerne pas ».
 *
 * Le moment vient des contrats (`onboardingMomentOf`, dérivé de
 * `TEMPS1_REQUIRED_KEYS`) : aucune liste n'est tenue ici, et une question
 * ajoutée à un stage part automatiquement au Temps 2 tant qu'elle n'est pas
 * exigée pour entrer.
 */
export function isDeferredToTemps2(question: Question): boolean {
  return onboardingMomentOf(question.key) === 'temps2'
}

/**
 * #2626.1 — la CONDITION seule, sans le moment.
 *
 * C'est le branchement adaptatif de #2023.5 tel qu'il existait : il n'a pas
 * disparu avec le report des 125 questions, il a changé de scène. Une question
 * reposée au Temps 2 garde son `when`, et c'est ce prédicat que le complément
 * de profil utilise pour décider laquelle poser. Le Temps 1, lui, passe par
 * `isQuestionVisible`, qui ajoute le moment.
 */
export function isConditionMet(question: Question, answers: QuestionVisibilityAnswers): boolean {
  return question.when ? question.when(answers) : true
}

/** Les questions dont la condition est remplie, quel que soit leur moment. */
export function questionsMatchingConditions(
  questions: readonly Question[],
  answers: QuestionVisibilityAnswers,
): Question[] {
  return questions.filter(question => isConditionMet(question, answers))
}

export function isQuestionVisible(question: Question, answers: QuestionVisibilityAnswers): boolean {
  // #2626.1 — reportée au Temps 2 : elle n'est pas POSÉE ici, donc elle sort du
  // dénominateur du Temps 1 (elle n'y est ni manquante, ni répondue vide) et
  // entre dans celui du Temps 2. Sa réponse, si elle existe déjà, reste en base
  // et reste affichée — on archive, on ne supprime pas.
  if (isDeferredToTemps2(question)) return false
  return isConditionMet(question, answers)
}

/** Les questions réellement posées, dans l'ordre du parcours. */
export function visibleQuestions(questions: readonly Question[], answers: QuestionVisibilityAnswers): Question[] {
  return questions.filter(question => isQuestionVisible(question, answers))
}

/**
 * Vrai quand une réponse porte quelque chose — le prédicat que les conditions
 * `when` utilisent. Volontairement identique en esprit à `isAnswerFilled`
 * (contrats), mais tolérant sur le type d'entrée : une condition lit les
 * réponses du STORE (`OnboardingAnswers`) comme celles du serveur
 * (`EsnAnswers`), et les deux ne portent pas le même type par clé — un objectif
 * structuré (`esn_objectives`) n'est ni une chaîne ni un tableau de chaînes.
 */
export function answered(value: unknown): boolean {
  if (value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  // Tout le reste (`esn_objectives`, un objet structuré) : PRÉSENT, donc
  // répondu — mais jamais transformé en chaîne pour le dire.
  return true
}
