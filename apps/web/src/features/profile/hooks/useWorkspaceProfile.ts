import { useContext } from 'react'
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query'
import { workspaceProfileOf, type EsnAnswers, type WorkspaceProfile } from '@bellum/contracts'
import { SessionContext } from '@/features/auth/session-context'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'

/** Jamais interrogé : il ne sert qu'à un arbre sans fournisseur, où la requête
 *  reste désactivée. */
const DETACHED_CLIENT = new QueryClient()

/**
 * #4270.1 (18/10) — le profil d'espace (« forfait / conseil »), lu dans les
 * réponses du profil ESN — la MÊME requête que `useEsnProfile` (même clé, même
 * cache), un seul endroit (GA-26). `null` tant que le profil charge ou quand
 * rien n'est choisi : la navigation historique.
 *
 * ⚠️ Lu par la barre latérale et les onglets de section, montés sur chaque
 * écran : il TOLÈRE un arbre sans session ni client de requêtes (la requête
 * reste alors désactivée et rend `null`) au lieu de lever comme `useSession`.
 */
export function useWorkspaceProfile(): WorkspaceProfile | null {
  const session = useContext(SessionContext)
  const client = useContext(QueryClientContext)
  const { data } = useQuery<EsnAnswers>(
    {
      queryKey: esnProfileKeys.mine,
      queryFn: () => esnProfileApi.getMine(),
      enabled: !!session?.user && !!client,
      staleTime: 60_000,
    },
    client ?? DETACHED_CLIENT,
  )
  return workspaceProfileOf(data)
}
