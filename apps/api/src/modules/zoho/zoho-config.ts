import { frontendOrigin } from '../crm/crm-config'

/**
 * #4187 — Zoho CRM OAuth 2.0 configuration, read from the environment. The whole
 * feature is a no-op until these are set — same rule as the other CRM connectors:
 * no key ⇒ the provider is not offered at connection time and NO network call is
 * made (the settings card stays « bientôt disponible »).
 *
 * Register a « Server-based Application » in the Zoho API Console
 * (api-console.zoho.eu for the EU data centre), then set:
 *   ZOHO_CLIENT_ID
 *   ZOHO_CLIENT_SECRET
 *   ZOHO_REDIRECT_URI     = https://api.bellum-ai.com/zoho/callback (= <API_PUBLIC_URL>/zoho/callback,
 *                           must match the redirect URI registered on the client exactly)
 *   ZOHO_ACCOUNTS_REGION  (optional) `eu` (default) | `com` | `in` | `com.au` | `jp` | `ca` | `sa` | `com.cn`
 *                           — the DEFAULT accounts server (authorize URL). The real region of a connection
 *                           comes from the OAuth callback (`accounts-server`) and is stored per connection.
 *
 * ⚠️ Two hosts, never confused: the ACCOUNTS host (tokens — chosen by the region) and the
 * API domain (REST — returned by the token response as `api_domain`, per org). The API
 * domain is the one every REST call is addressed to; it is stored, never guessed from the
 * region.
 */

/** The accounts servers Zoho runs, by data-centre region. A region outside this list is refused, not mapped to a default. */
const ZOHO_ACCOUNTS_HOSTS: Readonly<Record<string, string>> = {
  eu: 'https://accounts.zoho.eu',
  com: 'https://accounts.zoho.com',
  in: 'https://accounts.zoho.in',
  'com.au': 'https://accounts.zoho.com.au',
  jp: 'https://accounts.zoho.jp',
  ca: 'https://accounts.zohocloud.ca',
  sa: 'https://accounts.zoho.sa',
  'com.cn': 'https://accounts.zoho.com.cn',
}

/**
 * L.6 — le serveur de comptes que Zoho RENVOIE au callback (`accounts-server`) : la région réelle
 * de l'organisation. Il ne sert qu'à l'échange de jeton, au rafraîchissement et à la révocation de
 * CETTE connexion — et il reçoit le secret du client : on n'envoie donc JAMAIS ce secret à un hôte
 * hors de la table officielle « multi-DC » (un `accounts-server` forgé dans l'URL du callback ne
 * mène nulle part). Hors table = null, l'appelant garde le défaut.
 */
/** `location` (« eu », « in »…) renvoyé au callback, en repli quand `accounts-server` manque. */
export function zohoAccountsUrlForLocation(location: string | null | undefined): string | null {
  return ZOHO_ACCOUNTS_HOSTS[location?.trim().toLowerCase() ?? ''] ?? null
}

/** #4380.2 — les domaines d'API REST que Zoho sert, par région (`api_domain` du token). */
const ZOHO_API_HOSTS: readonly string[] = [
  'https://www.zohoapis.com',
  'https://www.zohoapis.eu',
  'https://www.zohoapis.in',
  'https://www.zohoapis.com.au',
  'https://www.zohoapis.jp',
  'https://www.zohoapis.ca',
  'https://www.zohoapis.sa',
  'https://www.zohoapis.com.cn',
]

/**
 * #4380.2 — le `api_domain` rendu par le token reçoit le jeton d'accès à chaque appel REST : hors de la table
 * officielle il est refusé (null), jamais utilisé tel quel — une URL arbitraire est un SSRF.
 */
export function knownZohoApiDomain(raw: string | null | undefined): string | null {
  const url = raw?.trim().replace(/\/+$/, '').toLowerCase()
  if (!url) return null
  return ZOHO_API_HOSTS.includes(url) ? url : null
}

