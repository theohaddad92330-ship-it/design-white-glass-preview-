import { useQuery } from '@tanstack/react-query'
import type { Consultant } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { consultantsApi } from './api'

/**
 * #2152.27 — le vivier de l'équipe, isolé de `hooks.ts`.
 *
 * Pourquoi un fichier à part : `RfpProfilesCard` (monté par /projects) n'a besoin que de cette liste.
 * L'importer depuis `hooks.ts` faisait entrer dans la fermeture d'imports de /projects tous les
 * lecteurs du vivier du vivier, et la garde `hygiene-routes.spec.ts` ne savait plus dire NON.
 */
const viverKey = (userId?: string) => ['consultants', userId] as const

/** Le vivier de l'équipe. */
export function useConsultants() {
  const { user } = useSession()
  return useQuery<Consultant[]>({
    queryKey: viverKey(user?.id),
    queryFn: consultantsApi.list,
    enabled: !!user,
    staleTime: 30_000,
  })
}
