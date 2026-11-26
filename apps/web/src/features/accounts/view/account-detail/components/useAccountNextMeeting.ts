import type { Account } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { googleApi, type CalendarEventSummary } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'

/**
 * #2117.28 — LE PROCHAIN RENDEZ-VOUS POSÉ SUR CE COMPTE, ou `null`.
 *
 * ⚠ La clé de cache et le filtre sont EXACTEMENT ceux de `MeetingPrepBrief`,
 * qui affiche déjà ce rendez-vous dans l'onglet Synthèse. Ce n'est pas une
 * coïncidence de copier-coller, c'est le point : React Query dédoublonne par
 * clé, donc le hero et la carte lisent la MÊME réponse. Deux clés voisines
 * auraient fait deux requêtes pour une seule information, et un jour deux
 * réponses différentes sur le même écran.
 *
 * ⚠ Sans agenda connecté, ZÉRO réseau : `useGoogleStatus` est lui-même coupé
 * sans session, et la requête d'événements est coupée tant que la capacité de
 * lecture n'est pas accordée. Un agenda non branché n'est pas « aucun
 * rendez-vous » : c'est « on ne sait pas », et la seule conséquence est que le
 * hero ne propose pas de préparer un rendez-vous dont il ignore l'existence.
 */
export function useAccountNextMeeting(account: Account): CalendarEventSummary | null {
  const { data: status } = useGoogleStatus()
  const connected = status?.connected ?? false
  const canRead = status?.capabilities?.calendarRead ?? false
  const filter = account.website?.trim() || account.company_name?.trim() || ''

  const { data } = useQuery({
    queryKey: ['google-upcoming-events', account.id, filter],
    queryFn: () => googleApi.upcomingEvents({ query: filter || undefined, maxResults: 5 }),
    enabled: connected && canRead && filter.length > 0,
    staleTime: 60_000,
  })

  return data?.[0] ?? null
}
