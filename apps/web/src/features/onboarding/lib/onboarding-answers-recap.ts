import type { TFunction } from 'i18next'
import { stageQuestions, TEMPS1_STAGES, TEMPS1_SUBSTEPS, visibleQuestions } from '@/features/onboarding/lib/questions'
import { toDisplayValue } from '@/features/onboarding/lib/onboarding-review-blocks'
import { presentedValue, validate } from '@/features/onboarding/lib/validation'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

// Non exportés : consommés uniquement dans ce fichier (l'appelant lit le
// retour de `buildAnswersRecap` par inférence) — `pnpm lint:exports:types`
// (knip) interdit d'exporter un type sans appelant externe.
type AnswersRecapRow = {
  key: string
  labelKey: string
  value: string
  stageCode: string
  slug: string
}

type AnswersRecapGroup = {
  stageCode: string
  titleKey: string
  rows: AnswersRecapRow[]
}

/**
 * #2087.31 — chaque ligne du récap ramène à la sous-étape qui pose RÉELLEMENT
 * la question, jamais la première sous-étape de l'étape (à la différence de
 * `editTargetOfStage` dans `onboarding-review-blocks.ts`, qui sert un lien
 * unique « corriger » par bloc de relecture finale — un besoin différent).
 * Calculé une seule fois depuis `TEMPS1_SUBSTEPS`, le seul endroit qui
 * connaît la sous-étape de chaque question (GA-26).
 */
function subStepTargetByQuestionKey(): Map<string, { stageCode: string; slug: string }> {
  const map = new Map<string, { stageCode: string; slug: string }>()
  for (const sub of TEMPS1_SUBSTEPS) {
    for (const question of sub.questions) map.set(question.key, { stageCode: sub.stageCode, slug: sub.slug })
  }
  return map
}

/**
 * #2087.30 — le drawer « Voir mes réponses », groupé par ÉTAPE (les
 * `TEMPS1_STAGES` du parcours — un axe différent des 8 blocs thématiques de
 * `buildReviewBlocks`, qui sert la relecture finale avant de générer l'audit ;
 * celui-ci sert à sauter vers une question PENDANT le parcours).
 *
 * Une question masquée par le branchement adaptatif, ou jamais répondue,
 * n'apparaît pas : ce drawer montre des RÉPONSES, jamais un formulaire vide
 * (« non mesuré n'est jamais 0 »).
 */
export function buildAnswersRecap(answers: OnboardingAnswers, t: TFunction<'onboarding'>): AnswersRecapGroup[] {
  const targetByKey = subStepTargetByQuestionKey()
  return TEMPS1_STAGES.map(stage => ({
    stageCode: stage.code,
    titleKey: stage.title,
    rows: visibleQuestions(stageQuestions(stage), answers).reduce<AnswersRecapRow[]>((rows, question) => {
      const raw = answers[question.key]
      if (!validate(question, presentedValue(question, raw))) return rows
      const target = targetByKey.get(question.key)
      if (!target) return rows
      rows.push({
        key: question.key,
        labelKey: question.label,
        value: toDisplayValue(question, raw, t),
        stageCode: target.stageCode,
        slug: target.slug,
      })
      return rows
    }, []),
  }))
}
