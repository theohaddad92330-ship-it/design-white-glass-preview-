import type { ActionPlanOutcome, SprintEvent } from '@bellum/contracts'

/**
 * #3416.4 — ce qu'une issue choisie sur une ACTION change sur le CONTACT visé
 * et sur le board du COMPTE, au lieu de ne rester qu'une ligne de journal.
 *
 * Tranché sans Louis : seules les issues qui ONT un équivalent dans le statut
 * de contact déjà en vigueur (`new · contacted · replied · meeting · refused ·
 * silence`, `contactStatusSchema`) propagent. Les autres (besoin détecté,
 * bloqué par achats, erreur technique…) restent sur la ligne d'action : leur
 * inventer un statut de contact serait une règle produit que rien n'écrit.
 * Même vocabulaire d'événement que `ContactsService.recordOutcomeAction`
 * (`positive_reply`, `meeting_booked`) — pas un second mécanisme.
 *
 * ⚠️ Une correction humaine gagne : le statut n'est jamais ÉCRASÉ par une issue
 * plus faible. `replied`/`meeting` ne se posent que depuis un statut moins
 * avancé ; `refused`/`silence` ne se posent que depuis `new`/`contacted`.
 */
interface ActionOutcomeEffect {
  contactStatus: 'replied' | 'meeting' | 'refused' | 'silence'
  /** Événement du board du compte — absent pour un refus ou un silence. */
  sprintEvent?: SprintEvent
}

const EFFECTS: Partial<Record<ActionPlanOutcome, ActionOutcomeEffect>> = {
  positive: { contactStatus: 'replied', sprintEvent: 'positive_reply' },
  meeting_booked: { contactStatus: 'meeting', sprintEvent: 'meeting_booked' },
  refused: { contactStatus: 'refused' },
  declined: { contactStatus: 'refused' },
  no_response: { contactStatus: 'silence' },
  no_answer: { contactStatus: 'silence' },
}

const FROM_OPEN = ['new', 'contacted']
const FROM_BEFORE_REPLY = ['new', 'contacted', 'silence']

export function actionOutcomeEffect(outcome: ActionPlanOutcome | null | undefined): ActionOutcomeEffect | null {
  return (outcome && EFFECTS[outcome]) || null
}

/** Le statut de contact doit-il passer à `next` depuis `current` ? */
export function contactStatusMayMove(
  current: string | null | undefined,
  next: ActionOutcomeEffect['contactStatus'],
): boolean {
  const from = current ?? 'new'
  if (next === 'replied') return FROM_BEFORE_REPLY.includes(from)
  if (next === 'meeting') return from !== 'meeting'
  return FROM_OPEN.includes(from)
}

/**
 * #3416.4b — les issues SANS équivalent de statut contact ne changent aucun
 * statut : elles s'écrivent comme UN événement nommé dans la frise du compte
 * (libellé FR + EN, issue nommée). Même libellés que `actions.json#outcome.*`.
 */
const TIMELINE_ONLY_OUTCOMES: Partial<Record<ActionPlanOutcome, { fr: string; en: string }>> = {
  need_confirmed: { fr: 'Besoin confirmé', en: 'Need confirmed' },
  blocked_by_procurement: { fr: 'Bloqué par les achats', en: 'Blocked by procurement' },
  blocked_by_margin: { fr: 'Bloqué par la marge', en: 'Blocked by margin' },
  technical_error: { fr: 'Erreur technique', en: 'Technical error' },
  abandoned: { fr: 'Abandonné', en: 'Abandoned' },
}

export function outcomeTimelineLabel(outcome: ActionPlanOutcome | null | undefined): { fr: string; en: string } | null {
  if (!outcome) return null
  const name = TIMELINE_ONLY_OUTCOMES[outcome]
  return name ? { fr: `Action faite — ${name.fr}`, en: `Action done — ${name.en}` } : null
}
