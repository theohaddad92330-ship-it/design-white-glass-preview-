import type { EngagementChannel } from './types'

/**
 * #4181.4 — la ligne d'historique d'une génération. Un pitch d'appel est déjà
 * consigné « Pitch d'appel préparé » à l'ouverture du module : le regénérer ne
 * crée pas une seconde ligne identique (`null`). Un message écrit, lui, est
 * consigné à chaque génération.
 */
export function generationActionType(channel: EngagementChannel): 'plan_action_message_generated' | null {
  return channel === 'phone' ? null : 'plan_action_message_generated'
}
