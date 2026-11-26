/**
 * #2112.23-25 — LE RETOUR DES RÉGLAGES RAMÈNE À LA PAGE D'ORIGINE.
 *
 * `SettingsNavbarBody` pointait `to="/dashboard"` EN DUR (#2112.23, #2112.25) :
 * quitter les Réglages depuis Comptes, Chat ou Missions ramenait toujours au
 * Tableau de bord, quelle que soit la page quittée pour y entrer. Ce module
 * retient la DERNIÈRE page visitée AVANT d'entrer dans `/settings*` — jamais
 * une navigation INTERNE aux Réglages, qui écraserait l'origine par une
 * sous-page des Réglages elle-même — pour la durée de l'onglet
 * (`sessionStorage` : un rechargement en cours de visite garde le fil, un
 * nouvel onglet repart neutre).
 *
 * Origine inconnue (arrivée directe sur `/settings`, nouvel onglet, ou
 * stockage indisponible) → l'appelant (`SettingsNavbarBody`) retombe sur la
 * vue de démarrage PRÉFÉRÉE de l'utilisateur (#2112.24), jamais sur
 * `/dashboard` en dur (#2112.25).
 */
import { SETTINGS_SECTIONS } from '@/components/sidebar/items.settings'

const STORAGE_KEY = 'bellum-return-to-app'
const SCROLL_KEY = 'bellum-return-to-app-scroll'
const SETTINGS_PREFIX = '/settings'

/**
 * #2145.19 — LE SCROLL QUITTÉ, DERNIÈRE PIÈCE DU RETOUR.
 *
 * `href` (ci-dessus) porte déjà la route, ses filtres et son objet — jamais
 * la position de défilement, propriété du CONTENEUR qui défile réellement
 * (`CustomerPageContent.tsx`), pas de l'URL. `trackContentScrollTop` est
 * appelé en continu (à chaque `onScroll` de ce conteneur) pour qu'une valeur
 * FRAÎCHE soit toujours prête au moment d'ENTRER dans les Réglages — le
 * conteneur de la page quittée est démonté avant que `rememberReturnToApp`
 * ne s'exécute, donc lire le DOM à cet instant serait déjà trop tard.
 */
let lastKnownScrollTop = 0

export function trackContentScrollTop(value: number): void {
  lastKnownScrollTop = value
}

/**
 * #4534.1-3 — UNE page des Paramètres = `/settings*` OU une entrée du menu des Paramètres (`/integrations`,
 * `/billing`…). La liste est DÉRIVÉE de `SETTINGS_SECTIONS` (un seul endroit, GA-26) : une entrée ajoutée au
 * menu est reconnue sans toucher ici. Les adresses retirées du menu (`/settings/import`, `/settings/vivier-export`)
 * restent sous `/settings` et donc reconnues.
 */
const SETTINGS_MENU_PATHS: readonly string[] = SETTINGS_SECTIONS.flatMap(section => section.items).map(item =>
  String(item.to ?? ''),
)

export function isSettingsPath(pathname: string): boolean {
  if (pathname === SETTINGS_PREFIX || pathname.startsWith(`${SETTINGS_PREFIX}/`)) return true
  return SETTINGS_MENU_PATHS.some(to => to !== '' && (pathname === to || pathname.startsWith(`${to}/`)))
}

/**
 * Appelé à CHAQUE navigation résolue (`router.tsx`, `onResolved`).
 *
 * N'écrit que sur l'ENTRÉE dans les Réglages depuis l'EXTÉRIEUR : `from` nul
 * (chargement direct — rien à retenir) ou déjà dans les Réglages (une
 * sous-navigation ne doit jamais écraser l'origine déjà retenue) sortent tous
 * les deux sans effet.
 */
export function rememberReturnToApp(
  from: { pathname: string; href: string } | null | undefined,
  toPathname: string,
): void {
  if (!isSettingsPath(toPathname)) return
  if (!from || isSettingsPath(from.pathname)) return
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, from.href)
    sessionStorage.setItem(SCROLL_KEY, String(lastKnownScrollTop))
  } catch {
    // Stockage indisponible (navigation privée, quota) : l'origine restera
    // simplement inconnue — jamais une exception qui casse la navigation.
  }
}

/**
 * La page à laquelle « Retour à l'app » ramène, ou `null` — jamais un défaut
 * deviné ici : c'est à l'appelant de retomber sur SA propre règle de secours
 * (#2112.24, la vue de démarrage préférée).
 */
export function readReturnToApp(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * Le défilement retenu, restitué UNE SEULE fois — et seulement quand
 * `currentHref` est EXACTEMENT la page d'origine (`STORAGE_KEY`). Une autre
 * page qui arriverait à se monter avant l'origine (ou une visite non liée à
 * un retour depuis les Réglages qui atterrirait sur la même URL par
 * coïncidence) ne consomme ni n'efface rien : la valeur reste disponible pour
 * la VRAIE page d'origine, quel que soit l'ordre de montage.
 *
 * `null` : origine différente, ou stockage indisponible. `0` (jamais `null`)
 * : origine confirmée mais aucun défilement connu (page jamais défilée) —
 * distinguer les deux évite qu'un appelant retombe sur un défilement DEVINÉ.
 */
export function consumeReturnToAppScrollIfMatching(currentHref: string): number | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const origin = sessionStorage.getItem(STORAGE_KEY)
    if (origin !== currentHref) return null
    const raw = sessionStorage.getItem(SCROLL_KEY)
    sessionStorage.removeItem(SCROLL_KEY)
    if (raw === null) return 0
    const value = Number(raw)
    return Number.isFinite(value) ? value : 0
  } catch {
    return null
  }
}
