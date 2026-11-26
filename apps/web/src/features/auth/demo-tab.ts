/**
 * Cet onglet travaille-t-il pour la DÉMONSTRATION ?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ EN PRODUCTION LE 27/09/2026
 * ─────────────────────────────────────────────────────────────────────────
 * Un visiteur entré par `/demo/acces` (bannière « MODE DÉMO », dossiers
 * fictifs) perdait sa session — un 401 ordinaire, un appareil révoqué, un
 * jeton expiré — et atterrissait sur `/login`. La bannière disparaissait, et
 * l'écran qui suit exige un compte et un mot de passe que ce visiteur n'a
 * jamais eus : un mur, pas une reprise.
 *
 * `tab-identity.ts` ne peut pas porter cette information : `forgetTabIdentity`
 * est appelé par `SessionManager.clear()`, qui tourne PRÉCISÉMENT sur ce
 * 401 — au moment où `RedirectTo` doit encore savoir que cet onglet était en
 * démonstration, l'identité a déjà été oubliée. Ce marqueur est donc SÉPARÉ,
 * et survit à un `clear()` involontaire ; seule une déconnexion EXPLICITE
 * (bouton « Quitter » du bandeau démo, ou une vraie connexion) l'efface.
 *
 * `sessionStorage`, pour la même raison qu'un `tab-identity.ts` : propre à
 * l'onglet (jamais `localStorage`, que les onglets partagent), et il survit
 * au rechargement complet qui suit une entrée en démo.
 *
 * Ce n'est pas un secret et ça n'accorde rien : ça ne fait QUE choisir, une
 * fois la session tombée, où renvoyer la personne.
 */
const TAB_DEMO_KEY = 'bellum.tab.demo'

/** #4608.3 — l'onglet entre ou sort de la démo SANS recharger : ce que l'écran affiche d'une identité (le bandeau
 *  d'incarnation) se relit à cet événement au lieu de rester figé sur son premier rendu. */
export const TAB_DEMO_CHANGED_EVENT = 'bellum:tab-demo-changed'

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TAB_DEMO_CHANGED_EVENT))
}

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    // Navigation privée verrouillée, stockage refusé : comme pour
    // `tab-identity.ts`, on retombe sur le comportement d'avant (aucune
    // indication), jamais sur une erreur.
    return null
  }
}

export function markTabAsDemo(): void {
  try {
    storage()?.setItem(TAB_DEMO_KEY, '1')
    announce()
  } catch {
    // Quota plein ou stockage refusé — sans marqueur, une session perdue
    // renverra vers `/login` au lieu de `/demo/acces` : dégradé, jamais cassé.
  }
}

export function isTabDemo(): boolean {
  try {
    return storage()?.getItem(TAB_DEMO_KEY) === '1'
  } catch {
    return false
  }
}

export function forgetTabDemoFlag(): void {
  try {
    storage()?.removeItem(TAB_DEMO_KEY)
    announce()
  } catch {
    // idem
  }
}
