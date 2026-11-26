/**
 * #2435.11 — L'ÉLIGIBILITÉ À L'INVITE D'INSTALLATION, MÉMORISÉE.
 *
 * Un simple booléen dans `localStorage` : une fois qu'un premier succès a été
 * observé (`ChatMain` le calcule sur le fil réel), l'invite reste proposable
 * même sur un fil VIERGE ouvert ensuite — sans quoi ouvrir une nouvelle
 * conversation ferait « oublier » que l'utilisateur a déjà eu une réponse
 * utile, et l'invite se remettrait à attendre un second succès pour rien.
 *
 * Best-effort : une navigation privée qui refuse `localStorage` reste
 * silencieuse (l'invite ne se propose alors qu'à l'intérieur d'une même
 * session, jamais une erreur affichée pour ça).
 */
const STORAGE_KEY = 'bellum:pwa-install-eligible'

export function isInstallEligible(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markInstallEligible(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // best-effort, voir le docblock ci-dessus.
  }
}
