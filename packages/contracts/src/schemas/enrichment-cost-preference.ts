import { CREDIT_WEIGHTS } from '../billing/credit-weights.js'

/**
 * #4016.L8b (décision Louis 11/10, lot V10-E 17/10) — « NE PLUS ME DEMANDER » LE COÛT D'UN ENRICHISSEMENT.
 *
 * Une préférence PERSONNELLE, dans le sac `user_preferences` (une rangée par personne, JSONB, aucune
 * migration — voir `reply-preferences.ts`). Un réglage à UN seul endroit (GA-26) : posée par la case
 * « Ne plus me demander » de la question de coût (`EnrichConfirmDialog`), retirée dans Réglages ›
 * Mémoire de Laura (ou « Tout oublier »). Réversible à tout moment.
 *
 * Ce qu'elle lève, et rien d'autre : la question posée avant d'enrichir UN contact (le coût d'un
 * enrichissement, `CREDIT_WEIGHTS.contact_enrichment`). Un LOT redemande toujours — c'est le débit de
 * plusieurs crédits sur un clic que GA-49 (`enrich-debit-announced.test.ts`) existe pour fermer. Le
 * prix reste écrit sur le déclencheur.
 */
export const ENRICHMENT_COST_PREFERENCE_KEY = 'skipEnrichmentCostConfirmation'

/** Lecture tolérante : seule la valeur `true` lève la question ; tout le reste la repose. */
export function readSkipEnrichmentCost(bag: Record<string, unknown> | null | undefined): boolean {
  if (!bag || typeof bag !== 'object') return false
  return bag[ENRICHMENT_COST_PREFERENCE_KEY] === true
}

/** La question de coût se pose-t-elle ? Toujours pour un lot ; pour UN contact, sauf préférence posée. */
export function asksEnrichmentCost(input: { skip: boolean; credits: number }): boolean {
  return !input.skip || input.credits > CREDIT_WEIGHTS.contact_enrichment
}
