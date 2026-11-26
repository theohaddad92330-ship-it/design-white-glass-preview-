/**
 * L'identité sous laquelle CET ONGLET travaille.
 *
 * Les cookies d'authentification sont nommés par utilisateur (`session:{id}`),
 * donc un navigateur peut en porter plusieurs — c'est ce qui permet d'ouvrir la
 * démonstration à côté d'un vrai compte. Mais les cookies sont partagés par tous
 * les onglets d'une origine : rien, dans une requête, ne disait laquelle des
 * identités présentes envoyait l'appel, et le serveur prenait le premier cookie
 * venu. Les deux onglets finissaient donc sur la même session, tirée au sort
 * (DEMO-01, audit terrain du 17/08).
 *
 * `sessionStorage` est LE bon rangement ici, et c'est le seul : il est propre à
 * l'onglet (contrairement à `localStorage` et aux cookies) et il survit à un
 * rechargement de page dans ce même onglet — ce dont la démonstration a besoin,
 * puisqu'elle se termine par un chargement complet. Un onglet ouvert en
 * duplication hérite de la valeur, ce qui est le comportement voulu : c'est bien
 * la même session qu'on duplique.
 *
 * Ce n'est PAS un secret et ça n'accorde rien : c'est un identifiant public qui
 * désigne lequel des cookies déjà détenus par ce navigateur doit être lu. Le
 * jeton désigné est vérifié comme avant, et une identité dont ce navigateur n'a
 * pas le cookie ne donne aucun accès.
 */
const TAB_IDENTITY_KEY = 'bellum.tab.user'

/** Un identifiant Supabase est un UUID — le serveur écarte tout le reste, on
 *  n'envoie donc que ce qui a une chance d'être lu. */
const USER_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    // Navigation privée verrouillée, stockage refusé : on retombe simplement sur
    // le comportement d'avant (aucune indication envoyée), jamais sur une erreur.
    return null
  }
}

export function readTabIdentity(): string | null {
  const value = storage()?.getItem(TAB_IDENTITY_KEY) ?? null
  return value && USER_ID_SHAPE.test(value) ? value : null
}

export function rememberTabIdentity(userId: string | null | undefined): void {
  if (!userId || !USER_ID_SHAPE.test(userId)) return
  try {
    storage()?.setItem(TAB_IDENTITY_KEY, userId)
  } catch {
    // Quota plein ou stockage refusé — sans indication, le serveur reprend son
    // comportement historique. Aucune raison de faire échouer une connexion.
  }
}

export function forgetTabIdentity(): void {
  try {
    storage()?.removeItem(TAB_IDENTITY_KEY)
  } catch {
    // idem
  }
}
