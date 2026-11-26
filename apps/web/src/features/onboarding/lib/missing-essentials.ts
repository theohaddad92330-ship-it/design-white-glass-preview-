import { requiredAnswerGaps, type Temps1RequiredKey, type UnknownAnswerReason } from '@bellum/contracts'
import type { OnboardingAnswers } from '@/stores/onboardingStore'
import { TEMPS1_CATALOGUE_SUBSTEPS } from './questions'
import type { ReviewEditTarget } from './onboarding-review-blocks'

/**
 * #4817 — CE QUI MANQUE POUR OUVRIR L'ESPACE, nommé et relié.
 *
 * Le défaut réparé ici (client réel VERHELIA, 29/10/2026) : la relecture disait
 * « il manque encore des réponses essentielles » sans en nommer UNE, et sans y
 * renvoyer. L'API, elle, les nommait déjà (`onboarding.service.ts`,
 * `Réponses manquantes : <clés>`) — le front jetait le corps de la 400.
 *
 * Plutôt que de parser une phrase française, on DÉRIVE la même liste de la même
 * source que la porte serveur : `TEMPS1_REQUIRED_KEYS`, `isAnswerFilled` et
 * `isPersonalAnswerKey` viennent tous du contrat (GA-26 — un réglage vit à un
 * seul endroit). Ajouter une clé exigée au contrat la fait apparaître ici sans
 * second geste, et les deux côtés ne peuvent pas diverger sur ce qui bloque.
 *
 * Ce que cette fonction N'INVENTE PAS : une liste vide ne fait AUCUNE ligne
 * (GA-18/GA-19, « on n'affiche pas ce qu'on n'a pas »), et une clé dont le
 * catalogue ne porte pas la question garde son nom plutôt que de disparaître —
 * `target: null` dit « je ne sais pas OÙ y répondre », jamais « il n'y a rien ».
 */
type MissingEssential = {
  key: Temps1RequiredKey
  /** Clé i18n du libellé de la question (namespace `onboarding`) ; `null` = introuvable au catalogue. */
  labelKey: string | null
  /** La sous-étape qui POSE la question — la cible du « d'un clic ». */
  target: ReviewEditTarget | null
  /** #4875.1 — « Je ne sais pas encore » (ou une autre incertitude) DÉCLARÉ sur une clé liste : un état nommé, pas un oubli. */
  declared: UnknownAnswerReason | null
}

/**
 * #2626.1 — on lit le CATALOGUE, pas le parcours : une clé exigée dont la
 * question est reposée au Temps 2 garde son lien vers l'endroit où y répondre.
 */
function locate(key: Temps1RequiredKey): Pick<MissingEssential, 'labelKey' | 'target'> {
  for (const step of TEMPS1_CATALOGUE_SUBSTEPS) {
    const question = step.questions.find(q => q.key === key)
    if (question) return { labelKey: question.label, target: { stage: step.stageCode, slug: step.slug } }
  }
  return { labelKey: null, target: null }
}

/**
 * Les réponses exigées encore absentes, dans l'ordre du contrat.
 *
 * `awaitingCompanyAdmin` reproduit exactement la porte serveur (garde #4158.12) :
 * un membre qui attend que son administrateur décrive l'ESN ne peut pas répondre
 * aux clés ENTREPRISE — l'API les ignorerait —, donc on ne lui nomme que les
 * siennes. Lui demander les autres serait un second cul-de-sac.
 */
export function missingEssentials(
  answers: OnboardingAnswers | undefined,
  {
    awaitingCompanyAdmin,
    statuses,
  }: { awaitingCompanyAdmin: boolean; statuses?: Partial<Record<string, UnknownAnswerReason>> },
): MissingEssential[] {
  // #4875.2 — la règle vit dans le contrat (`requiredAnswerGaps`) : la porte serveur lit la même, il n'y a plus d'écart.
  return requiredAnswerGaps(answers, { awaitingCompanyAdmin, statuses }).map(({ key, declared }) => ({
    key,
    declared,
    ...locate(key),
  }))
}
