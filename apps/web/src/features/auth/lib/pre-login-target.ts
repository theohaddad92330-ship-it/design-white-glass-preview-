/**
 * #2145.7 — UN LIEN PARTAGÉ OU DE NOTIFICATION, OUVERT SANS SESSION, RAMÈNE
 * SUR L'OBJET EXACT — PAS SUR LA PAGE D'ACCUEIL.
 *
 * Avant ce lot, un visiteur sans session qui ouvrait un lien profond
 * (`/accounts/<id>`, un lien de notification par e-mail) était renvoyé vers
 * `/login` sans que la page demandée soit retenue nulle part (`git grep`
 * vide) : après connexion, `useRedirectAfterAuth` calculait toujours la
 * destination GÉNÉRIQUE (`resolveLandingFrom`), jamais l'objet visé au
 * départ — la même famille de défaut que #2112.23 (« Retour à l'app » vers
 * `/dashboard` en dur), côté connexion plutôt que côté Réglages.
 *
 * Même mécanique que `return-to-app.ts` : une valeur de SESSION, jamais un
 * identifiant durable ni une redirection ouverte (`rememberPreLoginTarget`
 * n'écrit que ce que le NAVIGATEUR demandait déjà). `useRedirectAfterAuth` la
 * consomme au même endroit et selon le même motif que
 * `consumePendingInvitation`/`consumeApiReturnTo` — c'est LUI qui décide si
 * la cible gagne sur la destination normale, jamais ce module.
 */
import { isTabDemo } from '../demo-tab'

const STORAGE_KEY = 'bellum-pre-login-target'

/**
 * 29/09/2026 — SORTIE VOLONTAIRE : « Quitter » / « Déconnexion » vide la session,
 * ce qui fait rendre `CustomerPageContent` sans utilisateur, qui retenait alors
 * la page COURANTE (`/accounts/<compte de démo>`) comme cible d'après-connexion :
 * la connexion suivante, sur le compte réel, atterrissait sur « Compte
 * introuvable ». Tant que la sortie est en cours, rien n'est retenu.
 */
let exiting = false

const LOGIN_FLOW_PREFIXES = ['/login', '/signup', '/welcome', '/onboarding', '/auth', '/verify-email']

function isLoginFlowPath(pathname: string): boolean {
  return LOGIN_FLOW_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Appelé juste avant un renvoi vers `/login` (`CustomerPageContent`,
 *  `SettingsPage`) — jamais depuis le parcours de connexion lui-même, qui
 *  écraserait la cible réelle par sa propre page. */
export function rememberPreLoginTarget(href: string, pathname: string): void {
  if (isLoginFlowPath(pathname)) return
  // Une page vue en DÉMONSTRATION n'existe pas dans le compte réel : jamais retenue.
  if (exiting || isTabDemo()) return
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, href)
  } catch {
    // Stockage indisponible (navigation privée, quota) : la cible restera
    // simplement inconnue — jamais une exception qui casse la redirection.
  }
}

/** La page à laquelle revenir après connexion, consommée UNE seule fois — ou
 *  `null` si aucun lien profond n'a été ouvert sans session. */
export function consumePreLoginTarget(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const value = sessionStorage.getItem(STORAGE_KEY)
    sessionStorage.removeItem(STORAGE_KEY)
    return value
  } catch {
    return null
  }
}

/** Sortie volontaire : oublie la cible retenue et empêche d'en retenir une nouvelle. */
export function beginVoluntaryExit(): void {
  exiting = true
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Stockage indisponible : rien à oublier.
  }
}

/** La sortie est finie (on est sur /login) ou une nouvelle session démarre. */
export function endVoluntaryExit(): void {
  exiting = false
}
