import type { BriefingReading } from '../briefing/briefing-role-order'

/**
 * #3398 (V02, recette prod 01/10) — LAURA PARLE AUSSI SUR /chat, DANS L'ORDRE DE SON RÔLE.
 *
 * Recette : « aucun signal par rôle observé sur /chat (écran d'accueil : 6
 * cartes de démarrage génériques) ». Le catalogue posait chaque signal métier
 * sur UN écran (`/dashboard`, `/accounts`, `/projects/needs`…) ; l'écran où
 * l'on parle à Laura n'en servait aucun.
 *
 * ⚠️ Ce fichier ne crée AUCUN signal : chaque clé ci-dessous est une
 * intervention du catalogue, déjà détectée (`laura-detector.ts`), sur ses
 * propres écrans. Il ajoute `/chat` comme écran où ELLES PEUVENT AUSSI se
 * dire. Le budget d'interruption (trois par jour, une par écran, silence quand
 * il n'y a rien) les arbitre comme toutes les autres — sauf les rappels
 * d'hygiène (#2875, `hygiene: true` au catalogue : débrief d'appel, retour
 * d'expérience), hors budget et bornés à une fois par jour et par sujet.
 *
 * ⚠️ LE RÔLE CHANGE L'ORDRE, JAMAIS L'ENSEMBLE
 * (`c76_role_reordonne_jamais_ne_filtre`, `agent_docs/doctrine.md`). Les quatre
 * lectures (mêmes noms que le brief du matin : `briefingReadingOf`) sont des
 * PERMUTATIONS du même ensemble ; `laura-chat-signals.spec.ts` le vérifie. Un
 * fondateur et un recruteur voient les mêmes faits — l'un lit d'abord la marge,
 * l'autre les consultants qui se libèrent.
 *
 * (Lot F3, 02/10 : « missions à risque » du directeur — le démarrage d'une
 * mission pas prête — rejoint la lecture : un détecteur déjà au catalogue, rien
 * d'inventé. `mission_day_one_unconfirmed` reste hors /chat : la garde de coût
 * (≤ 16 mesures) ne se relève pas.)
 *
 * Lot F27 (06/10) : « comptes sans responsable », « collisions », « liste trop
 * large / comptes trop nombreux » et « consultant à requalifier » naissent ici
 * de mesures RÉELLES (sonde) — voir `laura-detector.ts`. Restent sans mesure :
 * décisions à couper. (Le forecast fondateur naît, lui, d'une mesure RÉELLE et
 * sans probabilité — `forecastDeclaredBlockedMissions`, lot B3 15/10.)
 *
 * Lot R12 (07/10) : « information terrain non enregistrée » (BD) naît ici
 * d'une mesure RÉELLE — `callsWithoutDebrief` (`laura-probe.service.ts`) :
 * appels loggés à la main, récents, sans débrief (`activities.call_debrief`).
 *
 * Lot T06 (08/10) : « entretien à préparer » (BM) naît ici d'une mesure
 * RÉELLE — `interviewsAwaitingBrief` (`laura-probe.service.ts`) : entretiens
 * planifiés, proches, dont `interviews.brief_viewed_at` est resté `null`. La
 * trace se pose à la première ouverture du brief (`InterviewBriefDialog`),
 * jamais une seconde définition.
 *
 * Les signaux de l'issue qui n'ont encore AUCUNE détection au catalogue
 * (prévisionnel — une probabilité, refusée ; décisions à couper ; arbitrages
 * d'équipe, fonctionnellement couverts par `accounts_without_owner` +
 * `account_collisions`, sans mesure distincte) ne sont PAS inventés ici : une
 * intervention naît d'une mesure réelle, pas d'une liste de souhaits. Voir le
 * bilan #2875/#3398 (07/10, 08/10) pour l'état détaillé.
 */
export const CHAT_SCREEN = '/chat'

/**
 * #3398 (recette prod Y8 02/10) — « 1 tâche en retard » s'affichait sur
 * /briefing sans que Laura n'en dise rien : la relance due vivait sur /actions
 * et /chat seulement. Elle se dit AUSSI sur le brief, là où l'en-tête la
 * compte. Une seule clé, déjà au catalogue : pas un second détecteur.
 */
