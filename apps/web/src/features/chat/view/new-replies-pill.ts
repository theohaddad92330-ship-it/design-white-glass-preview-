/**
 * #3776.5 — « Quand l'utilisateur lit plus haut dans le fil, l'arrivée d'une réponse ne le
 * ramène pas de force en bas. Proposer un accès discret aux nouveaux éléments. »
 *
 * `Chat.tsx` ne le ramène déjà pas (#2441.12, `shouldAutoScroll`) — mais il ne lui disait
 * rien non plus : la réponse arrivait hors de vue, sans signe. Ici, la DÉCISION seule, pure
 * (jsdom ne calcule aucune hauteur) : « quelque chose est-il arrivé en BAS pendant que la
 * personne lisait plus haut ? ». Le bouton qui la porte vit dans `NewRepliesPill.tsx`.
 */
import { shouldAutoScroll } from './should-auto-scroll'

type TailMessage = { role: 'user' | 'assistant'; content: string }

/**
 * L'identité de la QUEUE du fil : son rôle, sa longueur, et le nombre de messages avant
 * elle. Une page plus ancienne préposée ne change que le premier terme du fil, jamais la
 * queue — ce n'est donc pas une arrivée.
 */
export function tailKey(messages: readonly TailMessage[]): string {
  const last = messages[messages.length - 1]
  if (!last) return ''
  return `${last.role}:${last.content.length}:${last.content.slice(0, 24)}`
}

export function arrivedWhileReadingAbove(
  previousTail: string,
  nextTail: string,
  geometry: { scrollTop: number; scrollHeight: number; clientHeight: number },
): boolean {
  if (previousTail === nextTail || nextTail === '') return false
  return !shouldAutoScroll(geometry)
}
