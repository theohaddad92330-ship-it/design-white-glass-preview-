import type { PendingChatAction } from '@bellum/contracts'

/**
 * #2434.56 (épopée #3579) — L'ENRICHISSEMENT EN MASSE DU CHAT, EN SALLE DE
 * DÉMONSTRATION. La carte que Laura propose en production
 * (`propose_bulk_enrichment`) se voit en salle sur trois contacts RÉELLEMENT
 * semés (`demo-dataset.ts` : Société Générale, SNCF) — leur nom et leur
 * entreprise sont ceux de la salle, jamais inventés.
 *
 * Les identifiants portent le préfixe `demo-contact-` : ce ne sont pas ceux de
 * la base, la carte le sait (`PendingActions.tsx`) et ne débite rien — elle
 * montre la proposition et son plafond, jamais un enrichissement qui n'a pas eu lieu.
 */
export const DEMO_CONTACT_ID_PREFIX = 'demo-contact-'

const DEMO_BULK_ENRICHMENT_CONTACTS = [
  {
    contact_id: `${DEMO_CONTACT_ID_PREFIX}palmieri`,
    contact_name: 'Pierre Palmieri',
    organization_name: 'Société Générale',
  },
  { contact_id: `${DEMO_CONTACT_ID_PREFIX}trevisani`, contact_name: 'Laurent Trévisani', organization_name: 'SNCF' },
  { contact_id: `${DEMO_CONTACT_ID_PREFIX}castex`, contact_name: 'Jean Castex', organization_name: 'SNCF' },
] as const

export function demoBulkEnrichmentAction(): PendingChatAction {
  return {
    action: 'propose_bulk_enrichment',
    contacts: DEMO_BULK_ENRICHMENT_CONTACTS.map(contact => ({ ...contact })),
    cost_credits: DEMO_BULK_ENRICHMENT_CONTACTS.length,
    credit_kind: 'enrichment',
  }
}
