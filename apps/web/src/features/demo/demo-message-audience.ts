import type { PendingChatAction } from '@bellum/contracts'

import { DEMO_CONTACT_ID_PREFIX } from './demo-bulk-enrichment'

/**
 * #3894.3 (lot RAE2, c74 assoupli le 10/10/2026) — UN MESSAGE À PLUSIEURS
 * CONTACTS NOMMÉS, EN SALLE DE DÉMONSTRATION. La carte que Laura rend en
 * production (`prepare_message_audience`) se voit en salle sur deux contacts
 * RÉELLEMENT semés (`demo-dataset.ts` : SNCF) — leurs noms sont ceux de la salle,
 * jamais inventés. La personne les a NOMMÉS dans sa question : une audience
 * n'est jamais devinée.
 *
 * Les identifiants portent le préfixe `demo-contact-` : la carte le sait
 * (`PendingActions.tsx`) et ne génère rien — elle montre les destinataires et
 * dit que le brouillon se lit en production, jamais un brouillon qui n'existe pas.
 */
const DEMO_AUDIENCE_RECIPIENTS = [
  { contact_id: `${DEMO_CONTACT_ID_PREFIX}trevisani`, contact_name: 'Laurent Trévisani' },
  { contact_id: `${DEMO_CONTACT_ID_PREFIX}castex`, contact_name: 'Jean Castex' },
] as const

export function demoMessageAudienceAction(): PendingChatAction {
  return {
    action: 'prepare_message_audience',
    explicit_multi_contact: true,
    channel: 'email',
    recipients: DEMO_AUDIENCE_RECIPIENTS.map(recipient => ({ ...recipient })),
    cost_credits: 0,
    sends_email: false,
  }
}
