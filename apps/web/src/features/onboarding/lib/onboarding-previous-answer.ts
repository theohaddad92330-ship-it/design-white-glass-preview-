import type { TFunction } from 'i18next'
import { TEMPS1_SUBSTEPS, visibleQuestions, type FlatSubStep } from '@/features/onboarding/lib/questions'
import { toDisplayValue } from '@/features/onboarding/lib/onboarding-review-blocks'
import { presentedValue, validate } from '@/features/onboarding/lib/validation'
import type { OnboardingAnswers } from '@/stores/onboardingStore'

// Non exporté : consommé uniquement dans ce fichier et par son appelant, qui
// lit le retour de `previousAnsweredQuestion` par inférence — `pnpm
// lint:exports:types` (knip) interdit un export sans appelant externe.
type PreviousAnswer = {
  labelKey: string
  value: string
}

/**
 * #2021.11 — la réponse à LA question précédente immédiate, en ligne,
 * au-dessus de la carte de question courante — distinct d'`AnswersRecapDrawer`
 * (#2087.30), qui sert à SAUTER vers une réponse plus ancienne dans un
 * tiroir, pas à la relire au fil de l'eau.
 *
 * Remonte `TEMPS1_SUBSTEPS` À REBOURS depuis `sub.index - 1`, sous-étape par
 * sous-étape, questions de chacune en ordre inverse : la première question
 * VISIBLE (branchement adaptatif respecté, `visibleQuestions`) ET RÉPONDUE
 * (même prédicat que `buildAnswersRecap` — `validate`+`presentedValue`)
 * rencontrée est LA précédente. Une sous-étape entièrement vide, ou une
 * question masquée, ne casse pas la remontée : elle continue vers la
 * sous-étape encore avant. Rien avant la première sous-étape → `null`, jamais
 * un placeholder (« non mesuré n'est jamais 0 »).
 *
 * Tranché sans Louis (recommandation déjà écrite au registre 22/09 soir,
 * appliquée ici 23/09 — brief lot L3) : une ligne compacte, pas un second
 * tiroir.
 */
export function previousAnsweredQuestion(
  sub: FlatSubStep,
  answers: OnboardingAnswers,
  t: TFunction<'onboarding'>,
): PreviousAnswer | null {
  for (let i = sub.index - 1; i >= 0; i -= 1) {
    const visible = visibleQuestions(TEMPS1_SUBSTEPS[i].questions, answers)
    for (let j = visible.length - 1; j >= 0; j -= 1) {
      const question = visible[j]
      const raw = answers[question.key]
      if (!validate(question, presentedValue(question, raw))) continue
      return { labelKey: question.label, value: toDisplayValue(question, raw, t) }
    }
  }
  return null
}
