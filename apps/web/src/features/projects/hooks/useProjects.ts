import { useQuery } from '@tanstack/react-query'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * Materialized opportunities for the portfolio (`GET /opportunities`). Same cache
 * posture as the Besoins feed it enriches. `enabled` lets callers gate the fetch
 * (e.g. only when a detail panel opens).
 *
 * #2170.20 (lot W20) — typé `ProjectReadRow[]`, pas `ProjectRow[]` : le champ
 * `evidence` (niveau de preuve) est déjà calculé et servi par `GET /projects`
 * (`withEvidence`, `projects.service.ts`) mais un typage plus étroit ici
 * l'effaçait à la frontière — exactement le défaut n°1 du dépôt, vu depuis le
 * web : une donnée que le serveur rend et qu'aucun type ne laisse lire.
 *
 * #3266.16 — resserré à `ProjectReadinessRow` (sur-ensemble de `ProjectReadRow`,
 * `opportunity-readiness.ts`) pour la même raison : `readiness` est calculé et
 * servi par la même route, un typage plus étroit ici l'effacerait pareillement.
 */
export function useProjects(enabled = true) {
  const { user } = useSession()

  return useQuery<ProjectReadinessRow[]>({
    queryKey: projectQueryKeys.list(user?.id),
    queryFn: projectsApi.list,
    enabled: enabled && !!user,
    staleTime: 30_000,
  })
}
