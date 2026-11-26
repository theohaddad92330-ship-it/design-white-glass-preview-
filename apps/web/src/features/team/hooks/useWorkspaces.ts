import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ActiveWorkspace, WorkspaceSummary } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { clearClientUserState } from '@/features/auth/clear-client-user-state'
import { useSession } from '@/lib/hooks/use-session'
import { teamApi } from '../api'

export const WORKSPACES_KEY = ['workspaces'] as const

/**
 * The workspaces the user belongs to, and the switch between them.
 *
 * Why this exists: signup provisions a personal workspace for everyone, so a
 * user who tried the product before being invited already owned one — and the
 * API always resolved to it. Accepting an ESN's invitation wrote a correct
 * membership row and then went nowhere. `workspace_members` was always
 * many-to-many; what was missing was the choice of which membership is active.
 *
 * **Switching invalidates EVERYTHING.** Practically every cached query
 * (accounts, contacts, dashboard, credits, notifications) is scoped to the
 * active workspace server-side, so keeping any of it after a switch would render
 * one workspace's data under another's name. `clear()` + a hard reload is the
 * only honest option: it guarantees nothing survives the boundary, rather than
 * relying on us having remembered every query key.
 *
 * #2644.1 — GA-43 : le coût d'accès (et toute donnée) ne s'agrège JAMAIS entre
 * espaces, ce sont des concurrents. Un `qc.clear()` seul ne suffisait pas : le
 * scroll infini des comptes et des contacts persiste sa page courante en
 * localStorage (`useAccountsStore`/`useContactsStore`), hors de portée de
 * react-query — et donc du hard reload qui suit (localStorage survit à un
 * rechargement). Le hard reload rechargeait alors le cache de l'espace QUITTÉ
 * sous le nom du nouveau, le temps que le scroll infini le réécrive.
 *
 * Plutôt qu'une seconde liste de caches à vider ici (GA-26 : un réglage vit à
 * un seul endroit), on réutilise `clearClientUserState` — le mécanisme que la
 * déconnexion utilise déjà pour la MÊME garantie (« aucune donnée d'un compte
 * ne survit à la frontière suivante »), comptes/contacts compris.
 */
export function useWorkspaces() {
  const { user } = useSession()

  const query = useQuery({
    queryKey: WORKSPACES_KEY,
    queryFn: () => teamApi.listWorkspaces(),
    enabled: !!user,
    staleTime: 60_000,
  })

  const switchWorkspace = useMutation<ActiveWorkspace, Error, string>({
    mutationFn: workspaceId => teamApi.switchWorkspace({ workspaceId }),
    onSuccess: active => {
      toast.success(i18n.t('team:workspaces.switched', { name: active.workspaceName }))
      // Drop every cached response (react-query + the persisted Zustand
      // caches) before navigating: none of it belongs to the workspace we are
      // now in. Fire-and-forget, comme dans `session-manager.ts` : la partie
      // synchrone (react-query, Zustand, localStorage) s'exécute avant le
      // hard reload ci-dessous ; seul le nettoyage IndexedDB reste best-effort.
      void clearClientUserState()
      window.location.assign('/briefing')
    },
    onError: error => toast.error(error.message || i18n.t('team:workspaces.switchError')),
  })

  const workspaces: WorkspaceSummary[] = query.data ?? []

  return {
    workspaces,
    /** The workspace the user is working in right now, if the list resolved. */
    active: workspaces.find(workspace => workspace.isActive),
    /** A switcher is only meaningful once there is somewhere to switch TO. */
    canSwitch: workspaces.length > 1,
    isLoading: query.isLoading,
    isError: query.isError,
    switchWorkspace,
  }
}
