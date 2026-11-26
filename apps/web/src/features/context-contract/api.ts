import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  type ContextMode,
  type ContextSurface,
  type SurfaceContextContract,
  surfaceContextContractSchema,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * #2454 — le contrat de contexte d'une surface (`GET /context-contract`).
 * Parsé à la frontière : un contrat qui dérive devient une requête en échec,
 * donc AUCUNE ligne « Contexte utilisé » — jamais une ligne devinée.
 */
async function fetchSurfaceContextContract(
  surface: ContextSurface,
  mode: ContextMode | undefined,
  signal?: AbortSignal,
): Promise<SurfaceContextContract> {
  // #2451.1 — sans mode, le serveur décrit le défaut de l'ESPACE.
  const search = new URLSearchParams(mode ? { surface, mode } : { surface })
  return surfaceContextContractSchema.parse(
    await apiFetch<unknown>({ path: `/context-contract?${search.toString()}`, method: 'GET', signal }),
  )
}

export function useSurfaceContextContract(
  surface: ContextSurface,
  mode: ContextMode | undefined,
): UseQueryResult<SurfaceContextContract> {
  return useQuery({
    queryKey: ['context-contract', surface, mode ?? 'workspace-default'],
    queryFn: ({ signal }) => fetchSurfaceContextContract(surface, mode, signal),
    // Le profil et les connexions ne bougent pas à la seconde : une minute
    // évite une requête par frappe sans laisser un état périmé longtemps.
    staleTime: 60_000,
  })
}
