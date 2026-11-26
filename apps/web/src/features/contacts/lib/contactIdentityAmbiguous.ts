import type { Contact } from '@bellum/contracts'

/**
 * #3687.13 — Apollo a retenu CE nom parmi plusieurs profils possibles
 * (`last_enrichment_result === 'ambiguous'`, #2120.61) : c'est l'identité de
 * la personne elle-même qui est incertaine, pas seulement son rôle (ce que
 * couvre déjà `identity.roleToIdentify`). Jusqu'ici ce résultat n'alimentait
 * que les synthèses d'enrichissement en masse (`bulkEnrichmentSummary.ts`) —
 * jamais la fiche d'UNE personne. Rend `false` sans le signal (GA-18/19).
 */
export function contactIdentityAmbiguous(contact: Pick<Contact, 'last_enrichment_result'>): boolean {
  return contact.last_enrichment_result === 'ambiguous'
}
