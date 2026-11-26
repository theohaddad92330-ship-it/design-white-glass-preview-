import { useEffect, useState } from 'react'
import { chatTurnsApi, type RunningChatTurnDto } from '@/features/chat/api/chatTurnsApi'

/** Le rythme de relecture d'un tour serveur encore en cours — un tour dure des dizaines de secondes. */
const POLL_MS = 4_000

/**
 * #4967 (lot L6) — UN TOUR DE CE FIL TOURNE-T-IL ENCORE CÔTÉ SERVEUR ?
 *
 * L'écran qui ARRIVE sur un fil (retour d'un autre écran ou d'un autre fil, rechargement, nouvel
 * onglet) le demande une fois ; tant que le serveur dit « en cours », il redemande. Quand le tour
 * a fini, le hook rend `null` : l'écran relit le fil, où le SERVEUR a écrit la réponse — la seule
 * source de vérité du contenu. Une lecture qui échoue rend `null` (jamais un « en cours » deviné).
 */
export function useServerRunningTurn(conversationId: string | null, enabled: boolean): RunningChatTurnDto | null {
  const [turn, setTurn] = useState<RunningChatTurnDto | null>(null)
  useEffect(() => {
    setTurn(null)
    if (!enabled || !conversationId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = async () => {
      try {
        const { turns } = await chatTurnsApi.running(conversationId)
        if (cancelled) return
        const running = turns.find(entry => entry.conversationId === conversationId) ?? null
        setTurn(running)
        if (running) timer = setTimeout(() => void check(), POLL_MS)
      } catch {
        if (!cancelled) setTurn(null)
      }
    }
    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [conversationId, enabled])
  return turn
}
