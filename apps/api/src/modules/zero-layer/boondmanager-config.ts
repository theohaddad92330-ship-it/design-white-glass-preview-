/**
 * Connecteur ATS BoondManager — configuration lue dans l'environnement.
 *
 * BoondManager est l'ERP/ATS de référence des ESN françaises, et la p8 de
 * l'annexe le cite nommément parmi les endroits où dort l'historique d'un
 * compte. Sans identifiants, la source est un NO-OP STRICT : aucun appel réseau,
 * la couche zéro se comporte exactement comme avant.
 *
 * ── Ce qui est VÉRIFIÉ (client officiel `pyboondmanager`, doc éditeur) ────────
 *   - base d'API      : https://ui.boondmanager.com/api
 *   - authentification: HTTP Basic (jeton utilisateur), ou en-têtes JWT
 *                       `X-Jwt-Client-Boondmanager` / `X-Jwt-App-Boondmanager`
 *   - ressources      : /companies, /companies/{id}, /opportunities, /contacts,
 *                       /candidates, /positionings
 *
 * ── Ce qui n'est PAS public, donc paramétrable plutôt que deviné ─────────────
 * Le nom du paramètre de recherche des listes n'est pas documenté publiquement
 * (`keywords` est la valeur retenue par défaut, c'est celle qu'emploient les
 * intégrations tierces). Un opérateur dont le compte attend autre chose le
 * change par variable d'environnement, sans redeploy ni patch. En dernier
 * recours, le client refiltre côté client sur le nom rendu — donc un paramètre
 * ignoré par le serveur dégrade la couverture, il ne produit JAMAIS un faux
 * rattachement.
 *
 * Variables :
 *   BOONDMANAGER_USER_TOKEN     jeton utilisateur (Configuration → API) — Basic
 *   BOONDMANAGER_CLIENT_TOKEN   \ espace développeur → API/Sandbox
 *   BOONDMANAGER_CLIENT_KEY     /  (alternative JWT au jeton utilisateur)
 *   BOONDMANAGER_BASE_URL       (optionnel) surcharge de la base d'API
 *   BOONDMANAGER_SEARCH_PARAM   (optionnel, défaut `keywords`)
 *
 * ── OAuth2 (App publiée sur la Marketplace, #4688) ───────────────────────────
 *   BOONDMANAGER_OAUTH_CLIENT_ID / _CLIENT_SECRET / _REDIRECT_URI — voir `readBoondManagerOAuthApp`.
 *   Détail et défauts : agent_docs/env-reference.md.
 */

export type BoondManagerConfig = {
  baseUrl: string
  searchParam: string
  /** Jeton utilisateur → HTTP Basic. Exclusif avec le couple JWT. */
  userToken?: string
  /** Couple espace développeur → en-têtes JWT. */
  clientToken?: string
  clientKey?: string
  /** #4688 — jeton d'accès OAuth2 → `Authorization: Bearer`. Exclusif avec les deux modes hérités. */
  accessToken?: string
  /** #4693 — clé de la connexion (espace + environnement) : limiteur, coupe-circuit, compteurs et dictionnaire sont PAR clé. */
  connectionKey?: string
  /** #4691 — scopes ACCORDÉS (colonne `scopes`). Absent = connexion héritée, sans notion de scope. Jamais supposés. */
  grantedScopes?: string[]
}

/** L'App OAuth2 déclarée côté Boond (Developer space › Apps). */
export type BoondManagerOAuthApp = {
  clientId: string
  /** Absent = client public (`token_endpoint_auth_method: none`). Jamais journalisé ni rendu. */
  clientSecret?: string
  redirectUri: string
  authorizeUrl: string
  tokenUrl: string
  revokeUrl: string
}

const DEFAULT_BASE_URL = 'https://ui.boondmanager.com/api'
const DEFAULT_SEARCH_PARAM = 'keywords'

export function readBoondManagerConfig(): BoondManagerConfig | null {
  const userToken = process.env['BOONDMANAGER_USER_TOKEN']?.trim()
  const clientToken = process.env['BOONDMANAGER_CLIENT_TOKEN']?.trim()
  const clientKey = process.env['BOONDMANAGER_CLIENT_KEY']?.trim()

  // Un jeton utilisateur SEUL suffit ; le couple JWT exige ses deux moitiés.
  const hasBasic = Boolean(userToken)
  const hasJwt = Boolean(clientToken && clientKey)
  if (!hasBasic && !hasJwt) return null

  return {
    baseUrl: (process.env['BOONDMANAGER_BASE_URL']?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    searchParam: process.env['BOONDMANAGER_SEARCH_PARAM']?.trim() || DEFAULT_SEARCH_PARAM,
    ...(hasBasic ? { userToken } : {}),
    ...(hasJwt ? { clientToken, clientKey } : {}),
  }
}

/**
 * L'App OAuth2 de BellumAI. `null` sans identifiant d'App ou sans URL de retour : NO-OP STRICT, aucun appel réseau,
 * le bouton de connexion ne s'affiche pas et les modes hérités continuent de fonctionner.
 *
 * Les points d'accès sont ceux des métadonnées RFC 8414 publiques de Boond, sous la base d'API : une instance dédiée
 * (`BOONDMANAGER_BASE_URL`) porte les siens au même chemin relatif.
 */
export function readBoondManagerOAuthApp(baseUrl?: string): BoondManagerOAuthApp | null {
  const clientId = process.env['BOONDMANAGER_OAUTH_CLIENT_ID']?.trim()
  const redirectUri = process.env['BOONDMANAGER_OAUTH_REDIRECT_URI']?.trim()
  if (!clientId || !redirectUri) return null
  const clientSecret = process.env['BOONDMANAGER_OAUTH_CLIENT_SECRET']?.trim()
  const base = (baseUrl || process.env['BOONDMANAGER_BASE_URL']?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return {
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
    redirectUri,
    authorizeUrl: `${base}/oauth2/authorize`,
    tokenUrl: `${base}/oauth2/token`,
    revokeUrl: `${base}/oauth2/revoke`,
  }
}
