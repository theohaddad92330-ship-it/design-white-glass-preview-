import { useQuery } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * Les motifs de perte déjà employés dans l'espace.
 *
 * Ils servent de SUGGESTIONS, pas de liste fermée : imposer un catalogue pousse
 * à cocher « Autre », et « Autre » n'apprend rien à personne. Le champ libre
 * reste le chemin principal ; ces libellés évitent seulement que « budget »,
 * « Budget gelé » et « pas de budget » deviennent trois motifs différents.
 *
 * L'échec est silencieux par construction (`items: []`) : ne pas pouvoir
 * proposer d'ancien motif ne doit jamais empêcher de clore un projet perdu.
 */
export function useLossReasons(enabled: boolean) {
  return useQuery({
    queryKey: projectQueryKeys.lossReasons,
    queryFn: () => projectsApi.listLossReasons(),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
