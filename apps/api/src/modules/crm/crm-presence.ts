/**
 * CRM presence read-back — the typed answer to « as-tu déjà un contact chez ce
 * groupe ? » (roadmap §8/§9). Shared by the HubSpot and Salesforce providers and
 * by the orchestrating CrmReadService, so the SPA / chatbot consume ONE shape
 * whatever the connected CRM is.
 *
 * Honesty contract (JAMAIS de donnée inventée) :
 *   - no CRM connected            → `provider: null`, `matched: false`, empty lists
 *   - connected but no match/error → `provider` set, `matched: false`, empty lists
 *   - matched                     → real records only, straight from the CRM API
 */

/** A CRM contact already known at the target account. */
export type CrmPresenceContact = {
  id: string
  name: string | null
  email: string | null
  jobTitle: string | null
}

/** An OPEN deal / opportunity attached to the target account. */
export type CrmPresenceDeal = {
  id: string
  name: string | null
  stage: string | null
  /** #1934.18 — le pipeline de l'affaire, quand le CRM le rend. Il décide QUELS
   *  stades peuvent lui être proposés. Absent = inconnu, jamais deviné. */
  pipeline?: string | null
  amount: number | null
}

export type CrmPresence = {
  /** Which CRM answered — null when none is connected (nothing was consulted). */
  provider: 'hubspot' | 'salesforce' | null
  /** True only when the CRM returned at least one contact or open deal. */
  matched: boolean
  contactsCount: number
  /** Top matched contacts (bounded — the count above may be larger). */
  contacts: CrmPresenceContact[]
  openDeals: CrmPresenceDeal[]
  /** ISO timestamp of the most recent CRM activity seen across the matches. */
  lastActivityAt: string | null
}

/** What we match the CRM against. `account` (company name) is the anchor;
 *  `domain` sharpens the match (email domain / company website); `siren` is
 *  accepted for future FR-aware CRMs but unused by HubSpot/Salesforce (neither
 *  stores it natively — matching on it would be guesswork). */
export type CrmPresenceQuery = {
  account?: string
  domain?: string
  siren?: string
}

/** The honest empty answer. `provider` stays null when no CRM was consulted. */
export function emptyPresence(provider: CrmPresence['provider'] = null): CrmPresence {
  return { provider, matched: false, contactsCount: 0, contacts: [], openDeals: [], lastActivityAt: null }
}

/** Extract a bare registrable-ish host from a website URL ("https://www.acme.fr/x"
 *  → "acme.fr"). Null on anything unparsable — better no domain than a wrong one. */
export function domainFromWebsite(website: string | null | undefined): string | null {
  const raw = (website ?? '').trim()
  if (!raw) return null
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
    const bare = host.replace(/^www\./i, '')
    return bare.includes('.') ? bare.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * Le CRM est nommé par sa CAPACITÉ, jamais par son éditeur (addendum final p12 :
 * « ne jamais révéler les fournisseurs »). Ce digest part dans le prompt du
 * copilote ET dans le plan de compte : deux surfaces lues par un commercial —
 * parfois devant son client. « Votre CRM » y dit exactement la même chose que
 * « HubSpot » sans exposer la chaîne d'outillage de Bellum.
 *
 * Le `provider` reste porté par la donnée (journal, back-office, écran Réglages
 * › Intégrations où l'utilisateur autorise lui-même l'accès) : c'est seulement
 * sa RESTITUTION au commercial qui se généralise.
 */
const CRM_GENERIC_LABEL = 'Votre CRM'

/**
 * Deterministic French digest of a CRM presence for the advisor prompt.
 * `provider: null` (CRM not actually consulted) → null. A consulted-but-empty
 * CRM still yields a line: « aucun contact » is real, useful information — and
 * it stops the model from guessing.
 *
 * Lives here (rather than next to the chat context that first needed it) because
 * the analysis pipeline reads the SAME digest: the couche zéro of the sales
 * methodology (annexe p8) asks the plan to look for what already exists before
 * proposing a cold approach, and both consumers must state the same facts.
 */
export function formatCrmPresence(presence: CrmPresence, accountName: string): string | null {
  if (!presence.provider) return null
  if (!presence.matched) {
    return `${CRM_GENERIC_LABEL} consulté : aucun contact ni deal ouvert trouvé pour « ${accountName} ».`
  }
  const lines: string[] = [`${CRM_GENERIC_LABEL} consulté pour « ${accountName} » :`]
  if (presence.contactsCount > 0) {
    const named = presence.contacts
      .map(c => (c.name ? (c.jobTitle ? `${c.name} (${c.jobTitle})` : c.name) : (c.email ?? '')))
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    lines.push(`- ${presence.contactsCount} contact(s) déjà dans votre CRM chez ce groupe${named ? ` : ${named}` : ''}`)
  } else {
    lines.push('- Aucun contact existant chez ce groupe')
  }
  if (presence.openDeals.length > 0) {
    const named = presence.openDeals
      .map(d => {
        const bits = [d.stage, d.amount != null ? `${d.amount} €` : null].filter(Boolean).join(', ')
        return d.name ? (bits ? `${d.name} (${bits})` : d.name) : null
      })
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    lines.push(`- ${presence.openDeals.length} deal(s) ouvert(s)${named ? ` : ${named}` : ''}`)
  } else {
    lines.push('- Aucun deal ouvert')
  }
  if (presence.lastActivityAt) lines.push(`- Dernière activité CRM : ${presence.lastActivityAt.slice(0, 10)}`)
  return lines.join('\n')
}

/** Max ISO timestamp among CRM date strings (invalid/empty ignored). */
export function latestIso(dates: Array<string | null | undefined>): string | null {
  let max: number | null = null
  for (const d of dates) {
    if (!d) continue
    const t = Date.parse(d)
    if (!Number.isNaN(t) && (max === null || t > max)) max = t
  }
  return max === null ? null : new Date(max).toISOString()
}
