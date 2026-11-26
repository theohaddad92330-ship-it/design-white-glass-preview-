/**
 * Notion OAuth configuration, read from the environment. The whole feature is a
 * no-op until these are set — mirrors HubSpot / Salesforce and the other optional
 * integrations: no key ⇒ the endpoints report "not configured" instead of failing
 * hard (the settings card stays "bientôt disponible") and ZERO network calls are
 * made.
 *
 * Register a public integration (https://www.notion.so/my-integrations → New
 * integration → Public), enable the OAuth Domain & URIs, then set:
 *   NOTION_CLIENT_ID       (OAuth client id)
 *   NOTION_CLIENT_SECRET   (OAuth client secret)
 *   NOTION_REDIRECT_URI    = <API_PUBLIC_URL>/notion/callback (must match one of
 *                            the integration's declared redirect URIs exactly)
 */

export type NotionConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readNotionConfig(): NotionConfig | null {
  const clientId = process.env['NOTION_CLIENT_ID']?.trim()
  const clientSecret = process.env['NOTION_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['NOTION_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    frontendUrl: process.env['FRONTEND_URL']?.trim() || 'http://localhost:5173',
  }
}
