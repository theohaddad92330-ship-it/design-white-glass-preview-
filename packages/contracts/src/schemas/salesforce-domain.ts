/**
 * #4431.1 — le domaine de connexion d'UNE organisation Salesforce.
 *
 * Une organisation à domaine personnalisé (My Domain, connexion unique d'entreprise) refuse la connexion
 * depuis `login.salesforce.com` : elle exige son propre hôte `<société>.my.salesforce.com`. Ce que le
 * commercial colle est souvent l'hôte de l'interface (`<société>.lightning.force.com`), qui n'est PAS l'hôte
 * de connexion — on le convertit au lieu de le refuser.
 *
 * UNE seule fonction, utilisée par l'écran (message avant l'appel) ET par l'API (barrière réelle) : un
 * réglage, une règle, à un seul endroit. Rien d'autre que `*.salesforce.com` / `*.force.com` n'est accepté —
 * c'est l'hôte vers lequel partiront le consentement, le jeton et le secret de l'application.
 */

export type SalesforceLoginUrlResult =
  | { ok: true; loginUrl: string | null }
  | { ok: false; reason: 'invalid' | 'host_not_allowed' }

const SANDBOX_LOGIN_URL = 'https://test.salesforce.com'
const LIGHTNING_SUFFIX = '.lightning.force.com'
const MY_DOMAIN_SUFFIX = '.my.salesforce.com'
const ALLOWED_SUFFIXES = ['.salesforce.com', '.force.com'] as const

/**
 * `domain` : ce que l'utilisateur a saisi (vide = aucun). `sandbox` : la case à cocher.
 * `loginUrl: null` = aucun domaine propre, le comportement actuel (hôte global de la config).
 */
export function resolveSalesforceLoginUrl(
  domain: string | null | undefined,
  sandbox: boolean,
): SalesforceLoginUrlResult {
  const raw = (domain ?? '').trim()
  if (!raw) return { ok: true, loginUrl: sandbox ? SANDBOX_LOGIN_URL : null }

  let rest = raw
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest)
  if (scheme) {
    if (scheme[1]?.toLowerCase() !== 'https') return { ok: false, reason: 'invalid' }
    rest = rest.slice(scheme[0].length)
  }
  const authority = rest.split(/[/?#]/)[0] ?? ''
  // Un identifiant (`a@b`) ou un port ne sont pas un hôte de connexion : jamais deviné.
  if (authority.includes('@') || authority.includes(':')) return { ok: false, reason: 'invalid' }

  let host = authority.toLowerCase()
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) || host.includes('..')) return { ok: false, reason: 'invalid' }

  if (host.endsWith(LIGHTNING_SUFFIX)) host = `${host.slice(0, -LIGHTNING_SUFFIX.length)}${MY_DOMAIN_SUFFIX}`
  if (!ALLOWED_SUFFIXES.some(suffix => host.endsWith(suffix))) return { ok: false, reason: 'host_not_allowed' }
  return { ok: true, loginUrl: `https://${host}` }
}
