import { frontendOrigin } from '../crm/crm-config'

/**
 * Pipedrive OAuth configuration, read from the environment. The whole feature is
 * a no-op until these are set — mirrors Salesforce / HubSpot / the other optional
 * integrations: no key ⇒ the endpoints report "not configured" instead of
 * failing hard (the settings card stays "bientôt disponible").
 *
 * Register an app in the Pipedrive Marketplace (developers.pipedrive.com →
 * Marketplace Manager → Create an app, enable OAuth, callback =
 * <API_PUBLIC_URL>/pipedrive/callback), then set:
 *   PIPEDRIVE_CLIENT_ID       (Client ID)
 *   PIPEDRIVE_CLIENT_SECRET   (Client Secret)
 *   PIPEDRIVE_REDIRECT_URI    = <API_PUBLIC_URL>/pipedrive/callback (must match
 *                               the callback URL registered on the app exactly)
 *   PIPEDRIVE_SCOPES          (optional) space-separated; only appended to the
 *                               authorize URL when set — Pipedrive otherwise
 *                               grants whatever scopes the app is registered with,
 *                               and returns the granted scope in the token
 *                               response (which we persist).
 *
 * Unlike HubSpot (fixed API host) and like Salesforce (per-org instance_url),
 * Pipedrive returns a per-company `api_domain` at OAuth time that every
 * subsequent REST call must be addressed to; we persist it in `instance_url`.
 */

/** OAuth authorize/token host (shared across all Pipedrive companies). */
export const PIPEDRIVE_OAUTH_BASE_URL = 'https://oauth.pipedrive.com'
/** REST API version used for Person/Organization writes. */
export const PIPEDRIVE_API_VERSION = 'v2'

export type PipedriveConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Space-separated scopes, or '' to defer entirely to the app's registered scopes. */
  scopes: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readPipedriveConfig(): PipedriveConfig | null {
  const clientId = process.env['PIPEDRIVE_CLIENT_ID']?.trim()
  const clientSecret = process.env['PIPEDRIVE_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['PIPEDRIVE_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env['PIPEDRIVE_SCOPES']?.trim() || '',
    frontendUrl: frontendOrigin(),
  }
}
