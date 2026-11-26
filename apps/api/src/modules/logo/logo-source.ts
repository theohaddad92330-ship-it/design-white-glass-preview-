/**
 * Anti-SSRF boundary of the logo proxy.
 *
 * `/logo` takes caller-supplied input and makes the SERVER perform an outbound
 * fetch — the classic SSRF shape. Everything that decides WHICH host gets
 * contacted lives here, in one pure, exhaustively-tested function, so the
 * surface can be read in one sitting. Same spirit as the host-pinning in
 * `modules/integrations/integration-providers.ts`.
 *
 * Two branches, both closed:
 *
 *  - `src` (the persisted Apollo logo, `accounts.logo_url`) is matched against
 *    an explicit host ALLOW-LIST. Not a regex over the raw string — the host is
 *    parsed with `URL` and compared for EQUALITY, so neither
 *    `…amazonaws.com.evil.com` nor `evil.com/…amazonaws.com` can smuggle past.
 *  - `domain` never chooses a host at all: it is only ever escaped into the
 *    query string of a CONSTANT Google origin. That branch is therefore
 *    structurally incapable of reaching an attacker-chosen host.
 *
 * On top of that the caller (`LogoService`) refuses redirects, which is how a
 * pinned host would otherwise bounce us into a private range.
 */

/** Host that serves Apollo's real company logos (what `logo_url` contains). */
const APOLLO_LOGO_HOSTS: readonly string[] = ['zenprospect-production.s3.amazonaws.com']

/**
 * Hôtes qui servent les PHOTOS de contact (`contacts.photo_url`).
 *
 * Le relais a été branché sur les photos sans que cette liste existe : tout
 * passait donc par `APOLLO_LOGO_HOSTS`, qui ne contient que le stockage des
 * LOGOS d'entreprise. Résultat, le relais répondait 404 sur CHAQUE photo et
 * l'avatar retombait sur l'initiale — c'est-à-dire, à l'écran, exactement le
 * défaut qu'on croyait corriger : « il manque les photos de profil
 * systématiquement ». Le repli était propre et silencieux, donc invisible.
 *
 * `media.licdn.com` est le CDN d'images du réseau professionnel : le
 * fournisseur d'enrichissement y renvoie la photo de membre telle quelle.
 * `static.licdn.com` est délibérément ABSENT — c'est le CDN d'actifs
 * (silhouette « aucune photo »), et le relayer afficherait un visuel générique
 * que rien ne distinguerait d'une vraie photo. Voir `isPlaceholderPhotoUrl`
 * dans `@bellum/contracts`, dont ceci est le pendant côté serveur.
 *
 * Ces URLs sont SIGNÉES et EXPIRENT chez le fournisseur. Une photo collectée il
 * y a des mois répondra 403 : le relais rend alors 404 et l'avatar affiche
 * l'initiale. C'est le comportement voulu — on n'invente pas un visage.
 */
const CONTACT_PHOTO_HOSTS: readonly string[] = ['media.licdn.com']

/** Tout hôte que le relais s'autorise à contacter sur la branche `src`. */
const RELAYABLE_IMAGE_HOSTS: readonly string[] = [...APOLLO_LOGO_HOSTS, ...CONTACT_PHOTO_HOSTS]

/** Constant origin of the favicon fallback. Never caller-influenced. */
export const GOOGLE_FAVICON_HOST = 'www.google.com'

/**
 * Hosts a pinned upstream is allowed to redirect US to.
 *
 * `www.google.com/s2/favicons` answers **301 → `t3.gstatic.com/faviconV2`**, so
 * refusing every redirect outright silently killed the whole favicon branch: the
 * relay always missed and every avatar fell back to its initials. Following
 * redirects blindly is the classic SSRF hole, so each hop is re-validated
 * against this list — same equality-on-parsed-host rule as the entry point.
 *
 * Google shards the favicon CDN across `t0`-`t3`, hence the bounded pattern
 * rather than a wildcard on `gstatic.com`.
 */
const REDIRECT_HOST_RE = /^t\d\.gstatic\.com$/

/**
 * A registrable-looking domain: dot-separated alphanumeric/hyphen labels, at
 * least two of them, TLD alphabetic. Rejects IP literals (`127.0.0.1`,
 * `169.254.169.254` — all-numeric TLD), `localhost` (no dot), ports, userinfo,
 * paths and anything with a character that would need escaping.
 */
const DOMAIN_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * Registrable domain from a website value ("https://www.vinci.com/fr" →
 * "vinci.com"), or `null`. Mirrors the front-end `websiteDomain` helper and
 * `apps/ia/app/services/assets.py#website_domain`.
 */
function toDomain(website: string | null | undefined): string | null {
  let s = String(website ?? '')
    .trim()
    .toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '')
  s = s.split('/')[0]!.split('?')[0]!
  s = s.replace(/^www\./, '')
  s = s.replace(/^[. ]+|[. ]+$/g, '')
  return DOMAIN_RE.test(s) ? s : null
}

/** `true` only for a plain https URL on the default port, no credentials,
 *  whose host is EXACTLY one of the allow-listed logo hosts. */
function isAllowedLogoUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // An explicit port would let a pinned name be aimed at another service.
  if (url.port !== '') return false
  // Credentials make the effective host hard to read at a glance — refuse.
  if (url.username !== '' || url.password !== '') return false
  return RELAYABLE_IMAGE_HOSTS.includes(url.hostname.toLowerCase())
}

/**
 * `true` when a redirect the upstream just handed us may be followed.
 *
 * Applies the SAME shape checks as the entry point (https, default port, no
 * credentials, host equality) — a 302 must not be a softer door than the front
 * one. That is exactly how a pinned host would otherwise bounce us into a
 * private range.
 */
export function isFollowableRedirect(location: string, from: string): boolean {
  let url: URL
  try {
    url = new URL(location, from)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  if (url.port !== '') return false
  if (url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return REDIRECT_HOST_RE.test(host) || RELAYABLE_IMAGE_HOSTS.includes(host) || host === GOOGLE_FAVICON_HOST
}

export type LogoSourceInput = {
  /** The account's persisted `logo_url`, if any. */
  src?: string | null
  /** The account's website (or bare domain), for the favicon fallback. */
  domain?: string | null
}

/**
 * EVERY upstream URL this request is allowed to fetch, best first — empty when
 * nothing is resolvable (the caller must then 404 — never guess, never invent).
 *
 * Precedence is the same as the client's old inline logic: the real Apollo logo
 * first, then the site's real favicon.
 *
 * Why a LIST and not the single best candidate. This function used to return
 * one URL, so the precedence existed in RESOLUTION but never in EXECUTION: the
 * service fetched the Apollo logo and, if that fetch failed for any reason,
 * gave up — even though the favicon was right there and worked. That is what
 * turned one bad upstream header into "no logo on any enriched account", with
 * the perverse twist that an account with NO `logo_url` rendered fine.
 *
 * Deciding WHICH hosts may be contacted, and in what order, stays here — one
 * pure, exhaustively-tested function, so the anti-SSRF surface is still read in
 * one sitting. TRYING them in order is an execution concern and belongs to
 * {@link LogoService}. Every URL the service ever fetches still comes out of
 * this function; the fallback widens no door.
 */
export function resolveLogoSources({ src, domain }: LogoSourceInput): readonly string[] {
  const candidates: string[] = []
  if (src && isAllowedLogoUrl(src)) candidates.push(src)
  const host = toDomain(domain)
  if (host) candidates.push(`https://${GOOGLE_FAVICON_HOST}/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`)
  return candidates
}
