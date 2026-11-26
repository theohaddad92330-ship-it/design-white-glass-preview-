const SHOWN_KEY_PREFIX = 'bellum:first-success-guide-shown:'

/**
 * #2214.23 — LE GUIDE « PREMIER SUCCÈS BELLUMAI » NE SE DÉCLENCHE QU'UNE FOIS.
 *
 * Un déclenchement automatique qui se répéterait à chaque arrivée sur `/chat`
 * serait exactement le pop-up automatique que #2214.5 refuse. Le plus simple
 * qui tienne, même patron que l’ancien `connector-hint-seen` (#1946.12, retiré par #4513) : un
 * horodatage dans `localStorage`, PAR COMPTE (l'identifiant de session, pas
 * un e-mail ni rien qui identifie la personne dans une trace produit).
 *
 * Un `localStorage` bloqué (navigation privée, quota) dégrade en silence :
 * le guide se redéclenche au pire à chaque visite, jamais une exception
 * remontée à l'écran.
 */
export function recordFirstSuccessGuideShown(userId: string, now: number = Date.now()): void {
  try {
    window.localStorage.setItem(SHOWN_KEY_PREFIX + userId, String(now))
  } catch {
    // Mode privé / quota : la mesure ne survit pas à cet appel.
  }
}

/** Ce compte a-t-il déjà vu le guide « Premier succès BellumAI » ? */
export function wasFirstSuccessGuideShown(userId: string): boolean {
  try {
    return window.localStorage.getItem(SHOWN_KEY_PREFIX + userId) !== null
  } catch {
    return false
  }
}
