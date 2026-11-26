import { useQuery } from '@tanstack/react-query'
import type { AccountPartner } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

type AccountPartnersLandscape = {
  partners: (AccountPartner & { score: number })[]
}

/**
 * #2646.2 — LA MÊME LECTURE QUE L'ONGLET PARTENAIRES, PARTAGÉE PAR SA CLÉ.
 *
 * `TabPartners.tsx` demande déjà `GET /accounts/:id/partners` sous la clé
 * `['partners', accountId]`. Un second composant qui redéfinirait sa propre
 * requête sur la MÊME route ferait deux vérités possibles sur la même donnée ;
 * celui-ci partage donc la clé — React Query sert la même réponse aux deux
 * sans second appel réseau quand les deux sont montés à la fois.
 */
export function useAccountPartnersLandscape(accountId: string) {
  return useQuery({
    queryKey: ['partners', accountId],
    queryFn: () => apiFetch<AccountPartnersLandscape>({ path: `/accounts/${accountId}/partners` }),
  })
}
