import type { AgentChatHistoryItem } from '@/features/chat/api/agentChatApi'

/**
 * #3773.4 — « UN TRAVAIL REPRENABLE » SUR L'ACCUEIL, AU MAXIMUM UN.
 *
 * Source UNIQUE : la liste des conversations existante (`listAgentChatHistory`,
 * la même que le panneau de gauche) — pas un gestionnaire de projets de plus
 * dans Laura. La candidate est la conversation non rangée la plus récemment
 * active ; rien d'autre n'est lu (les fils d'un collègue ne sont servis que
 * si l'API les sert à cette personne, et ne servent ici qu'à un titre).
 *
 * Ce que ce module NE fait pas, exprès :
 *  - il ne relance rien : le clic ouvre le fil (`/chat?conversationId=`), il ne
 *    crée aucune copie et n'envoie aucun message — donc aucune opération payante ;
 *  - il ne fabrique pas de carte vide : sans fil reprenable, `null` ;
 *  - il ne repropose pas un fil que la personne a écarté (`dismissed`).
 *
 * #3773.4b — reste, et volontairement : une SÉLECTION ou un BROUILLON nommés
 * (distincts d'une conversation) n'ont nulle part où vivre aujourd'hui — le
 * brouillon du composeur est PAR FIL (revient avec le fil qu'il repris, voir
 * `Chat.draft.test.tsx`), et aucune liste de sélections nommées n'existe dans
 * l'app. Construire cette liste POUR en nourrir une entrée ici serait le
 * gestionnaire de projets que la demande interdit explicitement (#3773, §4).
 * Quand une telle liste existera (pour un autre besoin, pas pour celui-ci),
 * son entrée « Reprendre » s'ajoute ICI, à côté de `pickResumeCandidate` —
 * toujours au plus UNE proposée (même règle), jamais une seconde source.
 */

const DISMISSED_KEY = 'bellum:chat:resume-dismissed'
/** Une mémoire courte : écarter dix fois n'est pas un registre à tenir. */
const DISMISSED_MAX = 50

type ResumeCandidate = Pick<AgentChatHistoryItem, 'id' | 'account_id' | 'conversation_id' | 'title'>

function lastActivity(item: AgentChatHistoryItem): number {
  const time = Date.parse(item.last_message_at ?? item.created_at)
  return Number.isNaN(time) ? 0 : time
}

export function pickResumeCandidate(
  threads: readonly AgentChatHistoryItem[] | null | undefined,
  options: {
    activeConversationId: string | null
    dismissed: ReadonlySet<string>
    /** #4967 / R2 — les fils dont un tour tourne RÉELLEMENT (`useBackgroundTurnsStore`, état `running`). Une
     *  conversation terminée (« En attente » dans la liste) n'est pas un travail à reprendre. */
    running: ReadonlySet<string>
  },
): ResumeCandidate | null {
  const best = [...(threads ?? [])]
    .filter(thread => thread.title.trim() !== '')
    .filter(thread => !options.dismissed.has(thread.id))
    .filter(thread => thread.conversation_id !== null && options.running.has(thread.conversation_id))
    // Le fil OUVERT n'est pas à « reprendre » : il est déjà là.
    .filter(thread => !thread.conversation_id || thread.conversation_id !== options.activeConversationId)
    .sort((a, b) => lastActivity(b) - lastActivity(a))[0]
  if (!best) return null
  return { id: best.id, account_id: best.account_id, conversation_id: best.conversation_id, title: best.title.trim() }
}

/** Les fils écartés — un confort PAR NAVIGATEUR, jamais un état à retrouver ailleurs. */
export function readDismissedResumes(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissResume(id: string): Set<string> {
  const next = [...readDismissedResumes(), id].slice(-DISMISSED_MAX)
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    // Stockage refusé : l'écart vaut pour cet écran seulement, rien ne casse.
  }
  return new Set(next)
}
