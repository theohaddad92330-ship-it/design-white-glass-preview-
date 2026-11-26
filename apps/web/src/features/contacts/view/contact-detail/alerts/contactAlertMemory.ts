/**
 * #4596 — ce que la personne a DÉJÀ fait du bandeau « Avant d'agir » d'un contact : lu, ignoré, revérifié.
 *
 * Par PERSONNE (jamais par espace : c'est une lecture, pas une décision d'équipe) et par contact. Une carte est
 * reconnue par sa SIGNATURE — une empreinte de son contenu : quand le contenu change, l'ancien « lu » et l'ancien
 * « ignoré » ne valent plus, la carte redevient neuve. On archive, on ne supprime pas : « ignorer » garde la date.
 *
 * Mémoire locale à cet appareil, jamais bloquante : un stockage refusé veut dire « pas de mémoire », pas une erreur.
 */
type CardMemory = {
  /** Signature de la dernière version de la carte que la personne a eue sous les yeux. */
  seen?: string
  /** Horodatage RÉEL (ISO) du geste « Ignorer ». */
  ignoredAt?: string
  /** Signature de la carte au moment où elle a été ignorée. */
  ignoredSignature?: string
  /** Horodatage RÉEL (ISO) de la dernière revérification. */
  recheckedAt?: string
}

export type AlertMemory = Readonly<Record<string, CardMemory>>

const keyFor = (userId: string, contactId: string) => `bellum:avant-dagir:${userId}:${contactId}`

/** Empreinte courte et stable d'un contenu (djb2) — pas un secret, juste « a-t-il changé ? ». */
export function signatureOf(value: unknown): string {
  const text = JSON.stringify(value) ?? ''
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0
  return (hash >>> 0).toString(36)
}

export function isIgnored(memory: CardMemory | undefined, signature: string): boolean {
  return Boolean(memory?.ignoredAt) && memory?.ignoredSignature === signature
}

/** Neuve = jamais vue sous cette forme, ni ignorée sous cette forme. */
export function isUnseen(memory: CardMemory | undefined, signature: string): boolean {
  return !isIgnored(memory, signature) && memory?.seen !== signature
}

export function readAlertMemory(userId: string | null, contactId: string): AlertMemory {
  if (!userId) return {}
  try {
    const raw = window.localStorage.getItem(keyFor(userId, contactId))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as AlertMemory) : {}
  } catch {
    return {}
  }
}

export function writeAlertMemory(userId: string | null, contactId: string, memory: AlertMemory): void {
  if (!userId) return
  try {
    window.localStorage.setItem(keyFor(userId, contactId), JSON.stringify(memory))
  } catch {
    // pas de mémoire : le bandeau marche pareil
  }
}
