/**
 * La porte du consentement aux traceurs — UNE seule, pour les trois apps.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Mesuré le 28/08/2026, EN PRODUCTION : la bannière de consentement du site
 * enregistrait un choix que personne ne lisait. `getCookieConsent()` n'avait
 * aucun appelant hors de son propre dossier, pendant que la page publique
 * `/cookies` promettait, mot pour mot, que les cookies analytiques « sont
 * soumis à votre consentement préalable ». Quatre traceurs se chargeaient sans
 * condition — trois `<Analytics />` (Vercel) et deux scripts Plausible.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN COOKIE, ET PAS LE `localStorage` D'ORIGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * `localStorage` est cloisonné par ORIGINE (schéma + hôte + port). Le site est
 * servi depuis `https://bellum-ai.com` et l'application depuis
 * `https://app.bellum-ai.com` : deux origines, donc DEUX stockages. Un visiteur
 * qui refuse sur le site voyait son refus rester sur le site — l'application ne
 * pouvait pas le lire, même en important cette fonction.
 *
 * Un cookie, lui, est cloisonné par DOMAINE et ignore le port : posé sur
 * `.bellum-ai.com`, il est lu par le site ET par l'application. C'est le seul
 * mécanisme du navigateur qui traverse les sous-domaines sans serveur.
 *
 * Bénéfice secondaire : les pages publiques promettent déjà que « vos choix
 * sont conservés pendant une durée de six mois ». Un `localStorage` n'expire
 * jamais ; un cookie porte sa durée. La promesse devient vraie.
 *
 * ⚠️ Ce cookie est STRICTEMENT NÉCESSAIRE au sens des pages publiques : il ne
 * mesure rien, il porte la réponse à la question. C'est déjà ce que les quatre
 * langues de `/cookies` annoncent (« le cookie de mémorisation de vos choix »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne devine pas. Pas de cookie = pas de choix = `null`, et `null` ne vaut
 * ni oui ni non : on ne charge rien, et on n'écrit rien non plus — mémoriser un
 * refus que personne n'a exprimé serait inventer une réponse.
 */

export type CookieConsent = {
  necessary: true
  analytics: boolean
}

/** Le nom du cookie qui porte la réponse. */
export const CONSENT_COOKIE_NAME = 'bellum_cookie_consent'

/**
 * Six mois (183 jours). Ce n'est pas un chiffre libre : c'est la durée que les
 * quatre langues de `/cookies` annoncent déjà au visiteur.
 */
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 183

/**
 * L'ancienne clé `localStorage` de la bannière du site, conservée le temps que
 * les visiteurs qui ont DÉJÀ répondu ne soient pas re-sollicités.
 * Voir `migrateLegacyCookieConsent`.
 */
export const LEGACY_CONSENT_STORAGE_KEY = 'bellum.cookie-consent'

export const ACCEPT_ALL_CONSENT: CookieConsent = { necessary: true, analytics: true }
export const REJECT_ALL_CONSENT: CookieConsent = { necessary: true, analytics: false }

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Le domaine sur lequel poser le cookie.
 *
 * `app.bellum-ai.com` → `.bellum-ai.com`, pour que le site et l'application
 * partagent la même réponse. Un hôte à deux étiquettes (`bellum-ai.com`) ou
 * sans point (`localhost`, une IP) reste en portée d'hôte : y forcer un
 * `Domain=` ne gagnerait rien et, sur un suffixe public, le navigateur
 * rejetterait le cookie en silence.
 *
 * ⚠️ On ne fait PAS de calcul de suffixe public ici (`.co.uk` & co.) : la
 * portée choisie est ensuite VÉRIFIÉE en relisant le cookie, et l'écriture
 * retombe en portée d'hôte si le navigateur l'a refusée. Une heuristique qui se
 * relit ne peut pas perdre un choix ; une heuristique qui se croit, si.
 */
function shareableDomain(hostname: string): string | null {
  const labels = hostname.split('.')
  if (labels.length < 3) return null
  if (labels.every(label => /^\d+$/.test(label))) return null
  return `.${labels.slice(1).join('.')}`
}

