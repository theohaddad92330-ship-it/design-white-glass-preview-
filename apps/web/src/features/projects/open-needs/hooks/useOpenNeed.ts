import { useQuery } from '@tanstack/react-query'
import type { OpenNeedRow } from '@bellum/contracts'
import { openNeedsApi, openNeedsKeys } from '../api'

/**
 * UN besoin, par son identité — ce que lit la FICHE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE PASSE PAR LA MÊME LECTURE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * La fiche montre EXACTEMENT la ligne du tableau : même rôle, même TJM cible,
 * même compteur de shortlist, même âge d'étape, même verdict `staffable`. Une
 * seconde route serveur la recomposerait ailleurs — deuxième `SELECT`,
 * deuxième mise en forme — et « une dérivation vit à un seul endroit » est
 * précisément la loi qu'on paye quand deux chemins la refont : la fiche et la
 * liste finiraient par ne plus dire la même chose du même besoin.
 *
 * D'où le filtre `id` sur `GET /projects/needs`, et non `GET /projects/needs/:id`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS ÉTATS, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `need: undefined` + `isPending: true` — on ne sait pas encore. L'écran attend.
 * `need: undefined` + `isPending: false` — la lecture a abouti et n'a rien
 * trouvé : ce besoin n'existe pas dans cet espace. C'est une VRAIE réponse.
 * `isError` — la lecture a échoué. « Cassé » et « introuvable » se ressemblent
 * trop pour partager une phrase : la première envoie réessayer, la seconde
 * envoie chercher ailleurs.
 */
export function useOpenNeed(needId: string) {
  // ⚠️ `limit: 1` et non `limit: 50` : la clé de cache EST la requête, donc
  // deux formes de la même demande produiraient deux entrées de cache pour la
  // même fiche — et l'une des deux serait toujours périmée après une action.
  const query = { id: needId, offset: 0, limit: 1 } as const
  const result = useQuery({
    queryKey: openNeedsKeys.list(query),
    queryFn: () => openNeedsApi.list(query),
    enabled: needId.length > 0,
  })
  const need: OpenNeedRow | undefined = result.data?.data[0]
  return {
    need,
    isPending: result.isPending,
    isError: result.isError,
    refetch: result.refetch,
    /** La lecture a abouti et le besoin n'est pas là. Distinct de « ça charge ». */
    notFound: result.isSuccess && need === undefined,
  }
}
