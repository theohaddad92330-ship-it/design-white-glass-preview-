import { apiFetch } from '@/lib/api'

/**
 * #4967 (lot L6) — LES RECHERCHES DE LAURA EN ARRIÈRE-PLAN, côté serveur.
 *
 * Un tour de l'écran `/chat` part avec `background: true` (`laura-turn.ts`) : il ne meurt plus quand
 * l'écran s'en va, le serveur écrit la réponse dans le fil. Ces deux routes sont ce qui reste au
 * navigateur : savoir qu'un tour de CE fil tourne encore (au retour, après un rechargement), et
 * « Arrêter » — le SEUL geste qui l'abolit. `apiFetch` lève sur toute réponse non `ok`.
 */
export interface RunningChatTurnDto {
  turnId: string
  conversationId: string | null
  startedAt: string
}

export const chatTurnsApi = {
  /** Sans `conversationId` : TOUS les tours en cours de l'utilisateur (L14, retour sur Laura). */
  running(conversationId?: string): Promise<{ turns: RunningChatTurnDto[] }> {
    return apiFetch<{ turns: RunningChatTurnDto[] }>({
      path: conversationId
        ? `/ia/chat/turns/running?conversationId=${encodeURIComponent(conversationId)}`
        : '/ia/chat/turns/running',
    })
  },
  stop(turnId: string): Promise<{ stopped: boolean }> {
    return apiFetch<{ stopped: boolean }>({
      path: `/ia/chat/turns/${encodeURIComponent(turnId)}/stop`,
      method: 'POST',
    })
  },
}
