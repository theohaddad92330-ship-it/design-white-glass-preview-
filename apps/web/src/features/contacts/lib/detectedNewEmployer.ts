import type { ApolloContactProfile, Contact } from '@bellum/contracts'

/**
 * #2296.30/.33 (épopée #2964) — « créer/rattacher le nouvel emploi » et
 * « proposer une action » : une tranche minimale et doctrine-compatible.
 * Créer ou rattacher un compte tout seul serait une fusion automatique
 * (interdite, `agent_docs/doctrine.md:40`) ; NOMMER l'employeur actuel
 * qu'Apollo a déjà collecté (`employment_history[].current`, la même donnée
 * que lit déjà `isObsoleteContact` côté API pour le badge RISQUE) laisse le
 * commercial décider — c'est la proposition elle-même. Rend `null` sans
 * signal réel (GA-18/19), jamais un nom deviné.
 */
export function detectedNewEmployer(
  contact: Pick<Contact, 'lifecycle_state'> & { apollo_enrichment?: ApolloContactProfile | null },
): string | null {
  if (contact.lifecycle_state !== 'historique') return null
  const current = contact.apollo_enrichment?.employment_history?.find(entry => entry.current)
  return current?.organization_name?.trim() || null
}
