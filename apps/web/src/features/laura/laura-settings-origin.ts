/**
 * #2925 (#2145.20/.22) — LE REPLI DE SECOURS DES RÉGLAGES, QUAND L'ORIGINE
 * EST INCONNUE.
 *
 * `return-to-app.ts` retient déjà la page exacte d'où on est entré dans les
 * Réglages (#2112.23-25) — le cas courant, et le plus précis. Ce module ne
 * couvre que ce qu'il ne peut PAS savoir : un nouvel onglet, un stockage
 * indisponible, ou un chargement direct sur `/settings`. Dans ce cas-là
 * seulement, savoir que le clic est parti d'une conversation avec Laura
 * (`ContextDisclosure` → « Connecter mon CRM/ma messagerie ») change le repli.
 *
 * ⚠️ Laura NE S'OUVRE JAMAIS SEULE (`LauraDock.tsx` : « ouvrir Laura est
 * toujours un geste »). Ce signal ne rouvre donc RIEN — il ramène vers `/chat`,
 * une PAGE normale dont le contenu EST la conversation, jamais la bulle.
 *
 * Posé au clic, consommé UNE fois — à la durée de vie d'une visite des
 * Réglages, jamais rejoué au fil de ses sous-pages.
 */
const STORAGE_KEY = 'bellum-settings-opened-from-laura'

export function markSettingsOpenedFromLaura(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Stockage indisponible : le repli retombera simplement sur le niveau
    // suivant — jamais une exception qui casse le clic.
  }
}

/** Lit ET efface — un clic plus ancien, jamais consommé, ne doit pas rejaillir
 *  sur une visite des Réglages sans rapport. */
export function consumeSettingsOpenedFromLaura(): boolean {
  if (typeof sessionStorage === 'undefined') return false
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    return value === '1'
  } catch {
    return false
  }
}

/**
 * Le repli quand `readReturnToApp()` ne connaît pas l'origine.
 *
 * Deux niveaux, pas trois : le troisième niveau que l'épopée nomme
 * (« Aujourd'hui ») écraserait silencieusement la préférence de démarrage de
 * l'utilisateur (#2112.24, déjà tranchée) pour TOUTE visite sans origine
 * connue — pas seulement celles qui viennent de Laura. `preferredRoute` porte
 * déjà ce dernier recours (`DEFAULT_VIEW_ROUTE[preferences.defaultView]`,
 * inchangé) ; ce résolveur n'ajoute qu'un niveau AU-DESSUS de lui.
 */
export function resolveSettingsFallbackRoute(openedFromLaura: boolean, preferredRoute: string): string {
  return openedFromLaura ? '/chat' : preferredRoute
}