export function knownZohoAccountsUrl(raw: string | null | undefined): string | null {
  const url = raw?.trim().replace(/\/+$/, '').toLowerCase()
  if (!url) return null
  return Object.values(ZOHO_ACCOUNTS_HOSTS).includes(url) ? url : null
}

/**
 * The minimal scopes the connector asks for. Nothing is read or written beyond them:
 * - accounts/contacts ALL : read, and write through the common gate (#4186);
 * - deals READ            : deals are read, never written;
 * - tasks CREATE          : a besoin lands as a task (no read of tasks → no activities read);
 * - notes CREATE          : the detail lands as a note on the account;
 * - users READ            : the owners, and the connection test.
 */
export const ZOHO_SCOPES = [
  'ZohoCRM.modules.accounts.ALL',
  'ZohoCRM.modules.contacts.ALL',
  'ZohoCRM.modules.deals.READ',
  'ZohoCRM.modules.tasks.CREATE',
  'ZohoCRM.modules.notes.CREATE',
  'ZohoCRM.users.READ',
] as const

export const ZOHO_API_VERSION = 'v6'

export type ZohoConfig = {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** `https://accounts.zoho.<region>` — tokens only; REST goes to the stored `api_domain`. */
  accountsUrl: string
  region: string
  /** Where the callback bounces the browser back to (the SPA). */
  frontendUrl: string
}

export function readZohoConfig(): ZohoConfig | null {
  const clientId = process.env['ZOHO_CLIENT_ID']?.trim()
  const clientSecret = process.env['ZOHO_CLIENT_SECRET']?.trim()
  const redirectUri = process.env['ZOHO_REDIRECT_URI']?.trim()
  if (!clientId || !clientSecret || !redirectUri) return null

  const region = (process.env['ZOHO_ACCOUNTS_REGION']?.trim().toLowerCase() || 'eu').replace(/^\./, '')
  const accountsUrl = ZOHO_ACCOUNTS_HOSTS[region]
  // A mistyped region must not silently send a tenant's code to another data centre.
  if (!accountsUrl) return null

  return { clientId, clientSecret, redirectUri, accountsUrl, region, frontendUrl: frontendOrigin() }
}

/**
 * #4380 — le texte que l'écran montre quand Zoho refuse ou que l'échange échoue. Il nomme le centre de données
 * (hôte des comptes) et l'URI de redirection attendus — de quoi comparer à la console API Zoho — et JAMAIS
 * la valeur du client ni du secret.
 */
export function zohoFailureReason(code: string, config: ZohoConfig | null): string {
  const where = config
    ? `Centre de données configuré : ${config.accountsUrl.replace('https://', '')} ; URI de redirection attendue : ${config.redirectUri}.`
    : ''
  if (code === 'access_denied') return 'Connexion refusée côté Zoho : le consentement n’a pas été accordé.'
  if (code === 'invalid_client' || code === 'invalid_client_id') {
    return `Zoho ne reconnaît pas le client OAuth sur ce centre de données. ${where} Le client doit être créé dans la console API de ce même centre, avec l’option Multi-DC cochée pour les organisations d’une autre région.`.trim()
  }
  if (code === 'invalid_redirect_uri' || code === 'redirect_uri_mismatch') {
    return `L’URI de redirection ne correspond pas à celle déclarée sur le client Zoho. ${where}`.trim()
  }
  if (code === 'read_failed')
    return `Zoho a répondu, mais la lecture de test du compte a été refusée : rien n’a été enregistré. ${where}`.trim()
  if (code === 'exchange_failed') return `L’échange du code avec Zoho a échoué. ${where}`.trim()
  if (code === 'invalid_state')
    return 'La demande de connexion a expiré ou n’est pas reconnue : relancer « Connecter Zoho ».'
  if (code === 'missing_code') return `Zoho n’a renvoyé aucun code d’autorisation. ${where}`.trim()
  return `Zoho a refusé la connexion (${code}). ${where}`.trim()
}
