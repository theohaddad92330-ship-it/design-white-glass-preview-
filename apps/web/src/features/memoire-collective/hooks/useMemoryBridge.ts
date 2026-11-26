import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { memoryBridgeApi } from '../api'

/** La clé de cache, exportée : la réécrire à la main est un défaut connu du dépôt. */
const MEMORY_BRIDGE_KEY = (accountId: string) => ['memory-bridge', accountId] as const

/**
 * Ce que l'espace sait déjà de ce compte — lu par le bandeau Collaboration de
 * la fiche. (Louis 14/10/2026, refonte Pilotage : les écrans « Mémoire
 * collective » sont supprimés ; l'API des croisements reste servie, la fiche
 * compte et le futur Cockpit la consomment.)
 *
 * ⚠️ `staleTime: 0` : une collision de prospection se périme en heures, pas en
 * minutes. Rendre une carte « Sarah prépare aussi une approche » qui date de la
 * veille ferait déranger quelqu'un pour rien.
 */
export function useMemoryBridge(accountId: string) {
  const { user } = useSession()

  const bridge = useQuery({
    queryKey: MEMORY_BRIDGE_KEY(accountId),
    queryFn: () => memoryBridgeApi.view(accountId),
    enabled: !!user && !!accountId,
    staleTime: 0,
    retry: false,
  })

  return { bridge }
}
