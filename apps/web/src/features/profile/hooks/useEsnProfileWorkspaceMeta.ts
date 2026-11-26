import { useQuery } from '@tanstack/react-query'
import type { EsnProfileWorkspaceMeta } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * How the ESN profile is shared in the caller's workspace: `shared` = a
 * canonical company profile exists, `canEditCompany` = the caller may edit
 * the company fields (owner/admin, or legacy per-user profile). Drives the
 * "Profil de l'entreprise (partagé)" vs "Mes préférences personnelles" split
 * on Réglages › Profil.
 */
export function useEsnProfileWorkspaceMeta() {
  const { user } = useSession()
  return useQuery<EsnProfileWorkspaceMeta>({
    queryKey: esnProfileKeys.workspaceMeta,
    queryFn: () => esnProfileApi.getWorkspaceMeta(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