function readRawCookie(): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split(';')) {
    const [name, ...rest] = part.split('=')
    if (name?.trim() !== CONSENT_COOKIE_NAME) continue
    return rest.join('=')
  }
  return null
}

function writeCookie(value: string): void {
  const attributes = [`path=/`, `max-age=${CONSENT_MAX_AGE_SECONDS}`, 'samesite=lax']
  if (window.location.protocol === 'https:') attributes.push('secure')

  const domain = shareableDomain(window.location.hostname)
  if (domain) {
    document.cookie = `${CONSENT_COOKIE_NAME}=${value};${attributes.join(';')};domain=${domain}`
    // Vérification, pas supposition : si le navigateur a rejeté la portée
    // (suffixe public), le cookie n'est pas là et le choix serait perdu.
    if (readRawCookie() !== null) return
  }
  document.cookie = `${CONSENT_COOKIE_NAME}=${value};${attributes.join(';')}`
}

/**
 * Une valeur venue du disque n'est pas une valeur de confiance : on n'accepte
 * QUE la forme exacte. Tout le reste vaut « pas de choix » — jamais « oui ».
 */
function parseConsent(raw: string | null): CookieConsent | null {
  if (raw === null || raw === '') return null
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    if (typeof parsed !== 'object' || parsed === null) return null
    const analytics = (parsed as { analytics?: unknown }).analytics
    if (typeof analytics !== 'boolean') return null
    return { necessary: true, analytics }
  } catch {
    return null
  }
}

/** Le choix exprimé, ou `null` si la question n'a pas encore de réponse. */
export function getCookieConsent(): CookieConsent | null {
  return parseConsent(readRawCookie())
}

/**
 * La seule question que les traceurs ont le droit de poser.
 *
 * Volontairement stricte : `=== true`. Ni `null`, ni une valeur mal formée, ni
 * une absence ne se laissent lire comme un accord.
 */
export function isAnalyticsAllowed(): boolean {
  return getCookieConsent()?.analytics === true
}

/** Enregistre le choix du visiteur et réveille tout ce qui en dépend. */
export function saveCookieConsent(consent: CookieConsent): void {
  if (typeof document === 'undefined') return
  writeCookie(encodeURIComponent(JSON.stringify({ necessary: true, analytics: consent.analytics })))
  for (const listener of listeners) listener()
}

/**
 * S'abonner aux changements de choix — c'est ce qui permet à un RETRAIT de
 * débrancher les traceurs sans attendre un rechargement de page.
 *
 * `storage` couvre le cas « le visiteur change d'avis dans un autre onglet »,
 * qui reste utile tant que l'ancien stockage cohabite.
 */
export function subscribeCookieConsent(listener: Listener): () => void {
  listeners.add(listener)
  if (typeof window !== 'undefined') window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', listener)
  }
}

/**
 * Reprend le choix déjà exprimé dans l'ancien `localStorage` de la bannière.
 *
 * Sans elle, le passage au cookie redemanderait son avis à tout le monde — y
 * compris à ceux qui ont REFUSÉ, ce qui est exactement le geste qu'un bandeau
 * de consentement ne doit pas faire. On ne réinvente rien : on relit la réponse
 * que la personne a donnée, on la réécrit à l'endroit qui fait désormais foi, et
 * on retire l'ancienne pour qu'il n'en reste qu'une (GA-26).
 *
 * Un choix déjà porté par le cookie gagne toujours : il est plus récent.
 */
export function migrateLegacyCookieConsent(): void {
  if (typeof window === 'undefined') return
  if (getCookieConsent() !== null) return
  let stored: string | null = null
  try {
    stored = window.localStorage.getItem(LEGACY_CONSENT_STORAGE_KEY)
  } catch {
    return
  }
  const legacy = parseConsent(stored)
  if (legacy === null) return
  saveCookieConsent(legacy)
  try {
    window.localStorage.removeItem(LEGACY_CONSENT_STORAGE_KEY)
  } catch {
    // Un stockage verrouillé (navigation privée) n'empêche pas le cookie
    // d'avoir été écrit : le choix est repris, c'est ce qui compte.
  }
}
