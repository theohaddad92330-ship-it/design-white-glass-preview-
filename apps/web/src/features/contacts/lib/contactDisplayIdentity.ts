import { isContactIdentityComplete } from '@bellum/contracts'

/** Minimal contact shape the display helper reads — satisfied by both the
 *  detail `Contact` and the list `GlobalContact` (snake_case). */
type ContactIdentityFields = {
  full_name: string
  title?: string | null
  entity?: string | null
  decision_role?: string | null
  email?: string | null
  phone?: string | null
  linkedin_url?: string | null
  /** Surname as Apollo masks it on its free search tier (`"Mo***y"`). The list
   *  projection selects it as a column; the contact detail carries it inside
   *  `raw_data`, so both spellings are read. */
  last_name_obfuscated?: string | null
  raw_data?: Record<string, unknown> | null
}

type ContactDisplayIdentity = {
  /** The primary label to render. The real name once the identity is confirmed;
   *  otherwise the ROLE, so an unconfirmed role-persona placeholder never shows
   *  its fake first name as if it were a real person (retour Théo P0). */
  label: string
  /** True when we're showing the role as a stand-in because the real person
   *  isn't confirmed yet → render the « Rôle à identifier » badge and hide the
   *  placeholder name. Flips to false the moment Apollo/SalesQL completes the
   *  real name (identity becomes complete). */
  roleToIdentify: boolean
  /** True when the label is a first name + masked initial ("Séverine M.") —
   *  a real person Apollo has named only partially. The UI badges it « Nom à
   *  révéler » and enrichment completes it. */
  nameToReveal?: boolean
}

/**
 * Decide what to render for a contact's identity.
 *
 * A contact whose name is a placeholder (< 2 tokens — a role-persona like
 * « Julien · Directeur des Sports » or a first-name-only seed) is NOT a
 * confirmed person: we must not present the placeholder first name as a real
 * name. When such a contact carries a role/title, we show the ROLE instead and
 * flag it « à identifier ». As soon as a real match (Apollo/SalesQL) completes
 * the full name, {@link isContactIdentityComplete} returns true and we show the
 * real name + photo — the flag disappears. Present-only, never invented.
 */
export function contactDisplayIdentity(contact: ContactIdentityFields): ContactDisplayIdentity {
  // Recette 31/10 — un « nom » identique au poste est un SIÈGE sans titulaire (plusieurs mots,
  // il passait pour un nom complet : le poste s'affichait comme un nom, puis encore en dessous,
  // et « X (X) » sous l'acheteur). On le dit : rôle à identifier, le poste une seule fois.
  const seatTitle = (contact.title ?? '').trim()
  if (seatTitle && contact.full_name.trim().toLowerCase() === seatTitle.toLowerCase()) {
    return { label: seatTitle, roleToIdentify: true }
  }
  const complete = isContactIdentityComplete({
    fullName: contact.full_name,
    title: contact.title,
    entity: contact.entity,
    role: contact.decision_role,
    email: contact.email,
    phone: contact.phone,
    linkedinUrl: contact.linkedin_url,
  })
  if (complete) {
    return { label: contact.full_name, roleToIdentify: false }
  }
  // Apollo search-tier hit: we hold the first name and the masked surname. Show
  // "Séverine M." — the first letter Apollo itself published, nothing more — so
  // the rep sees a person instead of a role, while the badge says the name is not
  // revealed yet. Preferred over the role stand-in below because it is MORE
  // information about the same contact, not a guess.
  const rawMask = contact.raw_data?.['lastNameObfuscated']
  const mask = contact.last_name_obfuscated ?? (typeof rawMask === 'string' ? rawMask : '')
  const maskedInitial = mask.trim().match(/\p{L}/u)?.[0]
  const firstName = contact.full_name.trim()
  // c81 (Louis 04/10/2026) — un nom COMPLET déjà en base s'affiche en clair :
  // l'initiale ne remplace qu'un prénom seul, jamais un nom qu'on tient.
  const holdsFullName = firstName.split(/\s+/).filter(Boolean).length >= 2
  if (maskedInitial && firstName && !holdsFullName) {
    return { label: `${firstName} ${maskedInitial.toUpperCase()}.`, roleToIdentify: false, nameToReveal: true }
  }
  const role = (contact.title ?? '').trim()
  if (role) {
    // Unconfirmed role-persona → surface the role, not the placeholder name.
    return { label: role, roleToIdentify: true }
  }
  // Incomplete but no role to stand in for the placeholder — keep the name as-is
  // (the existing « identité incomplète » treatment still applies).
  return { label: contact.full_name || '', roleToIdentify: false }
}
