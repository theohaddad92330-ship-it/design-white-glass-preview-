import type { Contact } from '@bellum/contracts'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'

/** Placeholder for the `user_id` a `GlobalContact` list row doesn't carry.
 *  The value is never read by the engagement/enrichment flow — those key off
 *  `id` / `account_id` — so a fixed all-zero UUID keeps the shape valid. */
const EMPTY_USER_ID = '00000000-0000-0000-0000-000000000000'

/** Widen a list-row `GlobalContact` into the full `Contact` shape the
 *  engagement + enrichment mutations expect. Fields the list projection
 *  doesn't carry (messages, raw_data, timestamps…) default to empty/null. */
export function toEngagementContact(contact: GlobalContact): Contact {
  return {
    id: contact.id,
    account_id: contact.account_id,
    user_id: EMPTY_USER_ID,
    full_name: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    decision_role: contact.decision_role,
    priority: contact.priority ?? 0,
    email: contact.email,
    email_verified: false,
    phone: contact.phone,
    linkedin_url: contact.linkedin_url,
    // #2861 — la liste ne sert pas encore la langue déclarée du destinataire.
    locale: null,
    profile_summary: null,
    why_contact: contact.why_contact,
    email_message: null,
    linkedin_message: null,
    phone_script: null,
    followup_message: null,
    user_status: contact.user_status,
    source: null,
    raw_data: null,
    created_at: '',
    updated_at: '',
  }
}
