import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OfferPortfolioPatch, ResolvedPortfolio } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Le portefeuille d'offre de la société (addendum Stelya §5).
 *
 * `source` fait partie de la réponse et l'écran le rend : « rien n'est encore
 * configuré » n'est pas la même chose qu'une configuration vide, et afficher
 * des défauts sans le dire les ferait passer pour un choix que personne n'a
 * fait.
 */
export function useOfferPortfolio() {
  const { user } = useSession()
  return useQuery<ResolvedPortfolio>({
    queryKey: esnProfileKeys.offerPortfolio,
    queryFn: () => esnProfileApi.getOfferPortfolio(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * Écriture PARTIELLE : on n'envoie que ce qui change.
 *
 * La réponse du serveur devient la nouvelle valeur du cache — c'est LUI qui
 * dérive le type de société et qui sait si la ligne écrite était la canonique.
 * Recomposer l'état côté navigateur ferait diverger l'écran de la base au
 * premier champ dérivé.
 */
export function useUpdateOfferPortfolio() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: OfferPortfolioPatch) => esnProfileApi.updateOfferPortfolio(patch),
    onSuccess: resolved => {
      queryClient.setQueryData(esnProfileKeys.offerPortfolio, resolved)
    },
  })
}
