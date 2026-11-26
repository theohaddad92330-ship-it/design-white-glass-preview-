import { addDays, daysBetween } from './manual-billing-schedule'

/**
 * La cadence de relance d'un siège provisionné à la main qui n'a pas encore
 * activé son compte — #2643.3.
 *
 * Même forme que la relance de facture (#1655, `manual-billing-reminder.ts`) :
 * une décision PURE, sans horloge lue en douce (`today` est un paramètre) ni
 * dépôt — c'est cette fonction que `manual-provisioning.service.spec.ts`-like
 * suites peuvent tester sans mock de repository.
 *
 * ⚠️ APPLIQUE LA MÊME DÉCISION QU'EN #2643.1 : la relance vers le CLIENT se
 * PRÉPARE ici (elle dit QUAND une relance est due), elle ne part jamais
 * seule — `OwnerActivationService.send` reste le seul chemin d'envoi, gardé
 * par le même clic opérateur.
 */
export const OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS = [2, 5] as const

/** Le rang maximal atteignable — deux relances, jamais une troisième devinée. */
export const OWNER_ACTIVATION_MAX_REMINDERS = OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS.length

type FollowUpRefusalReason = 'not_due_yet' | 'cadence_exhausted'

interface FollowUpDue {
  due: true
  /** Le rang de CETTE relance : 1 (J+2) ou 2 (J+5). */
  index: 1 | 2
}

interface FollowUpRefusal {
  due: false
  reason: FollowUpRefusalReason
  /** `null` quand la cadence est épuisée — il n'y a plus de prochaine date. */
  nextDueOn: string | null
}

/**
 * Est-ce qu'une relance peut partir AUJOURD'HUI ?
 *
 * `remindersSent` compte les relances déjà consignées APRÈS l'envoi initial
 * (`sends.length - 1` côté `OwnerActivationEntity` — l'envoi initial n'est
 * pas une relance). `firstSentOn` est la date du PREMIER envoi : la cadence
 * se calcule depuis lui, jamais depuis la dernière relance — sinon J+2 puis
 * J+2 dériverait la fenêtre à chaque clic au lieu de J+2 puis J+5.
 */
export function dueFollowUp(input: {
  firstSentOn: string
  remindersSent: number
  today: string
}): FollowUpDue | FollowUpRefusal {
  if (input.remindersSent >= OWNER_ACTIVATION_MAX_REMINDERS) {
    return { due: false, reason: 'cadence_exhausted', nextDueOn: null }
  }

  const sentDay = input.firstSentOn.slice(0, 10)
  const todayDay = input.today.slice(0, 10)
  const thresholdDays = OWNER_ACTIVATION_REMINDER_SCHEDULE_DAYS[input.remindersSent] as number
  const elapsed = daysBetween(sentDay, todayDay)

  if (elapsed < thresholdDays) {
    return { due: false, reason: 'not_due_yet', nextDueOn: addDays(sentDay, thresholdDays) }
  }

  return { due: true, index: (input.remindersSent + 1) as 1 | 2 }
}
