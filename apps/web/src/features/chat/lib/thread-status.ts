import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'

/**
 * #1911.5 — LE STATUT DÉCRIT LE FIL, pas une action à valider.
 *
 * Décision de Louis du 16/09/2026 : « en attente / reçu / terminé » qualifie la
 * CONVERSATION — « j'ai écrit, Laura n'a pas encore répondu ». C'est ce qu'on
 * lit dans une liste de fils, et c'est tout ce qu'on y lit.
 *
 * Explicitement REFUSÉ : que le statut désigne une action en attente de
 * validation. C'est un autre objet, il a déjà sa place dans le plan d'action,
 * et le mettre AUSSI dans la liste des conversations ferait apparaître deux
 * fois la même chose sous deux noms (loi 4 du tome 7).
 *
 * Ce dont il se dérive, et ce dont il ne se dérive PAS :
 *  - il se dérive du RÔLE du dernier message (`last_message_role`, servi par
 *    `GET /ia/chat/history` depuis ce point) ;
 *  - il ne se dérive JAMAIS d'une date. `last_message_at` dit QUAND on a parlé,
 *    jamais QUI a parlé : « le dernier message date d'hier » ne distingue pas
 *    une question sans réponse d'une réponse lue. Avant ce point, l'objet
 *    d'historique ne portait pas le rôle — il n'y avait donc rien à dériver
 *    honnêtement, et c'est pour ça que ce statut n'existait pas.
 *  - `terminé` n'est pas deviné non plus : c'est le fil RANGÉ, un geste que
 *    quelqu'un a posé (#1120), pas un fil « inactif depuis N jours ».
 *
 * `null` quand rien n'est connu (API antérieure au champ, lecture du rôle en
 * échec) : aucun statut ne s'affiche alors. Une valeur absente ne devient pas
 * « en attente » par défaut — ce serait dire à quelqu'un qu'on lui doit une
 * réponse sans le savoir.
 */
export type ThreadStatus = 'awaiting' | 'answered' | 'closed' | 'unknown'

/**
 * #4462.2 — un fil dont le dernier message est le NÔTRE depuis plus longtemps que le plafond d'un tour
 * (105 s côté IA) n'« attend » plus : la réponse n'est jamais arrivée (onglet fermé, réseau, tour coupé).
 * Un timeout n'est pas un échec (doctrine) : statut `unknown` NOMMÉ, jamais un « En attente » infini.
 */
const UNANSWERED_AFTER_MS = 10 * 60 * 1000

export function threadStatusOf(
  thread: Pick<AgentChatHistoryItem, 'last_message_role' | 'last_message_at'>,
  options: { archived: boolean; now?: number },
): ThreadStatus | null {
  // Un fil rangé est terminé quoi qu'il porte : le geste de rangement est plus
  // récent que n'importe quel message qu'il contient.
  if (options.archived) return 'closed'
  if (thread.last_message_role === 'user') {
    // #4462.2
    const sentAt = thread.last_message_at ? Date.parse(thread.last_message_at) : Number.NaN
    const now = options.now ?? Date.now()
    return Number.isFinite(sentAt) && now - sentAt > UNANSWERED_AFTER_MS ? 'unknown' : 'awaiting'
  }
  if (thread.last_message_role === 'assistant') return 'answered'
  return null
}

/** La clé i18n du libellé, pour que l'écran n'invente pas sa propre table. */
export function threadStatusLabelKey(status: ThreadStatus): string {
  return `sidebarThreads.status.${status}`
}
