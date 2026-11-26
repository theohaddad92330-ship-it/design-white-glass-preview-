/**
 * #4060 — LA PRÉFÉRENCE « APPROCHE DIRECTE » pour les messages que le commercial envoie.
 *
 * Vit dans le sac `user_preferences` (une rangée par personne, JSONB, aucune migration — voir
 * `reply-preferences.ts`), à côté des réglages de réponse de Laura. Elle est DISTINCTE de
 * `replyTone` : celui-ci règle la forme des réponses de Laura, jamais le message écrit à un tiers.
 *
 * Posée par un GESTE de l'utilisateur (Réglages › Mémoire de Laura), retirée par le même écran
 * (`DELETE /memory/ledger/preferences/messageApproach`) ou par « Tout oublier » : elle est réversible.
 * Elle ne s'applique qu'en l'absence d'un objectif CHOISI dans le composer : un choix explicite gagne
 * toujours, et les autres voix (signal crédible, relance…) restent disponibles.
 *
 * ⚠️ Le service IA en porte une COPIE (`apps/ia/app/services/message_approach_preference.py`) et son
 * test relit ce fichier pour vérifier qu'elles ne divergent pas.
 */
export const MESSAGE_APPROACH_PREFERENCE_KEY = 'messageApproach'

export const MESSAGE_APPROACH_VALUES = ['direct'] as const

type MessageApproach = (typeof MESSAGE_APPROACH_VALUES)[number]

export function isMessageApproach(value: unknown): value is MessageApproach {
  return typeof value === 'string' && (MESSAGE_APPROACH_VALUES as readonly string[]).includes(value)
}

/** Lecture tolérante : une clé absente ou inconnue est ABSENTE, jamais ramenée à une valeur devinée. */
export function readMessageApproachPreference(bag: Record<string, unknown> | null | undefined): MessageApproach | null {
  if (!bag || typeof bag !== 'object') return null
  const value = bag[MESSAGE_APPROACH_PREFERENCE_KEY]
  return isMessageApproach(value) ? value : null
}
