import { isContactIdentityComplete } from '@bellum/contracts'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

type ContactRowAction = 'enrich' | 'identity' | 'generate' | 'contact'

/**
 * The primary action offered for a contact row.
 *
 * Priority (Théo P0, restitution p.11/p.15):
 *  - `enrich`   — no email yet: find one first (works even for a mononym).
 *  - `identity` — has a channel but the identity is INCOMPLETE (prénom seul, no
 *    anchor): block message generation, surface "identité incomplète". A contact
 *    we can't identify must not be messaged.
 *  - `generate` — identified + freshly detected: write the first message.
 *  - `contact`  — identified + already engaged: reach out (mail / LinkedIn).
 */
export function contactRowAction(c: GlobalContact): ContactRowAction {
  if (!c.email) return 'enrich'
  const identityComplete = isContactIdentityComplete({
    fullName: c.full_name,
    title: c.title,
    entity: c.entity,
    role: c.decision_role,
    email: c.email,
    phone: c.phone,
    linkedinUrl: c.linkedin_url,
  })
  if (!identityComplete) return 'identity'
  return c.user_status === 'new' ? 'generate' : 'contact'
}
