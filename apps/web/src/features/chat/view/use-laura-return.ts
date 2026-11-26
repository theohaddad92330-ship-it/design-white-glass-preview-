import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useSession } from '@/lib/hooks/use-session'
import { clearLeftWhileRunning, isBareChatEntry, resolveReturnConversation } from '@/features/chat/lib/laura-return'

/**
 * #4967 (L14) — au retour sur `/chat` NU, ouvre le fil attendu (en `replace` : retour sans boucle).
 * Rend `true` tant que la décision n'est pas prise : la route montre son état de chargement, pas l'accueil.
 * Une seule décision par entrée sur la page ; démonstration : jamais (aucun tour serveur, #1320).
 */
export function useLauraReturn(search: Readonly<Record<string, unknown>>, enabled: boolean): boolean {
  const navigate = useNavigate()
  const isDemo = useIsDemo()
  const { user } = useSession()
  const userId = user?.id ?? null
  // Figé au montage : `Chat` retire `?fresh=` de l'URL juste après l'avoir lu — relire la recherche ferait
  // d'une entrée explicite une entrée nue, et la page resterait en chargement (effet déjà passé).
  const [bare] = useState(() => isBareChatEntry(search))
  const [decided, setDecided] = useState(false)
  const active = enabled && !isDemo && bare && userId !== null && !decided
  useEffect(() => {
    if (!enabled || isDemo || !bare || !userId) return
    let cancelled = false
    void resolveReturnConversation(userId).then(conversationId => {
      if (cancelled) return
      setDecided(true)
      if (!conversationId) return
      clearLeftWhileRunning(userId, conversationId)
      void navigate({ to: '/chat', search: { conversationId }, replace: true })
    })
    return () => {
      cancelled = true
    }
    // Une décision par entrée : les paramètres ne sont relus qu'au montage de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, enabled, isDemo])
  return active
}
