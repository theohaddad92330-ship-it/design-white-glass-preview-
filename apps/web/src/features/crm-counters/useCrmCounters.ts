import { useQuery } from '@tanstack/react-query'
import type { CrmCountersResponse } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #4193 — LA SEULE LECTURE des totaux Affaires / Talents / Missions
 * (`GET /crm-counters`). Un écran qui a besoin d'un total le lit ici ; il ne le
 * recompte pas (garde `one-counter-one-source`).
 *
 * `scope: 'own'` demande « mon » périmètre ; la réponse porte le périmètre
 * réellement servi.
 *
 * Une réponse sans `counters` (service injoignable derrière un proxy, corps
 * d'un autre contrat) est une ERREUR de requête : `data` reste vide et l'écran
 * dit « — ». Elle ne doit jamais faire tomber la page qui lit le total.
 */
export async function fetchCrmCounters(scope?: 'own'): Promise<CrmCountersResponse> {
  const response = await apiFetch<CrmCountersResponse>({
    path: scope ? `/crm-counters?scope=${scope}` : '/crm-counters',
  })
  if (!response?.counters) throw new Error('Réponse /crm-counters sans compteurs')
  return response
}

export function useCrmCounters(scope?: 'own') {
  return useQuery({
    queryKey: ['crm-counters', scope ?? 'workspace'] as const,
    queryFn: () => fetchCrmCounters(scope),
    retry: false,
  })
}
