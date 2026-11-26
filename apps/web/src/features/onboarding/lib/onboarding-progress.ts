import { ONBOARDING_ESTIMATED_MINUTES } from '@/features/onboarding/lib/onboarding-gate'
import {
  TEMPS1_QUESTION_KEYS,
  TEMPS1_STAGES,
  stageQuestions,
  visibleQuestions,
  type Question,
} from '@/features/onboarding/lib/questions'
import { presentedValue, validate } from '@/features/onboarding/lib/validation'
import type { OnboardingAnswers, OnboardingPrefillMeta } from '@/stores/onboardingStore'

/**
 * #2023.1/.7 — la progression du questionnaire compte des RÉSULTATS, pas des
 * écrans traversés, et le vocabulaire affiché est celui des sept étapes
 * nommées (Louis 15/09 : « prends-les tous » — la décision qui tranche
 * #2023.7, cf. `registre-2026-09-15-onboarding-questionnaire.md:175`), pas
 * celui des trois stages internes.
 *
 * Cinq de ces sept étapes ont désormais leurs questions dans `TEMPS1_STAGES`
 * (organisation, rôle #2018.2, offre, marché, objectifs #2018.4) :
 * `stageCodes` les y relie. Les deux autres (système commercial, audit) n'ont
 * pas encore de questions Temps-1 propres — ce sont d'autres lots qui les
 * câbleront (cf. le fichier de dispatch). Une étape sans `stageCodes` reste
 * honnêtement `not_started` : ce n'est pas une étape à 0 %, c'est une étape
 * non commencée, et elle est NOMMÉE comme telle plutôt que dissimulée.
 */
export const ONBOARDING_RESULT_STEPS = [
  {
    code: 'organisation',
    titleKey: 'stepper.steps.organisation',
    introKey: 'stepper.intros.organisation',
    stageCodes: ['company_info'],
  },
  { code: 'role', titleKey: 'stepper.steps.role', introKey: 'stepper.intros.role', stageCodes: ['role'] },
  { code: 'offer', titleKey: 'stepper.steps.offer', introKey: 'stepper.intros.offer', stageCodes: ['offer_expertise'] },
  {
    code: 'market',
    titleKey: 'stepper.steps.market',
    introKey: 'stepper.intros.market',
    stageCodes: ['target_market'],
  },
  { code: 'system', titleKey: 'stepper.steps.system', introKey: 'stepper.intros.system', stageCodes: [] },
  { code: 'goals', titleKey: 'stepper.steps.goals', introKey: 'stepper.intros.goals', stageCodes: ['goals'] },
  { code: 'audit', titleKey: 'stepper.steps.audit', introKey: 'stepper.intros.audit', stageCodes: [] },
] as const satisfies readonly { code: string; titleKey: string; introKey: string; stageCodes: readonly string[] }[]

// Ces trois types ne sont consommés que dans ce fichier (knip,
// `pnpm lint:exports:types`) : `ONBOARDING_RESULT_STEPS` et les fonctions
// exportées ci-dessous suffisent aux appelants, qui n'ont jamais besoin de les
// nommer.
type OnboardingResultStep = (typeof ONBOARDING_RESULT_STEPS)[number]
type OnboardingResultStepStatus = 'done' | 'in_progress' | 'not_started'

/**
 * #2088.33 — un prérempli qu'aucun geste humain n'a encore confirmé ne
 * compte pas comme une réponse. `applyPrefill` (`onboardingStore.ts`) pose la
 * valeur suggérée dans `answers` AVANT tout geste : sans ce filtre, la
 * progression affichée croirait savoir ce qu'elle a seulement deviné.
 * `prefillMeta[key]` disparaît aussi bien sur « Confirmer » que sur une
 * édition (`setAnswer`) — sa seule présence suffit donc à dire « encore une
 * proposition », exactement le signal déjà utilisé côté relecture
 * (`onboarding-review-blocks.ts`, `unconfirmedPrefill`). `prefillMeta` reste
 * optionnel (défaut `{}`) : un appelant qui ne le passe pas garde le
 * comportement historique à l'octet près.
 */
function isAnswered(question: Question, answers: OnboardingAnswers, prefillMeta: OnboardingPrefillMeta = {}): boolean {
  if (prefillMeta[question.key] !== undefined) return false
  return validate(question, presentedValue(question, answers[question.key]))
}

