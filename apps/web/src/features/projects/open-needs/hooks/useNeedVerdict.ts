import { useQuery } from '@tanstack/react-query'
import { needVerdictApi, needVerdictKeys } from '../api'

/**
 * Le verdict « go / no-go » d'un besoin.
 *
 * ⚠️ Une LECTURE, contrairement à `useRunMatch` qui est une MUTATION. La
 * distinction n'est pas cosmétique : lancer un rapprochement écrit un journal
 * de conformité, cette route relit le dernier déjà exécuté. La monter en
 * `useQuery` est donc exact ici, et le serait faux là-bas.
 */
export function useNeedVerdict(needId: string) {
  const query = useQuery({
    queryKey: needVerdictKeys.get(needId),
    queryFn: () => needVerdictApi.get(needId),
    enabled: needId.length > 0,
    staleTime: 60_000,
  })
  return {
    verdict: query.data?.verdict ?? null,
    profiles: query.data?.profiles ?? [],
    // Refonte Théo — la correspondance en clair des profils POSITIONNÉS (même rapprochement).
    positionedInClear: query.data?.positionedInClear ?? [],
    runAt: query.data?.runAt ?? null,
    // #3390 — `undefined` = une API qui ne le rend pas encore (déploiement
    // web-avant-API) ; le composant le traite comme « rien à afficher »,
    // jamais comme une méthode par défaut inventée.
    method: query.data?.method ?? null,
    // #3390.9 — capacité déclarée + 5P du compte ; `null` = rien à dire (aucune ligne à l'écran).
    commercialContext: query.data?.commercialContext ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
