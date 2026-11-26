import { VIVIER_COUNT_BAND_CHOICES } from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * // Théo O onboarding-couverture.R3 (22/10/2026) — V23 : « vivier accessible dès la création ; historique de société non
 * requis ». Le masquage `hasNoCommercialHistory` (#2548.1) est RETIRÉ : une activité en création peut déjà avoir un vivier.
 * Les réponses déjà données restent en base (on archive, on ne supprime pas).
 */
/**
 * Sous-étape `vivier-comptage` du stage `company_info` — #2046.1/.2/.3/.5.
 *
 * Le funnel CHIFFRÉ du vivier : combien de profils sont identifiés, combien
 * sont qualifiés, combien sont disponibles — en bandes, jamais un nombre
 * exact (personne ne connaît son chiffre au profil près, et l'exiger fait
 * répondre au hasard). `talent_pool_available_band` (#2046.3) est distinct
 * de `available_consultants_band` (sous-étape `effectif-reel`) : celui-ci est
 * une IMPRESSION qualitative d'intercontrat, celui-là le troisième barreau
 * d'un funnel compté.
 *
 * `talent_pool_avg_tjm_band` (#2046.5) est le TJM du VIVIER, jamais celui du
 * questionnaire de vente (`avg_tjm`, Temps 2) qui est le TJM VENDU.
 *
 * #2548.1 — `talent_pool_avg_tjm_band` et `talent_pool_availability_recency_band`
 * n'ont AUCUN choix « pas de vivier » (contrairement aux trois bandes
 * comptées, dont `VIVIER_COUNT_BAND_CHOICES` porte déjà `'0'`) : les poser à
 * une activité en création forcerait un TJM ou une fraîcheur inventés pour un
 * vivier qui n'existe pas. `hasNoCommercialHistory` retire donc les CINQ
 * questions ensemble — un funnel dont la première marche est masquée n'a plus
 * de raison d'afficher les suivantes.
 */
export const vivierComptageStep: SubStep = {
  slug: 'vivier-comptage',
  questions: [
    {
      key: 'talent_pool_identified_band',
      kind: 'single',
      label: 'questions.talentPoolIdentifiedBand.label',
      subtitle: 'questions.talentPoolIdentifiedBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'talent_pool_qualified_band',
      kind: 'single',
      label: 'questions.talentPoolQualifiedBand.label',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      key: 'talent_pool_available_band',
      kind: 'single',
      label: 'questions.talentPoolAvailableBand.label',
      subtitle: 'questions.talentPoolAvailableBand.subtitle',
      choices: choice(...VIVIER_COUNT_BAND_CHOICES),
    },
    {
      // #2046.4 — la disponibilité déclarée est-elle FRAÎCHE ? Bande de
      // RÉCENCE plutôt qu'une date exacte (`Provenance` : source = cette
      // déclaration, date = la bande choisie).
      key: 'talent_pool_availability_recency_band',
      kind: 'single',
      label: 'questions.talentPoolAvailabilityRecencyBand.label',
      subtitle: 'questions.talentPoolAvailabilityRecencyBand.subtitle',
      choices: choice('Cette semaine', 'Ce mois-ci', 'Il y a plus d’un mois', 'Je ne sais pas'),
    },
    {
      key: 'talent_pool_avg_tjm_band',
      kind: 'single',
      label: 'questions.talentPoolAvgTjmBand.label',
      subtitle: 'questions.talentPoolAvgTjmBand.subtitle',
      choices: choice('moins de 400', '400-550', '550-700', '700-900', 'plus de 900'),
      // #2548.2 — TJM moyen : un décideur qui ne fixe pas lui-même le TJM du
      // vivier peut légitimement l'ignorer, même hors activité en création.
      allowUnknown: true,
    },
  ],
}
