import { useQuery } from '@tanstack/react-query'
import type { ProjectReadinessRow } from '@bellum/contracts'
import { useContext } from 'react'
import { SessionContext } from '@/features/auth/session-context'
import { projectsApi, projectQueryKeys } from '../api'

/** #4137 — les dossiers archivés de l'espace, lus à la demande (onglet « Archivés » du pipe). */
export function useArchivedProjects() {
  // `useContext` et non `useSession` : le compteur « Hors pipe » du Pipeline le lit, et `useSession` JETTE
  // hors d'un `<SessionProvider>` (même choix que `useProjectOwners`).
  const user = useContext(SessionContext)?.user ?? null
  return useQuery<ProjectReadinessRow[]>({
    queryKey: projectQueryKeys.archived(user?.id),
    queryFn: projectsApi.listArchived,
    enabled: !!user,
    staleTime: 30_000,
  })
}
