import type {
  BeeperChatMessagesResponse,
  BeeperConversationsResponse,
  BeeperRegisterRequest,
  BeeperSendRequest,
  BeeperSendResult,
  BeeperStatus,
} from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4406 — Beeper Desktop de l'utilisateur, côté web.
 *
 * Aucune réponse ne porte un jeton : le serveur le garde chiffré. Les conversations se lisent EN DIRECT
 * à l'ouverture de Messagerie (`staleTime` court, rien n'est persisté côté navigateur non plus).
 */
export const beeperApi = {
  status(): Promise<BeeperStatus> {
    return apiFetch<BeeperStatus>({ path: '/beeper/status' })
  },
  /** Enregistre l'URL distante et rend l'URL de consentement OAuth (PKCE côté serveur). */
  connect(body: BeeperRegisterRequest): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/beeper/connect', method: 'POST', body })
  },
  disconnect(): Promise<{ revoked: boolean; warning: string | null }> {
    return apiFetch<{ revoked: boolean; warning: string | null }>({ path: '/beeper', method: 'DELETE' })
  },
  conversations(): Promise<BeeperConversationsResponse> {
    return apiFetch<BeeperConversationsResponse>({ path: '/beeper/conversations' })
  },
  messages(chatId: string): Promise<BeeperChatMessagesResponse> {
    return apiFetch<BeeperChatMessagesResponse>({ path: `/beeper/chats/${encodeURIComponent(chatId)}/messages` })
  },
  /** L'ENVOI — un clic de l'utilisateur sur un texte relu ; la porte d'écriture côté serveur. */
  send(chatId: string, body: BeeperSendRequest): Promise<BeeperSendResult> {
    return apiFetch<BeeperSendResult>({
      path: `/beeper/chats/${encodeURIComponent(chatId)}/send`,
      method: 'POST',
      body,
    })
  },
}

export const BEEPER_STATUS_KEY = ['beeper-status'] as const
const BEEPER_CONVERSATIONS_KEY = ['beeper-conversations'] as const

export function useBeeperStatus() {
  const { user } = useSession()
  return useQuery<BeeperStatus>({
    queryKey: [...BEEPER_STATUS_KEY, user?.id],
    queryFn: () => beeperApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Lu seulement quand Beeper est branché : sans connexion, aucun appel (no-op strict). */
export function useBeeperConversations(enabled: boolean) {
  const { user } = useSession()
  return useQuery<BeeperConversationsResponse>({
    queryKey: [...BEEPER_CONVERSATIONS_KEY, user?.id],
    queryFn: () => beeperApi.conversations(),
    enabled: !!user && enabled,
    staleTime: 15_000,
  })
}

export function useBeeperMessages(chatId: string | null) {
  return useQuery<BeeperChatMessagesResponse>({
    queryKey: ['beeper-messages', chatId],
    queryFn: () => beeperApi.messages(chatId ?? ''),
    enabled: !!chatId,
    staleTime: 0,
    gcTime: 0,
  })
}

export function useBeeperSend() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ chatId, body }: { chatId: string; body: BeeperSendRequest }) => beeperApi.send(chatId, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: BEEPER_CONVERSATIONS_KEY }),
  })
}
