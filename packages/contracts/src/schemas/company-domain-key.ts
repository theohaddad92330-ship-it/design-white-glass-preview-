/**
 * #2284.20 (tranche 2) — LE DOMAINE COMME CLÉ DE RÉSOLUTION.
 *
 * Le domaine racine d'une saisie qui EST un domaine ou une URL
 * (`https://www.thalesgroup.com/fr` → `thalesgroup.com`), sinon `null`.
 *
 * Plus strict que `marketRootDomain` (mémoire marché), qui lit une colonne
 * `website` déjà connue pour être une URL : ici la saisie est libre, et un nom
 * d'entreprise n'est JAMAIS pris pour un domaine — « Capgemini S.A. » contient
 * un point, il ne désigne pas le site `capgemini.s.a`. D'où les deux gardes :
 * aucun espace, et une extension alphabétique de deux lettres au moins.
 *
 * `null` est une réponse : la résolution retombe alors sur le SIREN ou le nom.
 */
const PLATFORM_DOMAINS: ReadonlySet<string> = new Set([
  'linkedin.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'youtube.com',
  'wix.com',
  'wordpress.com',
])

const DOMAIN_SHAPE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/

export function companyDomainKey(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? ''
  if (trimmed.length === 0 || /\s/.test(trimmed)) return null

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  let host: string
  try {
    host = new URL(withScheme).hostname.toLowerCase()
  } catch {
    return null
  }
  const bare = host.startsWith('www.') ? host.slice(4) : host
  if (!DOMAIN_SHAPE.test(bare)) return null
  return PLATFORM_DOMAINS.has(bare) ? null : bare
}
