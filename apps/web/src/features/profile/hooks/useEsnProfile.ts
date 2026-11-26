import { useQuery } from '@tanstack/react-query'
import { hasOfferObjective, type EsnAnswers } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/** The current user's ESN answers (`esn_profiles`), backing the profile editor. */
export function useEsnProfile() {
  const { user } = useSession()
  return useQuery<EsnAnswers>({
    queryKey: esnProfileKeys.mine,
    queryFn: () => esnProfileApi.getMine(),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * #3818.1 — l'espace a-t-il renseigné un objectif commercial (un domaine
 * d'offre) ? Seule lecture, reprise par le badge « Verdict » des quatre
 * écrans de fiche compte (GA-26) au lieu que chacun recalcule sa propre
 * version. Tant que le profil n'a pas fini de charger (`isSuccess` faux —
 * premier rendu, requête en vol), on ne sait pas encore : `true` garde le
 * comportement d'avant (`ÉCARTER POUR CET OBJECTIF` reste possible) plutôt
 * que de clignoter sur « sans objectif » avant la réponse réelle.
 */
export function useHasOfferObjective(): boolean {
  const { data, isSuccess } = useEsnProfile()
  if (!isSuccess) return true
  return hasOfferObjective(data)
}
