import { contactCoordinates } from '@bellum/contracts'
import { ApiError } from '@/lib/api'

/**
 * #2988 (#2161, taxonomie à 9 valeurs) — le résultat d'UN contact dans un lot
 * d'enrichissement, pas l'agrégat (`enrichSummary.ts`, qui reste le compagnon
 * de ce module pour le toast chiffré).
 *
 * Les neuf valeurs sont chacune un fait RÉELLEMENT distinguable aujourd'hui —
 * aucune n'est devinée :
 * - `matched_both` / `matched_email` / `matched_phone` — ce que le fournisseur
 *   a renvoyé CE tour (`EnrichContactResponse.email`/`.phone`).
 * - `ambiguous` / `newer_data_exists` — `last_enrichment_result`, la même
 *   colonne que `enrichSummary.ts` lit déjà.
 * - `invalid_coordinate` — l'email est un rebond CONNU (`email_bounced_at`,
 *   posé par le webhook Resend, `contact.ts:282`) et rien de neuf n'a été
 *   trouvé ce tour : une adresse mesurée mauvaise, jamais une adresse devinée
 *   invalide.
 * - `opt_out` — le serveur a refusé AVANT tout appel fournisseur parce que la
 *   personne a demandé qu'on cesse (`ContactsService.enrichContact`, code
 *   machine `opt_out`, `contacts.controller.ts`).
 * - `no_result` — rien de tout ça : une tentative propre, revenue vide.
 * - `insufficient_credits` — #3698.1 : le solde de l'UTILISATEUR est vide (ou
 *   son essai terminé) ; la suite est de mettre à niveau.
 * - `service_unavailable` — #3698.1 : la panne n'est pas celle du client
 *   (indisponibilité, volume atteint, réseau) ; la suite est de réessayer plus
 *   tard, jamais d'acheter des crédits. Aucun crédit n'est débité.
 * - `not_processed` — J1b/#3822 : le lot s'est arrêté avant ce contact (crédits
 *   épuisés, écran quitté) ; rien n'a été cherché NI débité, la suite est de relancer.
 * - `technical_error` — l'appel a échoué pour une autre raison : compté,
 *   jamais confondu avec « aucun résultat », qui est une conclusion positive
 *   sur le contact.
 */
export const ENRICHMENT_OUTCOME_STATUSES = [
  'matched_both',
  'matched_email',
  'matched_phone',
  'ambiguous',
  'newer_data_exists',
  'invalid_coordinate',
  'opt_out',
  'no_result',
  'insufficient_credits',
  'service_unavailable',
  'technical_error',
  'not_processed',
] as const

export type EnrichmentOutcomeStatus = (typeof ENRICHMENT_OUTCOME_STATUSES)[number]

/** Le sous-ensemble de `EnrichContactResponse` dont ce classement a besoin. */
type EnrichmentOutcomeInput = {
  email: string | null
  phone: string | null
  last_enrichment_result?: string | null
  email_bounced_at?: string | null
}

export type ContactEnrichmentOutcomeRow = {
  contactId: string
  fullName: string
  status: EnrichmentOutcomeStatus
}

/** Un succès CLASSÉ — jamais un échec : celui-là vient de `classifyEnrichmentError`. */
export function classifyEnrichmentOutcome(outcome: EnrichmentOutcomeInput): EnrichmentOutcomeStatus {
  if (outcome.last_enrichment_result === 'ambiguous') return 'ambiguous'
  if (outcome.last_enrichment_result === 'newer_data_exists') return 'newer_data_exists'
  // #3698.7 — l'état vient du même prédicat que la liste et la préparation :
  // un e-mail seul est `matched_email` (gardé, jamais un échec).
  const { state } = contactCoordinates(outcome)
  if (state === 'complete') return 'matched_both'
  if (state === 'email_only') return 'matched_email'
  if (state === 'phone_only') return 'matched_phone'
  if (outcome.email_bounced_at) return 'invalid_coordinate'
  return 'no_result'
}

/** Un échec — le lot continue (chaque contact reste indépendant), mais son
 *  résultat le dit plutôt que de disparaître dans un compteur `failed` muet. */
export function classifyEnrichmentError(error: unknown): EnrichmentOutcomeStatus {
  if (error instanceof ApiError && error.code === 'opt_out') return 'opt_out'
  if (error instanceof ApiError) {
    if (error.status === 402 || error.code === 'insufficient_credits' || error.code === 'trial_ended') {
      return 'insufficient_credits'
    }
    if (error.code && SERVICE_UNAVAILABLE_CODES.has(error.code)) return 'service_unavailable'
  }
  return 'technical_error'
}

const SERVICE_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  'enrichment_unavailable',
  'upstream_error',
  'quota_exceeded',
  'rate_limited',
  'network_error',
  'missing_api_key',
  'unauthorized',
])
