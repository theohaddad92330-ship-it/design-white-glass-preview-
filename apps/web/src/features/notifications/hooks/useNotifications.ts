import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { consolidateNotifications, type ConsolidatedNotification, type NotificationInboxScope } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { notificationsApi } from '@/features/notifications/api'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'

const UNREAD_KEY = ['notifications', 'unread-count'] as const
const LIST_KEY = ['notifications', 'list'] as const
const POLL_INTERVAL_MS = 60_000

/**
 * In-app notification feed for the bell dropdown: an unread-count poll plus the
 * (lazily useful) list, and mutations to mark one / all read that refresh both.
 */
export function useNotifications(scope: NotificationInboxScope = 'all') {
  const { user } = useSession()
  const queryClient = useQueryClient()
  // perf P3 — la cloche et la bulle de Laura montent sur CHAQUE page : le compteur
  // et la liste n'ont pas à concurrencer les requêtes de la page (différé, pas supprimé).
  const calm = useDeferredEnabled()
  const enabled = !!user && calm

  const unread = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => notificationsApi.unreadCount(),
    enabled,
    staleTime: 30_000,
    refetchInterval: POLL_INTERVAL_MS,
  })

  const list = useQuery({
    queryKey: [...LIST_KEY, scope],
    queryFn: () => notificationsApi.list(1, 20, scope),
    enabled,
    staleTime: 30_000,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: UNREAD_KEY })
    void queryClient.invalidateQueries({ queryKey: LIST_KEY })
  }

  const markRead = useMutation({
    // #4158.18 — une entrée CALCULÉE (`derived:…`) n'est pas une ligne : rien à marquer lu.
    mutationFn: (id: string) => (id.startsWith('derived:') ? Promise.resolve() : notificationsApi.markRead(id)),
    onSuccess: invalidate,
  })

  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: invalidate,
  })

  // #4648 — « Vider » : la liste et le compteur se relisent sans rechargement (le compteur retombe à 0, hors entrées
  // CALCULÉES « des collègues attendent », qui ne sont pas des lignes et restent vraies tant qu'elles le sont).
  const clearAll = useMutation({
    mutationFn: () => notificationsApi.clearAll(),
    onSuccess: invalidate,
  })

  // #2144.27 — pas deux alertes identiques sans consolidation (même type,
  // même lien, toutes deux non lues) : un seul point de calcul pour la cloche
  // ET la bulle de Laura, les deux consommatrices de ce hook (GA-26).
  const notifications: ConsolidatedNotification[] = consolidateNotifications(list.data?.data ?? [])

  // #2136 — un sondage en échec (401 mesuré en prod pour un utilisateur
  // connecté) ne doit JAMAIS s'afficher « 0 non lu » : « non mesuré » n'est
  // pas mesuré à zéro. Trois états distincts, jamais confondus : `loading`
  // (première réponse pas encore arrivée), `unknown` (le sondage a échoué —
  // `unread.isError`, jusque-là non exposé par ce hook) et `measured` (un
  // vrai nombre, y compris zéro). `unreadCount` ne vaut un nombre QUE dans ce
  // dernier cas — sinon `null`, jamais un 0 fabriqué.
  const unreadCountStatus: 'loading' | 'unknown' | 'measured' = unread.isLoading
    ? 'loading'
    : unread.isError
      ? 'unknown'
      : 'measured'
  const unreadCount = unreadCountStatus === 'measured' ? (unread.data?.count ?? null) : null

  return {
    notifications,
    unreadCount,
    unreadCountStatus,
    isLoading: list.isLoading,
    markRead,
    markAllRead,
    clearAll,
  }
}
