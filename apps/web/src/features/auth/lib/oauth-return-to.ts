/**
 * Le retour vers l'autorisation OAuth MCP (`/oauth/authorize`) après la page de
 * connexion.
 *
 * L'API renvoie un visiteur sans session vers `<front>/login?returnTo=<issuer>/oauth/authorize?…`,
 * où `issuer` = `API_PUBLIC_URL`. Quand l'issuer n'est pas l'hôte public de l'API
 * (en prod : l'hôte Railway), le cookie de session de la personne n'existe PAS
 * sur cet hôte : y retourner la renvoie au login, en boucle. On accepte donc
 * l'issuer, mais on ramène toujours la navigation sur l'origine de l'API que le
 * navigateur connaît — celle qui porte le cookie.
 *
 * Liste blanche : origine de l'API, ou issuer annoncé par l'API elle-même ;
 * chemin `/oauth/authorize` seulement. Rien d'autre — jamais une redirection ouverte.
 */
const AUTHORIZE_PATH = '/oauth/authorize'

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** L'URL où envoyer le navigateur, ou `null` si `returnTo` n'est pas permis. */
export function resolveOauthReturnTo(returnTo: string, apiOrigin: string, issuer: string | null): string | null {
  if (!returnTo) return null
  let target: URL
  try {
    target = new URL(returnTo)
  } catch {
    return null
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return null
  if (target.pathname !== AUTHORIZE_PATH) return null
  const issuerOrigin = issuer ? originOf(issuer) : null
  if (target.origin !== apiOrigin && target.origin !== issuerOrigin) return null
  return `${apiOrigin}${target.pathname}${target.search}`
}

/** L'issuer que l'API annonce (RFC 8414), `null` s'il est illisible. */
export async function fetchOauthIssuer(apiOrigin: string): Promise<string | null> {
  try {
    const res = await fetch(`${apiOrigin}/.well-known/oauth-authorization-server`)
    if (!res.ok) return null
    const body = (await res.json()) as { issuer?: unknown }
    return typeof body?.issuer === 'string' ? body.issuer : null
  } catch {
    return null
  }
}
