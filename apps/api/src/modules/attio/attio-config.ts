/**
 * Attio OAuth configuration, read from the environment. The whole feature is a
 * no-op until these are set — mirrors Salesforce / HubSpot / the other optional
 * integrations: no key ⇒ the endpoints report "not configured" instead of
 * failing hard (the settings card stays "bientôt disponible").
 *
 * Register an OAuth integration (Attio › Settings › Developers › New OAuth
 * integration, redirect URL = <API_PUBLIC_URL>/attio/callback, grant the
 * "Read and write records" + "Read object schemas" scopes), then set:
 *   ATTIO_CLIENT_ID       (Client ID)
 *   ATTIO_CLIENT_SECRET   (Client secret)
 *   ATTIO_REDIRECT_URI    = <API_PUBLIC_URL>/attio/callback (must match the
 *                           integration's redirect URL exactly)
 *   ATTIO_SCOPES          (optional) informational only — Attio grants scopes at
 *                           the integration level, not via the authorize URL, so
 *                           this value is stored on the connection for reference
 *                           and never sent over the wire.
 *
 * Attio OAuth is unusual: the token endpoint returns a long-lived access token
 * with NO refresh token and NO expiry (like a workspace API key). We therefore
 * store it with a null `expires_at` / `refresh_token_enc` and never attempt a
 * refresh — see AttioClient / AttioService.
 */

/** Attio configures scopes on the integration itself; kept only for the DB record. */
const DEFAULT_SCOPES = 'record_permission:read_write object_configuration:read'
/** OAuth authorize/token host (Attio app). */
export const ATTIO_APP_URL = 'https://app.attio.com'
/** REST API host for record reads/writes. */
export const ATTIO_API_URL = 'https://api.attio.com'

export type AttioConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Informational — not sent in the authorize URL (Attio grants scopes app-side). */
  scopes: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readAttioConfig(): AttioConfig | null {
  const clientId = process.env['ATTIO_CLIENT_ID']?.trim()
  const clientSecret = process.env['ATTIO_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['ATTIO_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: process.env['ATTIO_SCOPES']?.trim() || DEFAULT_SCOPES,
    frontendUrl: process.env['FRONTEND_URL']?.trim() || 'http://localhost:3000',
  }
}
