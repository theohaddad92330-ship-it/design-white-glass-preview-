/**
 * Salesforce OAuth configuration, read from the environment. The whole feature
 * is a no-op until these are set — mirrors HubSpot / the other optional
 * integrations: no key ⇒ the endpoints report "not configured" instead of
 * failing hard (the settings card stays "bientôt disponible").
 *
 * Register a Connected App (Setup › App Manager › New Connected App, enable
 * OAuth, callback = <API_PUBLIC_URL>/salesforce/callback), then set:
 *   SALESFORCE_CLIENT_ID       (Consumer Key)
 *   SALESFORCE_CLIENT_SECRET   (Consumer Secret)
 *   SALESFORCE_REDIRECT_URI    = <API_PUBLIC_URL>/salesforce/callback (must match
 *                                the app's callback URL exactly)
 *   SALESFORCE_LOGIN_URL       (optional) https://login.salesforce.com (prod, default)
 *                                or https://test.salesforce.com (sandbox)
 *   SALESFORCE_SCOPES          (optional) space-separated; sane default below
 */

/**
 * `api` is Salesforce's coarse-grained data scope: it covers BOTH the sObject
 * writes (export) and the SOQL reads used by the CRM presence read-back
 * (Contact / Opportunity queries) — Salesforce has no per-object OAuth scopes,
 * record visibility is the connected user's own sharing model. No extra scope
 * is needed for reads and none was removed; existing connections keep working.
 */
const DEFAULT_SCOPES = 'api refresh_token'
const DEFAULT_LOGIN_URL = 'https://login.salesforce.com'
/** REST API version used for sObject writes + SOQL reads. */
export const SALESFORCE_API_VERSION = 'v60.0'

export type SalesforceConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string
  /** OAuth authorize/token host (prod or sandbox). */
  loginUrl: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readSalesforceConfig(): SalesforceConfig | null {
  const clientId = process.env['SALESFORCE_CLIENT_ID']?.trim()
  const clientSecret = process.env['SALESFORCE_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['SALESFORCE_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env['SALESFORCE_SCOPES']?.trim() || DEFAULT_SCOPES,
    loginUrl: process.env['SALESFORCE_LOGIN_URL']?.trim() || DEFAULT_LOGIN_URL,
    frontendUrl: process.env['FRONTEND_URL']?.trim() || 'http://localhost:3000',
  }
}