export const BRIEFING_SCREEN = '/briefing'
export const BRIEFING_SIGNAL_KEYS: readonly string[] = ['follow_up_overdue']

const READINGS = {
  /** Le dirigeant : le cash et la marge d'abord. */
  executive: [
    'margin_not_measured',
    'portfolio_too_wide',
    'accounts_without_owner',
    'payment_overdue_30_days',
    'pipeline_runs_dry',
    'long_bench',
    'accounts_without_next_action',
    'client_dependency',
    'follow_up_overdue',
    'calls_without_debrief',
    'account_collisions',
    'consultant_to_requalify',
    'availability_stale',
    'mission_active_past_end_date',
    'mission_start_not_ready',
    'mission_ending_no_plan',
    'need_open_without_shortlist',
    'rfp_deadline_gaps',
    'consultant_free_soon',
    'mission_ended_without_feedback',
    'interview_brief_not_consulted',
    'forecast_revenue_declared_blocked',
  ],
  /** Le manager : ce qui a dérapé dans l'équipe. */
  manager: [
    'mission_active_past_end_date',
    'accounts_without_owner',
    'account_collisions',
    'mission_start_not_ready',
    'accounts_without_next_action',
    'client_dependency',
    'follow_up_overdue',
    'calls_without_debrief',
    'availability_stale',
    'portfolio_too_wide',
    'consultant_to_requalify',
    'interview_brief_not_consulted',
    'forecast_revenue_declared_blocked',
    'mission_ending_no_plan',
    'need_open_without_shortlist',
    'rfp_deadline_gaps',
    'long_bench',
    'mission_ended_without_feedback',
    'margin_not_measured',
    'payment_overdue_30_days',
    'consultant_free_soon',
    'pipeline_runs_dry',
  ],
  /** Le commercial : ses comptes, ses besoins, ses échéances. */
  sales: [
    'accounts_without_next_action',
    'portfolio_too_wide',
    'client_dependency',
    'follow_up_overdue',
    'calls_without_debrief',
    'availability_stale',
    'account_collisions',
    'accounts_without_owner',
    'consultant_to_requalify',
    'need_open_without_shortlist',
    'rfp_deadline_gaps',
    'consultant_free_soon',
    'mission_ending_no_plan',
    'mission_start_not_ready',
    'pipeline_runs_dry',
    'long_bench',
    'mission_active_past_end_date',
    'mission_ended_without_feedback',
    'payment_overdue_30_days',
    'margin_not_measured',
    'forecast_revenue_declared_blocked',
    'interview_brief_not_consulted',
  ],
  /** Le recruteur : les consultants, leurs missions, leurs retours. */
  recruiter: [
    'consultant_free_soon',
    'availability_stale',
    'consultant_to_requalify',
    'interview_brief_not_consulted',
    'forecast_revenue_declared_blocked',
    'follow_up_overdue',
    'calls_without_debrief',
    'client_dependency',
    'accounts_without_owner',
    'account_collisions',
    'portfolio_too_wide',
    'mission_ending_no_plan',
    'mission_start_not_ready',
    'long_bench',
    'mission_ended_without_feedback',
    'need_open_without_shortlist',
    'mission_active_past_end_date',
    'accounts_without_next_action',
    'rfp_deadline_gaps',
    'pipeline_runs_dry',
    'margin_not_measured',
    'payment_overdue_30_days',
  ],
} as const satisfies Record<BriefingReading, readonly string[]>

/** Les signaux servis sur /chat — le MÊME ensemble pour tous les rôles. */
export const CHAT_SIGNAL_KEYS: readonly string[] = READINGS.sales

export function chatSignalOrder(reading: BriefingReading): readonly string[] {
  return READINGS[reading]
}

/**
 * Les candidates, réordonnées pour ce rôle — même ensemble, même nombre. Une
 * clé hors de la lecture (`copilot_never_used`, une autre intervention de
 * /chat) passe en FIN plutôt que de disparaître. Tri stable.
 */
export function orderChatCandidates(keys: readonly string[], reading: BriefingReading): string[] {
  const order = READINGS[reading] as readonly string[]
  const rankOf = (key: string): number => {
    const index = order.indexOf(key)
    return index === -1 ? order.length : index
  }
  return keys
    .map((key, index) => ({ key, index, rank: rankOf(key) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.key)
}
