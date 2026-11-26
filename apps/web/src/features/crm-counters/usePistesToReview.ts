import type { CrmCountersResponse } from '@bellum/contracts'
import { useCrmCounters } from './useCrmCounters'

/**
 * #4191 (recette 2, E2) — LE chiffre des pistes : `pistes_to_review` de `GET /crm-counters`.
 *
 * « Besoins détectés » de Pilotage, ligne « N pistes » du Pipe et en-tête de `/projects/pistes` sont
 * la MÊME population (décision L6) : ils lisent ce seul lecteur, jamais `leads_to_qualify` (les
 * AFFAIRES au stade « à qualifier », une autre population, qui garde son propre libellé).
 * `null` = non mesuré — jamais « 0 » (GA-18/19).
 */
export function pistesToReviewOf(counters?: Pick<CrmCountersResponse['counters'], 'pistes_to_review'>): number | null {
  return counters?.pistes_to_review?.value ?? null
}

export function usePistesToReview(): number | null {
  const { data } = useCrmCounters()
  return pistesToReviewOf(data?.counters)
}
