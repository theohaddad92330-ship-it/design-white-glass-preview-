import type { ContactEntity } from '../../database/entities/contact.entity'
import type { HubspotContactInput } from './hubspot.client'

/**
 * Project a resolved Bellum contact onto the CRM's contact-input shape. Single
 * source for both the MCP action surface (`log_to_crm`) and the Action Router
 * (`create_crm_task`) so the two never drift. Only real, present fields are
 * forwarded — blanks collapse to `undefined`; nothing is fabricated.
 *
 * The Salesforce client's `SalesforceContactInput` is structurally the same
 * shape (email/firstName/lastName/company/jobTitle/phone/linkedinUrl), so this
 * projection feeds both providers.
 */
export function contactToCrmInput(contact: ContactEntity): HubspotContactInput {
  const trimmed = (value: string | null | undefined): string | undefined => value?.trim() || undefined
  return {
    email: trimmed(contact.email),
    ...splitName(contact.full_name ?? ''),
    company: trimmed(contact.entity),
    jobTitle: trimmed(contact.title),
    phone: trimmed(contact.phone),
    linkedinUrl: trimmed(contact.linkedin_url),
  }
}

/**
 * Split a stored `full_name` into first/last for CRM properties. A single-token
 * name keeps just a first name (HubSpot/Salesforce accept a contact with only a
 * first name). Never fabricates — only reshapes real DB fields.
 */
export function splitName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}
