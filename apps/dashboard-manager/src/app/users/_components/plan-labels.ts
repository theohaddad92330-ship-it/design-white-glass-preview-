import type { PlanKey } from '@/lib/admin'

/**
 * #4423.2 / #4422.2 — le NOM d'un palier est le même dans le back-office et dans l'app (`billing.planNames`,
 * FR) : le BO disait « Essai Pro » là où l'app dit « Essai gratuit ». Une note de contexte (palier retiré de
 * la vente, sur devis) s'ajoute APRÈS le nom, elle ne le remplace pas.
 */
export const PLAN_NAMES: Readonly<Record<PlanKey, string>> = {
  trial: 'Essai gratuit',
  starter: 'Starter-Solo',
  team: 'Team',
  growth: 'Growth',
  beta: 'Beta',
}

export const PLAN_NOTES: Readonly<Partial<Record<PlanKey, string>>> = {
  starter: 'retiré de la vente',
  team: 'sur devis',
}

export const planLabel = (plan: PlanKey): string => {
  const note = PLAN_NOTES[plan]
  return note ? `${PLAN_NAMES[plan]} (${note})` : PLAN_NAMES[plan]
}
