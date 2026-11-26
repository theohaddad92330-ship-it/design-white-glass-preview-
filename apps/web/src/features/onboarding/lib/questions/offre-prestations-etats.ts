import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `offre-prestations-etats` du stage `offer_expertise` — #2038.12/
 * .13/.14/.15 : la question SUIT la sélection de `offre-prestations`
 * (#2038.12/.13), et sépare trois états, jamais un score nu (#2038.14) :
 * `service_types` (disponible), `service_types_proven` (prouvé — déjà vendu)
 * et `service_types_desired` (ambition — pas encore proposé).
 *
 * #2038.15 — l'ambition n'est JAMAIS une référence ni une preuve : deux
 * questions, deux champs séparés, pour qu'aucun code ne puisse fusionner
 * l'un dans l'autre par accident. Voir `answers-offre-secteurs.ts` et le test
 * dédié dans `analysis.offre-prestations.test.ts`.
 */
const SERVICE_TYPE_CHOICES = choice(
  'Régie',
  'Forfait',
  'Conseil',
  'Audit',
  'Centre de services',
  'Assistance technique',
  'Sous-traitance',
  'Sous-traitance rang 2',
  'Produit ou formation',
  'Services managés / infogérance',
  'Produit / solution éditée',
  'Recrutement permanent',
  'Bureau d’études / ingénierie de projet',
)

export const offrePrestationsEtatsStep: SubStep = {
  slug: 'offre-prestations-etats',
  questions: [
    {
      key: 'service_types_proven',
      kind: 'multi',
      label: 'questions.serviceTypesProven.label',
      subtitle: 'questions.serviceTypesProven.subtitle',
      choices: SERVICE_TYPE_CHOICES,
    },
    {
      key: 'service_types_desired',
      kind: 'multi',
      label: 'questions.serviceTypesDesired.label',
      subtitle: 'questions.serviceTypesDesired.subtitle',
      choices: SERVICE_TYPE_CHOICES,
    },
  ],
}
