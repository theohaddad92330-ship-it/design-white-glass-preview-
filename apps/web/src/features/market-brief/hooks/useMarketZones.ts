import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { createMarketZone, getMarketZone, listMarketZones, type MarketZoneDetail } from '../api/market-brief-api'

const STALE_MS = 5 * 60_000

/** Les zones de l'espace (≤ 10). Une erreur est une erreur : jamais « aucune zone ». */
export function useMarketZones() {
  const { user } = useSession()
  return useQuery({
    queryKey: ['market-zones'],
    queryFn: listMarketZones,
    enabled: !!user,
    staleTime: STALE_MS,
  })
}

/**
 * #3828.2 — créer une zone depuis l'écran Marché, quand l'espace n'en a
 * aucune (la puce « Marché local » d'un compte dépend d'au moins une zone
 * qui le nomme). Invalide la liste, jamais un ajout optimiste : une zone
 * fraîchement créée n'a aucun compte lié tant que le serveur ne l'a pas
 * calculé (GA-26 — un seul endroit qui sait dire quels comptes une zone lie).
 */
export function useCreateMarketZone() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: createMarketZone,
    onSuccess: () => client.invalidateQueries({ queryKey: ['market-zones'] }),
  })
}

export function useMarketZone(zoneId: string | undefined) {
  const { user } = useSession()
  return useQuery<MarketZoneDetail>({
    queryKey: ['market-zones', zoneId],
    queryFn: () => getMarketZone(zoneId!),
    enabled: Boolean(zoneId) && !!user,
    staleTime: STALE_MS,
  })
}

/**
 * Les zones auxquelles un compte est lié (puce de la fiche compte). L'API ne
 * sait pas répondre « quelles zones pour ce compte » : les comptes liés se
 * calculent à la lecture d'une zone, on lit donc le détail des zones de
 * l'espace (≤ 10, garde 5 min) et on retient celles qui nomment ce compte.
 */
export function useAccountMarketZones(accountId: string | undefined) {
  const zones = useMarketZones()
  const details = useQueries({
    queries: (zones.data ?? []).map(zone => ({
      queryKey: ['market-zones', zone.id],
      queryFn: () => getMarketZone(zone.id),
      staleTime: STALE_MS,
    })),
  })
  const linked = details
    .map(query => query.data)
    .filter((zone): zone is MarketZoneDetail => zone !== undefined)
    .filter(zone => zone.linked_accounts.some(account => account.account_id === accountId))
    .map(zone => ({ id: zone.id, label: zone.label }))
  return { zones: accountId ? linked : [] }
}
