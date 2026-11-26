/**
 * HubSpot OAuth configuration, read from the environment. The whole CRM feature
 * is a no-op until these are set — mirrors the other optional integrations
 * (INSEE, France Travail, INPI…): no key ⇒ the endpoints report "not configured"
 * instead of failing hard.
 *
 * Register a HubSpot app (developer.hubspot.com), then set:
 *   HUBSPOT_CLIENT_ID
 *   HUBSPOT_CLIENT_SECRET
 *   HUBSPOT_REDIRECT_URI   = <API_PUBLIC_URL>/crm/hubspot/callback  (must match
 *                            the redirect URL registered in the HubSpot app)
 *   HUBSPOT_SCOPES         (optional) space-separated; sane default below
 *
 * Read scopes: companies.read + deals.read power the CRM presence read-back
 * (« as-tu déjà un contact chez ce groupe ? » — roadmap §8/§9). Scopes are
 * granted at CONSENT time, so a portal connected before this change keeps its
 * old grant: company/deal presence stays empty until the user reconnects
 * (re-consent). Contact presence works with the pre-existing contacts.read.
 * No scope was removed — the export flow is untouched.
 */

// #4065.8 (18/10) — `crm.objects.companies.write` : « Envoyer vers mon CRM » crée la société ; sans elle
// HubSpot refusait (« hasn't been granted all required scopes »), constaté en prod.
// #1934.18 — `crm.objects.deals.write` s'ajoute pour la proposition de stade.
// ⚠️ Un portail branché AVANT ne l'a jamais accordée : la capacité `dealsWrite`
// se dérive des portées REÇUES, la carte du connecteur le dit, et le portail se
// reconnecte. Demander une portée n'est pas l'avoir.
// SYNC-A (19/10/2026) — `crm.objects.owners.read` : le miroir CRM lit les propriétaires des fiches
// (`GET /crm/v3/owners`). Même règle : un portail branché avant se RECONNECTE pour l'accorder.
const DEFAULT_SCOPES =
  'oauth crm.objects.owners.read crm.objects.contacts.read crm.objects.contacts.write crm.objects.companies.read crm.objects.companies.write crm.objects.deals.read crm.objects.deals.write'

/**
 * The single SPA origin the OAuth callback redirects the browser back to.
 *
 * `FRONTEND_URL` is overloaded: `config/cors-origins.ts` reads it as a
 * comma-separated list so several origins can be allowed during a domain
 * migration (e.g. `bellum-ai.com,app.bellum-ai.com`). The OAuth redirect needs
 * exactly one URL, so take the first non-empty entry as the canonical origin —
 * a single value stays unchanged.
 */
export function frontendOrigin(): string {
  const first = (process.env['FRONTEND_URL'] ?? '')
    .split(',')
    .map(origin => origin.trim())
    .find(Boolean)
  return first || 'http://localhost:3000'
}

export type HubspotConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readHubspotConfig(): HubspotConfig | null {
  const clientId = process.env['HUBSPOT_CLIENT_ID']?.trim()
  const clientSecret = process.env['HUBSPOT_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['HUBSPOT_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env['HUBSPOT_SCOPES']?.trim() || DEFAULT_SCOPES,
    frontendUrl: frontendOrigin(),
  }
}
