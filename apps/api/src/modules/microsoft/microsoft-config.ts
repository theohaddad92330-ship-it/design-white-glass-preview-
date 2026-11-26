/**
 * Microsoft 365 / Outlook OAuth configuration (Microsoft Graph), read from the
 * environment. The whole feature is a no-op until these are set — mirrors
 * HubSpot / Salesforce and the other optional integrations: no key ⇒ the
 * endpoints report "not configured" instead of failing hard (the settings card
 * stays "bientôt disponible"), with ZERO network calls.
 *
 * Register an app (Microsoft Entra admin center › App registrations), add a Web
 * redirect URI = <API_PUBLIC_URL>/microsoft/callback, grant the delegated Graph
 * permissions listed in `DEFAULT_SCOPES` below — the list here used to name only
 * three of them, so an operator who followed it registered an app that could not
 * do what the product ships — then set:
 *   MICROSOFT_CLIENT_ID       (Application (client) ID)
 *   MICROSOFT_CLIENT_SECRET   (client secret value)
 *   MICROSOFT_REDIRECT_URI    = <API_PUBLIC_URL>/microsoft/callback (must match
 *                               the redirect URI registered on the app exactly)
 *   MICROSOFT_TENANT          (optional) common | organizations | consumers | a
 *                               tenant id. Default `common`.
 *   MICROSOFT_SCOPES          (optional) space-separated; sane default below.
 *                               Keep `offline_access` to receive a refresh token.
 */

const DEFAULT_TENANT = 'common'
/**
 * Portées par défaut. `Mail.ReadWrite` remplace un simple `Mail.Read` parce que
 * le socle exécutif (méta-analyses besoins, 03/08/2026) doit pouvoir DÉPOSER un
 * brouillon dans la boîte, pas seulement la lire — et Graph n'a pas de portée
 * « créer un brouillon » plus étroite. `MailboxSettings.ReadWrite` ne sert qu'à
 * la réponse d'absence. Ajout ADDITIF : un utilisateur connecté avant ce
 * changement garde sa concession plus étroite, et les capacités concernées
 * restent éteintes jusqu'à ce qu'il se reconnecte.
 *
 * ⚠️ **`Files.Read.All` n'y est PAS, et c'est une décision.** La recherche
 * documentaire est pourtant livrée (`MicrosoftService.searchFiles`,
 * `fetchFileForAttachment`, capacité `search` de `tool-capabilities.ts`) : elle
 * reste donc éteinte — l'écran affiche `scope_missing`, ce qui est exact — tant
 * qu'un opérateur ne l'a pas ajoutée à `MICROSOFT_SCOPES` et que l'utilisateur
 * ne s'est pas reconnecté.
 *
 * La raison n'est pas un oubli : chez Graph, `Files.Read.All` porte sur TOUT ce
 * que l'utilisateur peut atteindre dans le tenant (OneDrive ET SharePoint), et
 * beaucoup de tenants la placent derrière un consentement d'administrateur. Dans
 * le défaut, elle mettrait la connexion ENTIÈRE — messagerie et agenda compris,
 * qui marchent aujourd'hui — derrière l'accord d'un administrateur, pour une
 * capacité secondaire. Ce n'est donc pas l'équivalent de `drive.readonly` côté
 * Google, mais celui de `GMAIL_MODIFY_SCOPE` : hors du défaut, opt-in opérateur.
 *
 * Gardé par `src/architecture/capability-scopes-are-asked-for.spec.ts` : toute
 * portée exigée par une capacité est soit demandée ici, soit NOMMÉE là-bas comme
 * opt-in avec sa raison. Ce qui devient impossible, c'est le troisième cas — une
 * capacité qui exige une portée dont plus personne ne sait qu'elle manque.
 */
const DEFAULT_SCOPES = 'offline_access Mail.Send Mail.ReadWrite MailboxSettings.ReadWrite Calendars.ReadWrite User.Read'

/**
 * The single SPA origin the OAuth callback redirects the browser back to.
 * `FRONTEND_URL` may be a comma-separated list during a domain migration — take
 * the first non-empty entry as the canonical origin (a single value is unchanged).
 */
export function microsoftFrontendOrigin(): string {
  const first = (process.env['FRONTEND_URL'] ?? '')
    .split(',')
    .map(origin => origin.trim())
    .find(Boolean)
  return first || 'http://localhost:3000'
}

export type MicrosoftConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** Azure AD tenant segment in the authorize/token URL (common by default). */
  tenant: string
  scopes: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readMicrosoftConfig(): MicrosoftConfig | null {
  const clientId = process.env['MICROSOFT_CLIENT_ID']?.trim()
  const clientSecret = process.env['MICROSOFT_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['MICROSOFT_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  return {
    clientId,
    clientSecret,
    redirectUri,
    tenant: process.env['MICROSOFT_TENANT']?.trim() || DEFAULT_TENANT,
    scopes: process.env['MICROSOFT_SCOPES']?.trim() || DEFAULT_SCOPES,
    frontendUrl: microsoftFrontendOrigin(),
  }
}
