import { chatTurnsApi } from '@/features/chat/api/chatTurnsApi'

/**
 * #4967 (lot L14) — RETOMBER SUR LA CONVERSATION QU'ON ATTENDAIT.
 *
 * Demande de Louis (01/11/2026) : quitter Laura puis y revenir (`/chat` nu) ramène sur le fil qui
 * travaille encore, ou qui a fini pendant l'absence — pas sur l'accueil. Le serveur dit ce qui tourne
 * (`GET /ia/chat/turns/running` sans fil : tous les tours de l'utilisateur — route L6, aucune API neuve) ;
 * la seule mémoire ajoutée est CETTE marque côté navigateur : le fil quitté pendant un tour en cours.
 * Un confort par navigateur et par utilisateur, jamais un état à retrouver ailleurs (comme `home-resume`).
 *
 * Une marque se pose en quittant un fil dont le tour tourne, s'efface quand le fil est rouvert (la
 * réponse est alors VUE) ou quand elle a ramené la personne une fois.
 */
const KEY_PREFIX = 'bellum:chat:left-while-running:'

function key(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function readLeftWhileRunning(userId: string): string | null {
  try {
    return window.localStorage.getItem(key(userId)) || null
  } catch {
    return null
  }
}

export function markLeftWhileRunning(userId: string, conversationId: string): void {
  try {
    window.localStorage.setItem(key(userId), conversationId)
  } catch {
    // Stockage refusé : on perd seulement le retour sur une réponse finie, jamais le tour.
  }
}

/** Efface la marque — seulement si elle désigne CE fil (ouvrir un autre fil ne la périme pas). */
export function clearLeftWhileRunning(userId: string, conversationId?: string): void {
  try {
    if (conversationId && window.localStorage.getItem(key(userId)) !== conversationId) return
    window.localStorage.removeItem(key(userId))
  } catch {
    // rien à effacer de plus
  }
}

/** Un geste explicite : seule l'entrée NUE sur /chat est redirigée. */
const EXPLICIT_PARAMS = ['conversationId', 'fresh', 'new', 'prompt', 'ask', 'accountId', 'scope', 'context'] as const

export function isBareChatEntry(search: Readonly<Record<string, unknown>>): boolean {
  return EXPLICIT_PARAMS.every(param => search[param] === undefined)
}

/**
 * Le fil où retomber, ou `null` (accueil inchangé). Un tour en cours gagne ; sinon le fil marqué dont
 * le tour est fini (il n'est plus dans la liste). Un appel qui échoue → `null` : jamais d'erreur,
 * jamais un fil deviné.
 */
export async function resolveReturnConversation(userId: string): Promise<string | null> {
  try {
    const { turns } = await chatTurnsApi.running()
    const running = turns.find(turn => turn.conversationId)?.conversationId ?? null
    if (running) return running
    return readLeftWhileRunning(userId)
  } catch {
    return null
  }
}
