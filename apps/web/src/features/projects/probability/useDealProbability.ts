import type { CalibratedProbability } from '@bellum/contracts'
import { useProbableQuarter } from './useProbableQuarter'

/**
 * #4016.1b — la probabilité calibrée d'une affaire, lue dans la MÊME réponse que
 * le panneau « CA probable » (même clé de requête : aucun second calcul, GA-26).
 * `null` : l'affaire n'est pas datée dans les trois mois à venir, ou la lecture
 * n'est pas encore là — jamais une valeur devinée.
 */
export function useDealProbability(): (opportunityId: string) => CalibratedProbability | null {
  const { data } = useProbableQuarter()
  return opportunityId => data?.deals?.find(deal => deal.opportunity_id === opportunityId)?.closing_probability ?? null
}
