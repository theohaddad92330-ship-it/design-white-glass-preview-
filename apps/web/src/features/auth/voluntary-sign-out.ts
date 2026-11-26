/**
 * Cet onglet vient-il de se déconnecter VOLONTAIREMENT (« Déconnexion »,
 * « Quitter la démonstration ») ?
 *
 * Constat production du 29/09/2026 : juste après une déconnexion volontaire,
 * l'ancien cookie de session reprenait une 401 `session_revoked` sur
 * `/demo/acces`, et l'avis « Tu as été déconnecté de cet appareil » — fait pour
 * la révocation À DISTANCE — bloquait le formulaire d'entrée en démo, y compris
 * après un rechargement. Le repère vit en `sessionStorage` (propre à l'onglet,
 * survit au rechargement) et tombe à la prochaine session appliquée.
 */
const KEY = 'bellum.tab.signed-out'

export function markVoluntarySignOut(): void {
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {
    // Stockage refusé : on retombe sur le comportement d'avant, sans casser.
  }
}

export function hasVoluntarySignOut(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function forgetVoluntarySignOut(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // idem
  }
}