function stageStatus(
  stageCode: string,
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta = {},
): OnboardingResultStepStatus {
  const stage = TEMPS1_STAGES.find(s => s.code === stageCode)
  // #2023.5 — une question que le branchement ne POSE pas ne compte pas comme
  // manquante : elle sort du dénominateur, elle n'y entre pas à zéro.
  const questions = stage ? visibleQuestions(stageQuestions(stage), answers) : []
  // #2626.1 — un stage dont TOUTES les questions sont reposées au Temps 2 ne
  // pose plus rien au Temps 1 : il est FRANCHI, pas « pas commencé ». Sans
  // cette ligne, le stepper resterait bloqué sur une étape qui n'a aucune
  // question à afficher — et « pas commencé » serait un zéro affiché à la
  // place d'une absence de question (GA-18/GA-19).
  if (stage && questions.length === 0) return 'done'
  if (questions.length === 0) return 'not_started'
  const filled = questions.filter(q => isAnswered(q, answers, prefillMeta)).length
  if (filled === 0) return 'not_started'
  // #2060 — une question FACULTATIVE ne bloque jamais « terminé » : sinon
  // ajouter une question optionnelle en fin de stage (`question-ouverte`,
  // #2059.7 même mécanisme) ferait régresser un stage qui pouvait déjà
  // l'être. « Terminé » se lit sur les questions REQUISES, jamais sur les
  // facultatives — `isAnswered`/`validate` reste la vérité affichée pour le
  // compteur global (`computeResultProgress`), lui inchangé.
  const required = questions.filter(q => !q.optional)
  const requiredFilled = required.filter(q => isAnswered(q, answers)).length
  const done = required.length === 0 ? filled === questions.length : requiredFilled === required.length
  return done ? 'done' : 'in_progress'
}

/** #2023.1/#2012 — l'état d'une étape nommée vient des RÉPONSES réellement
 *  enregistrées, jamais de sa position par rapport à l'étape courante (le
 *  défaut documenté : `done = i < currentStageIndex` est ✅ positionnel, pas
 *  un état réel — `lots-onboarding-questionnaire.md`). */
export function resultStepStatus(
  step: OnboardingResultStep,
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta = {},
): OnboardingResultStepStatus {
  if (step.stageCodes.length === 0) return 'not_started'
  const statuses = step.stageCodes.map(code => stageStatus(code, answers, prefillMeta))
  if (statuses.every(s => s === 'done')) return 'done'
  if (statuses.some(s => s === 'done' || s === 'in_progress')) return 'in_progress'
  return 'not_started'
}

type OnboardingResultProgress = { answered: number; total: number; percent: number }

/** #2023.4/.6 — le pourcentage RÉEL : les questions Temps-1 actuellement
 *  répondues sur le total actuellement connu. Recalculé à chaque rendu, donc
 *  un branchement qui ajoute ou retire des questions (#2023.5, CÂBLÉ depuis le
 *  16/09 : `when` sur `Question`, lu par `visibleQuestions`) fait bouger
 *  `total` tout seul — c'est la garde `clampProgressRegression` ci-dessous qui
 *  empêche cette hausse de `total` de faire RECULER l'affichage. */
export function computeResultProgress(
  answers: OnboardingAnswers,
  prefillMeta: OnboardingPrefillMeta = {},
): OnboardingResultProgress {
  const questions = visibleQuestions(TEMPS1_STAGES.flatMap(stageQuestions), answers)
  const total = questions.length
  const answered = questions.filter(q => isAnswered(q, answers, prefillMeta)).length
  const percent = total === 0 ? 0 : Math.round((answered / total) * 100)
  return { answered, total, percent }
}

/**
 * #2577.3 — UNE durée, pas deux (GA-26). Avant : ce fichier annonçait
 * 25s/question, un budget INVENTÉ à côté de `ONBOARDING_ESTIMATED_MINUTES`
 * (`onboarding-gate.ts`, #2013.3 — « la durée annoncée du questionnaire, à
 * UN SEUL endroit ») — deux sources pour la même promesse, mesuré en
 * production : « 5 à 7 minutes » sur la carte d'accueil, « 28 minutes » ici,
 * pour le même questionnaire vierge. Le rythme se DÉRIVE désormais de cette
 * fourchette (son milieu) ramené au nombre de questions que le parcours pose
 * réellement (`TEMPS1_QUESTION_KEYS`) : une seule constante déclarée, deux
 * écrans qui LISENT, aucun qui recopie.
 */
const AVERAGE_SECONDS_PER_QUESTION =
  (((ONBOARDING_ESTIMATED_MINUTES.min + ONBOARDING_ESTIMATED_MINUTES.max) / 2) * 60) / TEMPS1_QUESTION_KEYS.length

/** #2023.4 — « Environ N minutes restantes », dynamique. `null` quand il ne
 *  reste plus rien à répondre : zéro minute restante n'est pas une durée, ce
 *  n'est plus une estimation. */
export function estimateMinutesRemaining(progress: OnboardingResultProgress): number | null {
  const remaining = progress.total - progress.answered
  if (remaining <= 0) return null
  return Math.max(1, Math.ceil((remaining * AVERAGE_SECONDS_PER_QUESTION) / 60))
}

/** #2023.6 — la progression affichée ne redescend jamais brutalement : un
 *  agrandissement du dénominateur (branchement adaptatif) ne peut que
 *  ralentir sa PROGRESSION future, jamais effacer ce qui était déjà montré. */
export function clampProgressRegression(previousMax: number, candidate: number): number {
  return Math.max(previousMax, candidate)
}
