import { readTabIdentity } from './tab-identity'

/**
 * #4608 — la session RÉELLE d'avant la démonstration, gardée pour la sortie.
 *
 * Ouvrir `/demo` depuis un navigateur connecté faisait de l'onglet l'onglet de
 * la démonstration ; « Quitter » fermait alors TOUTE session de l'appareil puis
 * renvoyait sur `/login`. Les cookies de la session réelle survivent désormais
 * (le serveur ne les purge plus, voir `KeepOtherSessions` côté API) : il ne
 * manque que de quoi retrouver QUI cet onglet était, et OÙ il en était.
 *
 * `sessionStorage` : propre à l'onglet, comme `tab-identity.ts` — c'est un
 * identifiant public qui désigne un cookie déjà détenu, il n'accorde rien.
 */
const PRE_DEMO_KEY = 'bellum.tab.preDemo'

type PreDemo = { userId: string; path: string }

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

/** Un chemin interne uniquement : jamais une URL absolue ni `//hôte`, jamais la démo elle-même. */
function internalPath(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/demo') || raw.startsWith('/login')) return '/'
  return raw
}

function referrerPath(): string {
  try {
    if (typeof document === 'undefined' || !document.referrer) return '/'
    const url = new URL(document.referrer)
    return url.origin === window.location.origin ? internalPath(url.pathname + url.search) : '/'
  } catch {
    return '/'
  }
}

/** À l'entrée en démonstration, AVANT que l'onglet ne prenne l'identité de la salle. */
export function rememberPreDemoIdentity(userId: string | null | undefined = readTabIdentity()): void {
  if (!userId) return
  try {
    storage()?.setItem(PRE_DEMO_KEY, JSON.stringify({ userId, path: referrerPath() } satisfies PreDemo))
  } catch {
    // Stockage refusé : la sortie retombera sur `/login`, comme avant.
  }
}

/** À la sortie : l'identité d'avant et l'écran d'où l'on venait, une seule fois. */
export function takePreDemoIdentity(): PreDemo | null {
  try {
    const raw = storage()?.getItem(PRE_DEMO_KEY)
    storage()?.removeItem(PRE_DEMO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PreDemo>
    if (typeof parsed.userId !== 'string' || !parsed.userId) return null
    return { userId: parsed.userId, path: internalPath(typeof parsed.path === 'string' ? parsed.path : '/') }
  } catch {
    return null
  }
}
