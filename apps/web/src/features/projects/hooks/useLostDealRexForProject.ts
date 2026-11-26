import { useQuery } from '@tanstack/react-query'
import type { LostDealRex } from '@bellum/contracts'
import { lostDealRexApi } from '../lost-deal-rex-api'

/**
 * #3295 (reste) — LECTURE des REX de perte déjà recueillis sur ce projet.
 *
 * `GET /capitalisation/projects/:id/lost-deal-rex` existait côté API
 * (#3272.5) sans aucun appelant côté web — exactement le défaut que la
 * doctrine du dépôt nomme : « du code juste, calculé, testé, que personne
 * n'appelle ». Ce hook est le premier appelant.
 */
export function useLostDealRexForProject(projectId: string) {
  const query = useQuery({
    queryKey: ['lost-deal-rex', 'project', projectId] as const,
    queryFn: () => lostDealRexApi.listForProject(projectId),
    enabled: projectId.length > 0,
  })
  return {
    items: (query.data?.items ?? []) as LostDealRex[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
