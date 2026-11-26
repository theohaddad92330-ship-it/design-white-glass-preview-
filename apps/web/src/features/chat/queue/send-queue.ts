/**
 * #4066.1 — LA FILE D'ATTENTE DE LAURA : état pur + persistance, sans React.
 *
 * Louis (12/10) : « quand Laura traite un message, il faudrait pouvoir lui en envoyer
 * d'autres qu'elle met en attente, comme dans Claude ». Un message en attente n'est PAS
 * envoyé au serveur avant son tour : la file vit dans le navigateur (aucune file côté API).
 */

/** #4066.1 — taille maximale de la file (tranché Louis 12/10). */
export const SEND_QUEUE_MAX = 5

export interface QueuedMessage {
  id: string
  text: string
}

/**
 * Pourquoi la file n'avance plus toute seule — jamais un envoi silencieux :
 * - `failure` : la réponse en cours a échoué, `reason` porte l'échec NOMMÉ ;
 * - `restored` : file retrouvée après un rechargement, elle attend un geste ;
 * - `refused` : le tour suivant n'a pas pu partir (hors-ligne…).
 */
export type QueueSuspension =
  | { kind: 'failure'; reason: string }
  | { kind: 'restored' }
  | { kind: 'refused'; reason: string }

const STORAGE_PREFIX = 'bellum:laura-queue:'

export function sendQueueStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`
}

let counter = 0
export function newQueuedMessage(text: string): QueuedMessage {
  counter += 1
  return { id: `q${Date.now().toString(36)}${counter}`, text }
}

const SENT_SUFFIX = ':sent'
const SENT_MEMORY_MAX = 20

function readSentIds(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(key + SENT_SUFFIX) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeSentIds(key: string, ids: readonly string[]): void {
  try {
    if (ids.length === 0) window.sessionStorage.removeItem(key + SENT_SUFFIX)
    else window.sessionStorage.setItem(key + SENT_SUFFIX, JSON.stringify(ids.slice(-SENT_MEMORY_MAX)))
  } catch {
    // Stockage de session refusé : le retrait synchrone de la file reste la garde principale.
  }
}

/** #4097 — ce message part : il est noté « traité » AVANT l'envoi, pour qu'un rechargement ne le re-propose jamais. */
export function markQueuedSent(key: string, id: string): void {
  writeSentIds(key, [...readSentIds(key).filter(known => known !== id), id])
}

/** #4097 — l'envoi n'a pas pu partir : le message redevient un message jamais envoyé. */
export function unmarkQueuedSent(key: string, id: string): void {
  writeSentIds(
    key,
    readSentIds(key).filter(known => known !== id),
  )
}

/** #4066.5 — relit la file persistée ; un contenu illisible vaut file vide, jamais une exception. */
export function readPersistedQueue(key: string): QueuedMessage[] {
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const items: QueuedMessage[] = []
    // #4097 — on ne restaure que les messages de file JAMAIS envoyés.
    const sent = new Set(readSentIds(key))
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue
      const { id, text } = entry as { id?: unknown; text?: unknown }
      if (typeof id !== 'string' || typeof text !== 'string' || !text.trim() || sent.has(id)) continue
      items.push({ id, text })
    }
    return items.slice(0, SEND_QUEUE_MAX)
  } catch {
    return []
  }
}

export function writePersistedQueue(key: string, items: readonly QueuedMessage[]): void {
  try {
    if (items.length === 0) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify(items))
  } catch {
    // Le stockage de session peut être refusé (navigation privée) : la file reste en mémoire.
  }
}
