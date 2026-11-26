import type { ActionPlanOutcome, ContactCadence } from '@bellum/contracts'

/**
 * #4418.1 — « Fait » sur une action d'approche planifie la MÊME cadence de relance qu'un envoi fait depuis Bellum
 * (J+3 / J+6 / J+9) et l'écran l'ANNONCE. Doctrine (Louis 21/09/2026) : « Fait » reste un geste DÉCLARATIF — ce module
 * ne pose aucune preuve d'envoi et ne produit aucun texte qui dise « envoyé » : il dit que la cadence est planifiée.
 */

/** Les issues qui FERMENT la piste : relancer après un refus ou un mauvais contact serait faux. */
const CLOSING_OUTCOMES: readonly ActionPlanOutcome[] = [
  'declined',
  'refused',
  'wrong_contact',
  'invalid_contact',
  'left_company',
  'action_cancelled',
  'abandoned',
  'not_now',
  'need_not_confirmed',
  'blocked_by_procurement',
  'blocked_by_margin',
  'technical_error',
  'meeting_booked',
]

/**
 * Le canal dont la cadence se planifie quand l'action est faite avec cette issue ; `null` = rien à planifier.
 * `declarable` = `declarableChannel(item)` (un seul endroit décide ce qui est une approche vers un contact, GA-26).
 */
export function followUpChannelOnDone(
  declarable: 'email' | 'linkedin' | null,
  outcome: ActionPlanOutcome,
): 'email' | 'linkedin' | null {
  return CLOSING_OUTCOMES.includes(outcome) ? null : declarable
}

type FollowUpApi = {
  declareSent(id: string, channel: 'email' | 'linkedin'): Promise<unknown>
  cadence(id: string): Promise<ContactCadence>
}

/**
 * Planifie la cadence du contact (idempotent côté serveur) puis lit la PROCHAINE relance posée.
 * `null` si rien n'a pu être planifié ou lu : on n'annonce jamais une date qu'on n'a pas.
 */
export async function announceFollowUps(
  contactId: string,
  channel: 'email' | 'linkedin',
  api: FollowUpApi,
): Promise<{ nextOn: string } | null> {
  try {
    await api.declareSent(contactId, channel)
    const nextOn = (await api.cadence(contactId)).next_step?.due_date
    return nextOn ? { nextOn } : null
  } catch {
    return null
  }
}
