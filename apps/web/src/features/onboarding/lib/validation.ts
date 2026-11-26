import type { Question } from '@/features/onboarding/lib/questions'

type StageValue = string | string[]

export function emptyFor(question: Question): StageValue {
  if (question.kind === 'single') return question.defaultValue ?? ''
  // #2088.12 — `number` se range avec `text` : une chaîne vide, jamais un
  // tableau (le magasin d'écran garde un SEUL type de valeur de formulaire).
  return question.kind === 'text' || question.kind === 'number' ? '' : []
}

/** Whether a question's answer is a list (multi-select or free-text chips). */
function isListQuestion(question: Question): boolean {
  return question.kind !== 'text' && question.kind !== 'single' && question.kind !== 'number'
}

/**
 * The value a question SHOWS (and saves) for a possibly-unset answer: the
 * stored value when it exists, otherwise the question's default/empty value.
 * `null` and `''` both count as unset — the store/profile hooks coerce a
 * never-answered nullable string to `''`, and a defaulted question (e.g. the
 * offer domain, default `esn_it`) must still pre-select its default then.
 * For questions without a `defaultValue` this is exactly the historical
 * `answers[key] ?? emptyFor(question)` behaviour.
 */
export function presentedValue(question: Question, value: string | string[] | null | undefined): StageValue {
  if (value == null || value === '') return emptyFor(question)
  return value
}

export function validate(question: Question, value: StageValue): boolean {
  if (question.kind === 'number') {
    // #2088.12 — une réponse `number` doit se PARSER en nombre fini, pas
    // seulement être non vide : « abc » n'est pas une réponse à une question
    // qui promet un chiffre.
    return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Number(value))
  }
  if (!isListQuestion(question)) {
    return typeof value === 'string' && value.trim().length > 0
  }
  const arr = Array.isArray(value) ? value : []
  if (arr.length < 1) return false
  if (exceedsMax(question, value)) return false
  return true
}

/**
 * #2059.7 — le SEUL endroit qui laisse une question facultative avancer vide.
 *
 * `validate` garde son sens historique (« cette question a-t-elle une
 * réponse ? ») pour la relecture (`onboarding-review-blocks.ts`) et la barre
 * de progression (`onboarding-progress.ts`) — une question facultative restée
 * vide y reste honnêtement « manquante ». C'est le GESTE DE NAVIGATION
 * (`OnboardingWizard.tsx`) qui doit la laisser passer, pas la définition de ce
 * qu'est une réponse complète : mélanger les deux ferait mentir la relecture
 * sur une question que personne n'a remplie.
 */
export function isSatisfied(question: Question, value: StageValue): boolean {
  if ('optional' in question && question.optional) return true
  return validate(question, value)
}

/**
 * R15N-10 — « Continuer » se désactivait par dépassement de plafond sans un
 * mot d'explication (`disabled`, sans `title` ni `aria-describedby`). Isolée
 * de `validate` pour que l'appelant puisse distinguer CE cas précis (il a de
 * quoi retirer) d'un simple champ encore vide.
 */
export function exceedsMax(question: Question, value: StageValue): boolean {
  if (!('max' in question) || question.max == null) return false
  return countedAgainstMax(question, value) > question.max
}

/**
 * #3709 (recette Ludovic 07/10) — les domaines PERSONNALISÉS saisis en
 * « Autre » n'entrent pas dans le plafond : seul le catalogue est plafonné.
 * Sinon cinq choix cochés bloquaient toute saisie libre (6/5, « Continuer »
 * grisé). Un champ sans `allowOther` compte tout, comme avant.
 */
export function countedAgainstMax(question: Question, value: StageValue): number {
  const arr = Array.isArray(value) ? value : []
  if (!('allowOther' in question) || !question.allowOther) return arr.length
  const catalogue = new Set<string>()
  if (question.kind === 'multi') for (const c of question.choices) catalogue.add(c.value)
  if (question.kind === 'multi-grouped')
    for (const g of question.groups) for (const c of g.choices) catalogue.add(c.value)
  return arr.filter(v => catalogue.has(v)).length
}
