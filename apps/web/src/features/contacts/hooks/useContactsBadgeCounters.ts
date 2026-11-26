import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { useDeferredEnabled } from '@/lib/hooks/use-deferred-enabled'
import { contactsApi } from '../api'

export const CONTACTS_BADGE_COUNTERS_KEY = ['contacts-badge-counters'] as const

/**
 * #2155.24/.25 — le compteur du badge de navigation « Contacts ».
 *
 * `readyToProcess` compte les contacts « prêts à traiter » (QCM Louis
 * 15/09/2026 : coordonnée vérifiée + compte du portefeuille + aucune action
 * ouverte) — jamais un volume total de contacts.
 *
 * ⚠️ Rend `undefined` aussi bien quand la mesure a échoué que quand la
 * population est vide : dans les deux cas, l'appelant (le rendu de la barre
 * latérale) ne doit RIEN afficher — une valeur absente ne s'affiche jamais
 * « 0 ». Le formatage (masquer un zéro, plafonner « 99+ ») vit dans
 * `formatNavBadgeCount`, pas ici : cette dérivation ne doit exister qu'à un
 * seul endroit.
 */
export function useContactsReadyToProcessCount(): number | undefined {
  const { user } = useSession()
  // perf P3 — un badge de barre latérale n'est pas sur le chemin critique : différé,
  // sans badge (jamais « 0 ») tant qu'il n'est pas lu.
  const calm = useDeferredEnabled()
  const { data } = useQuery({
    queryKey: CONTACTS_BADGE_COUNTERS_KEY,
    queryFn: () => contactsApi.getBadgeCounters(),
    enabled: !!user && calm,
    staleTime: 60_000,
  })
  return data?.readyToProcess
}
