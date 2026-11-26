import { type CallDebrief, type CallOutcome } from '@bellum/contracts'

/**
 * #2386.A — le texte qui part vers le CRM après un appel journalisé à la
 * main (`ActivitiesService.log`). Composé ICI, jamais recalculé côté CRM :
 * la fiche externe ne reçoit que ce que l'utilisateur a choisi ou écrit
 * lui-même, jamais une phrase inventée sur l'entreprise ou le contact.
 *
 * `Record<CallOutcome, string>` (et non `Partial`) : le typage refuse une
 * issue sans libellé plutôt que de laisser passer une clé brute
 * (`connected_qualified`) dans une fiche client.
 */
const CALL_OUTCOME_LABELS_FR: Record<CallOutcome, string> = {
  connected_qualified: 'Échange qualifié',
  connected_no_fit: 'Échange — pas de sujet',
  callback_scheduled: 'Rappel programmé',
  voicemail: 'Messagerie',
  wrong_contact: 'Mauvais contact',
  no_answer: 'Pas de réponse',
  orientation_given: 'Réorienté',
  not_now: 'Pas maintenant',
  interest: 'Intérêt exprimé',
  need_detected: 'Besoin détecté',
  need_confirmed: 'Besoin confirmé',
  meeting_booked: 'Rendez-vous pris',
  refused: 'Refus',
  opt_out: 'Opt-out',
  email_requested: 'E-mail demandé',
  document_requested: 'Document demandé',
  partner_opportunity: 'Opportunité partenaire',
  invalid_contact: 'Contact invalide',
  left_company: 'A quitté l’entreprise',
  other: 'Autre',
}

export function composeCrmCallNote(input: {
  outcome: CallOutcome
  subject?: string
  body?: string
  callDebrief?: CallDebrief | null
}): string {
  const parts = [CALL_OUTCOME_LABELS_FR[input.outcome]]
  if (input.subject) parts.push(input.subject)
  if (input.callDebrief?.fact) parts.push(input.callDebrief.fact)
  if (input.callDebrief?.need) parts.push(input.callDebrief.need)
  if (input.callDebrief?.objection) parts.push(input.callDebrief.objection)
  if (input.callDebrief?.engagement) parts.push(input.callDebrief.engagement)
  if (input.body) parts.push(input.body)
  return parts.join(' — ')
}
