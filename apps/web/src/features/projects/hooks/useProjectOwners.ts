import { useQuery } from '@tanstack/react-query'
import { useCallback, useContext, useMemo } from 'react'
import type { WorkspaceRole } from '@bellum/contracts'
import { SessionContext } from '@/features/auth/session-context'
import { apiFetch } from '@/lib/api'

/**
 * QUI PORTE CE PROJET, ET QUI SUIS-JE — #1328 (9/9), colonne « Owner » et
 * pastille « Mes projets ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE HOOK PLUTÔT QUE `useWorkspaceMembers`
 * ─────────────────────────────────────────────────────────────────────────────
 * `useWorkspaceMembers` appelle `useSession()`, qui **jette** hors d'un
 * `<SessionProvider>`. Le brancher dans l'écran des projets a fait tomber vingt
 * tests d'un coup — des tests qui ne parlent ni de session ni de membres, et qui
 * rendaient l'écran depuis des années. Les trois écrans qui l'utilisent déjà
 * s'en sortent en le MOQUANT (`vi.mock(...)`), ce qui marche et laisse un piège :
 * le prochain test de cet écran tombera dans le même trou, et la personne qui
 * l'écrira cherchera d'abord ailleurs.
 *
 * Ce hook lit donc le CONTEXTE directement. Hors provider, il rend une liste
 * vide au lieu de jeter — ce qui est la bonne réponse ici : « je ne sais pas
 * nommer les porteurs » se rend « — », et la pastille « Mes projets » disparaît.
 * L'écran reste juste ; il est simplement moins bavard.
 *
 * ⚠️ Ce n'est PAS un second client des membres de l'espace : c'est la même
 * route, la même clé de cache et le même `staleTime` que `useWorkspaceMembers`,
 * donc react-query sert la MÊME entrée. Deux clés différentes feraient deux
 * requêtes et, un jour, deux listes qui ne disent pas la même chose.
 */
type WorkspaceMember = {
  userId: string
  email: string | null
  fullName: string | null
  role: WorkspaceRole
  isSelf: boolean
}

export function useProjectOwners(): {
  /** L'identité du lecteur, ou `null` si on ne la connaît pas. */
  selfId: string | null
  /** Le nom du porteur, ou `null` — jamais un identifiant brut. */
  ownerName: (ownerId: string | null) => string | null
  /**
   * #2170.26 — LA LISTE POUR ATTRIBUER, pas seulement pour NOMMER.
   *
   * `ownerName` suffisait tant que personne n'écrivait le porteur ; un
   * sélecteur a besoin de la liste elle-même. Même source, même requête — un
   * second hook qui la relirait ferait deux appels pour la même donnée.
   */
  members: Array<{ id: string; name: string }>
} {
  // ⚠️ `useContext` et non `useSession()` : voir l'en-tête. Le `?.` est la
  // différence entière entre un écran qui se tait et un écran qui plante.
  const session = useContext(SessionContext)
  const user = session?.user ?? null
  const { data: members = [] } = useQuery<WorkspaceMember[], Error>({
    // La MÊME clé que `useWorkspaceMembers` : une entrée de cache, une requête.
    queryKey: ['workspace', 'members', user?.id],
    queryFn: () => apiFetch<WorkspaceMember[]>({ path: '/workspaces/members' }),
    enabled: !!user,
    staleTime: 60_000,
  })

  const selfId = members.find(member => member.isSelf)?.userId ?? null
  const ownerName = useCallback(
    (ownerId: string | null): string | null => {
      if (!ownerId) return null
      const member = members.find(item => item.userId === ownerId)
      // Un identifiant brut ne s'affiche JAMAIS : personne ne reconnaît un UUID.
      // Un porteur qu'on ne sait pas nommer se rend « — » — moins précis que la
      // vérité, beaucoup moins faux que trente-six caractères hexadécimaux.
      return member?.fullName ?? member?.email ?? null
    },
    [members],
  )

  const members_ = useMemo(
    () =>
      members.map(member => ({
        id: member.userId,
        // Un identifiant brut ne s'affiche JAMAIS : même règle que `ownerName`.
        name: member.fullName ?? member.email ?? member.userId,
      })),
    [members],
  )

  return { selfId, ownerName, members: members_ }
}
