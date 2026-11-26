import {
  COMPETING_WORKLOADS,
  PROTECTED_SLOT_CAPACITY,
  WEEKLY_SALES_TIME_SLOTS,
  WORKLOAD_VARIABILITY,
} from '@bellum/contracts'
import type { SubStep } from './types'
import { choice } from './types'

/**
 * Sous-étape `temps-charge` du stage `company_info` — lot L19 (#2050).
 *
 * Le pendant de `temps` : la sous-étape précédente mesure les trois états du
 * temps commercial, celle-ci demande CE QUI PREND LE RESTE. Les deux ensemble
 * répondent à « ce que cette ESN peut réellement engager » — un chiffre d'heures
 * sans la charge qui l'entoure se relit comme une promesse.
 *
 * Elle est séparée plutôt que fondue dans `temps` pour la même raison que les
 * neuf autres sous-étapes existent : un écran court, jamais un mur de sept
 * questions — et sur mobile, qui est le produit et non un repli.
 *
 * ⚠️ « Le recrutement et la qualification des candidats » (#2050.7) est une
 * CHARGE de semaine ; `recruits_for_clients` (#1124) est une OFFRE (placer des
 * CDI chez le client). Les deux ne se déduisent pas l'un de l'autre, et l'un ne
 * remplace pas l'autre.
 */
export const tempsChargeStep: SubStep = {
  slug: 'temps-charge',
  questions: [
    {
      // #2050.3 à #2050.8 — les cinq activités concurrentes nommées, et rien de
      // plus : une sixième famille ajoutée ici serait une charge inventée.
      key: 'competing_workloads',
      kind: 'multi',
      label: 'questions.competingWorkloads.label',
      subtitle: 'questions.competingWorkloads.subtitle',
      choices: choice(...COMPETING_WORKLOADS),
    },
    {
      // #2050.9 — la charge variable. Une charge imprévisible ne se moyenne pas.
      key: 'workload_variability',
      kind: 'single',
      label: 'questions.workloadVariability.label',
      choices: choice(...WORKLOAD_VARIABILITY),
    },
    {
      // #2050.2 — QUAND le temps tombe, dans les heures ouvrées.
      key: 'weekly_sales_time_slots',
      kind: 'multi',
      label: 'questions.weeklySalesTimeSlots.label',
      subtitle: 'questions.weeklySalesTimeSlots.subtitle',
      choices: choice(...WEEKLY_SALES_TIME_SLOTS),
    },
    {
      // #2050.10 — la capacité à PROTÉGER un créneau, distincte de sa durée :
      // dix heures qui sautent chaque semaine ne sont pas dix heures.
      key: 'protected_slot_capacity',
      kind: 'single',
      label: 'questions.protectedSlotCapacity.label',
      choices: choice(...PROTECTED_SLOT_CAPACITY),
    },
  ],
}
