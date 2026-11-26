import { useProfile } from '@/features/profiles/hooks/useProfile'
import type { ChatMessageAuthor } from '../api/agentChatApi'
import { selfChatAuthor } from '../lib/chat-author'

/**
 * #1940.4 — l'auteur des bulles tapées dans cet onglet : la personne connectée.
 *
 * Lit le profil (déjà en cache : `useFirstName` le lit sur le même écran), pas
 * l'adresse e-mail. `null` tant qu'il n'est pas chargé, ou sans prénom déclaré —
 * la bulle ne montre alors personne plutôt qu'un nom deviné.
 */
export function useSelfChatAuthor(): ChatMessageAuthor | null {
  const { data: profile } = useProfile()
  return selfChatAuthor(profile)
}
