import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ChatPresenceMember } from '@bellum/contracts'
import { fetchChatPresence, sendChatPresenceHeartbeat } from '@/features/chat/api/agentChatApi'

/**
 * #3086 — « afficher si une personne est sur une conversation » (Apricot
 * Labs, deux sièges, un même espace).
 *
 * Le navigateur bat toutes les {@link HEARTBEAT_INTERVAL_MS} tant que le fil
 * reste MONTÉ (`setInterval`, jamais `useQuery` : le battement est un EFFET,
 * pas une donnée à mettre en cache). Le serveur efface un membre après deux
 * battements manqués (`PRESENCE_TTL_MS`, 25 s) — fermer l'onglet ou changer de
 * fil suffit à disparaître, sans geste de départ explicite à écrire.
 *
 * La lecture, elle, reste un `useQuery` classique : c'est une DONNÉE (qui est
 * là), pas un effet, et `refetchInterval` la garde fraîche au même rythme.
 */
const HEARTBEAT_INTERVAL_MS = 10_000

export function useChatPresence(accountId: string | null, conversationId: string | null): ChatPresenceMember[] {
  useEffect(() => {
    const beat = () => void sendChatPresenceHeartbeat({ accountId, conversationId }).catch(() => undefined)
    beat()
    const id = window.setInterval(beat, HEARTBEAT_INTERVAL_MS)
    return () => window.clearInterval(id)
    // #3086 — changer de fil (compte ou conversation) rebat IMMÉDIATEMENT sur le
    // nouveau : sans ce redémarrage, le fil quitté resterait « occupé » jusqu'à
    // ce que son TTL serveur expire tout seul.
  }, [accountId, conversationId])

  const { data } = useQuery<{ members: ChatPresenceMember[] }, Error>({
    queryKey: ['chat', 'presence', accountId, conversationId],
    queryFn: () => fetchChatPresence({ accountId, conversationId }),
    refetchInterval: HEARTBEAT_INTERVAL_MS,
    refetchIntervalInBackground: false,
    retry: false,
  })

  return data?.members ?? []
}
