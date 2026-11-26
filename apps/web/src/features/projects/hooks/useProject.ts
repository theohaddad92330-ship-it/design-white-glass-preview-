import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * UN projet, par son identité — ce que lit son DOSSIER (`/projects/$id`, #2801).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ELLE LIT LA MÊME LIGNE QUE LA LISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /projects?id=…`, c'est-à-dire le même `SELECT`, la même décoration
 * (`withEvidence`, `withDecayedConfidence`). Même précédent que `useMission`
 * (D200, 30/08/2026) : une seconde route serveur aurait fabriqué une seconde
 * vérité — deux écrans qui ne disent pas la même chose du même projet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ ELLE RETROUVE SON PROJET, ELLE NE PREND PAS LA PREMIÈRE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le serveur IGNORE un `?id=` illisible et rend alors la liste entière — c'est
 * son arbitrage (`ProjectsController.list`), et il est bon : un lien collé de
 * travers doit montrer quelque chose. Mais lire `projects[0]` ici afficherait
 * le projet d'un AUTRE sous le titre de celui qu'on croyait ouvrir. Le `find`
 * est donc la moitié qui rend l'arbitrage du serveur tenable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS ÉTATS, PAS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `isPending` — on ne sait pas encore. `notFound` — la lecture a ABOUTI et ce
 * projet n'est pas dans cet espace : c'est une vraie réponse, elle envoie
 * chercher ailleurs. `isError` — la lecture a échoué, et celle-là envoie
 * réessayer. « Cassé » et « introuvable » se ressemblent trop pour partager
 * une phrase.
 */
export function useProject(id: string) {
  const { user } = useSession()
  const result = useQuery({
    queryKey: projectQueryKeys.byId(user?.id, id),
    queryFn: () => projectsApi.byId(id),
    enabled: !!user && id.length > 0,
    // Une condition enregistrée à l'instant doit se relire à l'instant.
    staleTime: 0,
    refetchOnMount: 'always',
  })
  const project = result.data?.find(row => row.id === id)
  return {
    project,
    isPending: result.isPending,
    isError: result.isError,
    refetch: result.refetch,
    notFound: result.isSuccess && project === undefined,
  }
}
