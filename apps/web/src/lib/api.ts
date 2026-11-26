import type { SessionResponse, SessionUser } from '@bellum/contracts'
import { recordRenewal, renewedSince, withRefreshLock } from '@/features/auth/cross-tab-refresh'
import { isTabDemo } from '@/features/auth/demo-tab'
import { hasLoggedInCookie } from '@/features/auth/logged-in-cookie'
import { readTabIdentity } from '@/features/auth/tab-identity'
import { SESSION_REVOKED_CODE } from '@bellum/contracts'
import { ApiError, extractError, isSessionRevokedResponse, sessionIsDead } from '@/lib/api-error'
import { apiBase, armFallback, isFallbackArmed, isNetworkFailure, isSafeMethod } from '@/lib/api-origin'
import { notifyIfRateLimited } from '@/lib/rate-limit-toast'
import { canReplayAutomatically, withTransientRetry } from '@/lib/transient-retry'

const API_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/** L'en-tête par lequel l'onglet déclare l'identité sous laquelle il travaille.
 *  Doit rester identique à `SESSION_SCOPE_HEADER` côté API. */
const TAB_IDENTITY_HEADER = 'X-Bellum-User'

/** Le chemin réécrit par Vercel vers l'API, sur l'origine de l'application. */
const FALLBACK_BASE = '/api'

export const config = {
  apiUrl: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
}

/**
 * Les en-têtes de la requête, avec l'identité de CET onglet quand elle est
 * connue. Absente (premier chargement, visiteur anonyme, stockage refusé), le
 * serveur reprend son comportement historique — on ne casse aucun appel, on
 * lève juste l'ambiguïté quand on peut. Voir `tab-identity.ts`.
 */
function withTabIdentity(headers?: HeadersInit): HeadersInit {
  const identity = readTabIdentity()
  return { ...config.headers, ...headers, ...(identity ? { [TAB_IDENTITY_HEADER]: identity } : {}) }
}

type ApiFetchArgs<TBody = unknown> = {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: TBody
  headers?: HeadersInit
  signal?: AbortSignal
  /** `text` pour une réponse qui n'est PAS du JSON (un export CSV). Le parser
   *  JSON rendrait une erreur de syntaxe là où l'appelant attend un fichier.
   *  #3803 — `arrayBuffer` pour les OCTETS d'un original (visionneuse). */
  responseType?: 'json' | 'text' | 'arrayBuffer'
  /**
   * #2519 / #2520 — `true` quand le SERVEUR dédoublonne cette écriture lui-même
   * (un démarrage à identifiant déterministe) : elle peut alors se rejouer sur
   * une panne de transport, comme une lecture. Absent = une écriture n'est
   * jamais rejouée sans geste de la personne. Voir `transient-retry.ts`.
   */
  idempotent?: boolean
  /**
   * Recette 14/10 — délai au-delà duquel la requête ÉCHOUE au lieu de rester
   * `pending` pour toujours. Absent = comportement historique (aucun délai) :
   * seuls les appelants qui affichent un chargement l'activent.
   */
  timeoutMs?: number
}

/* -------------------------------------------------------------------- */
/*  Auth-expired hook                                                   */
/* -------------------------------------------------------------------- */

/**
 * Callback invoked when a `/auth/refresh` fails — `SessionManager`
 * registers itself at boot and `clear()`s its state (the router then
 * redirects to `/login` on the next render). We use a hook instead of
 * a direct import to avoid the `api.ts ↔ session-manager.ts` cycle.
 *
 * R15-7 (15/09/2026) : le MOTIF voyage. `session_revoked` = l'appareil a été
 * révoqué (plafond d'appareils, ou déconnecté depuis un autre) — l'écran doit
 * le dire et proposer de se reconnecter, pas rester une coquille vide.
 */
type AuthExpiryReason = 'expired' | typeof SESSION_REVOKED_CODE
let onAuthExpired: ((reason: AuthExpiryReason) => void) | null = null
export function setAuthExpiredHandler(fn: ((reason: AuthExpiryReason) => void) | null) {
  onAuthExpired = fn
}

/* -------------------------------------------------------------------- */
/*  Single-flight refresh — dans l'onglet ET entre onglets              */
/* -------------------------------------------------------------------- */

/** Au-delà, la tentative est abandonnée et comptée « indisponible », jamais
 *  « session morte ». Borne aussi le temps pendant lequel un onglet tient le
 *  verrou partagé. Large : une réponse perdue coûte plus cher qu'une attente. */
const REFRESH_TIMEOUT_MS = 30_000

type RenewedSession = Pick<SessionResponse, 'user' | 'expires_at'>

type RefreshOutcome =
  /** Cookies neufs. `session` vaut `null` quand un AUTRE onglet a renouvelé
   *  pendant l'attente du verrou : aucun appel n'est parti d'ici. */
  | { status: 'renewed'; session: RenewedSession | null; expiresAt: number | null }
  /** 401/403, et aucun onglet n'a renouvelé entre-temps : le jeton ne vaut plus rien.
   *  `revoked` : la 401 portait `session_revoked` (R15-7). */
  | { status: 'dead'; revoked: boolean }
  /** Réseau, délai dépassé, 429, 5xx : on ne sait RIEN de la session. */
  | { status: 'unavailable' }

let inflightRefresh: Promise<RefreshOutcome> | null = null

/** Le corps d'un refresh réussi (les jetons en sont retirés par l'API). */
async function readRenewedSession(res: Response): Promise<RenewedSession | null> {
  try {
    const body = JSON.parse(await res.text()) as { user?: Partial<SessionUser> | null; expires_at?: unknown } | null
    if (!body?.user || typeof body.user.id !== 'string') return null
    return { user: body.user as SessionUser, expires_at: typeof body.expires_at === 'number' ? body.expires_at : null }
  } catch {
    return null
  }
}

async function callRefreshEndpoint(): Promise<RefreshOutcome> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REFRESH_TIMEOUT_MS)
  try {
    // ⚠️ `apiBase()`, pas `config.apiUrl` : ce chemin-ci n'était pas branché
    // sur le repli d'origine, et c'est celui qui aurait déconnecté
    // l'utilisateur en pleine session (trouvé en recette réelle le 25/08/2026).
    // Ici on ne REJOUE rien — on choisit la bonne base avant d'émettre.
    // #3511 — un onglet de démonstration renouvelle par SA porte : le serveur
    // re-date le bail de la salle et rend une session neuve (une démo ne met
    // jamais dehors quelqu'un qui navigue). Les onglets ordinaires gardent
    // `/auth/refresh`, règles de session de la production intactes.
    const demoTab = isTabDemo()
    const res = await fetch(`${apiBase()}${demoTab ? '/demo/session' : '/auth/refresh'}`, {
      method: 'POST',
      ...(demoTab ? { body: JSON.stringify({ renew: true }) } : {}),
      // Rafraîchir SANS dire pour qui rendait la paire d'un autre compte
      // quand le navigateur en portait deux — la façon la plus rapide de
      // faire basculer un onglet de démonstration sur un vrai dossier.
      headers: withTabIdentity(demoTab ? { 'Content-Type': 'application/json' } : undefined),
      credentials: 'include',
      signal: controller.signal,
    })
    // `onAuthExpired` n'est dû qu'à un 401/403. Il l'était sur TOUT statut
    // non-ok : un 429 en pleine analyse renvoyait le commercial sur `/login`.
    if (!res.ok) {
      if (!sessionIsDead(res.status)) return { status: 'unavailable' }
      return { status: 'dead', revoked: await isSessionRevokedResponse(res) }
    }
    const session = await readRenewedSession(res)
    return { status: 'renewed', session, expiresAt: session?.expires_at ?? null }
  } catch {
    // Réseau injoignable ou délai dépassé : on ne sait rien de la session.
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * LA porte du refresh — session tenue 24 h (demande de Louis du 15/09/2026).
 *
 * Le refresh token Supabase est à usage unique : deux refresh concurrents
 * présentent le même jeton, et le second peut prendre `invalid_refresh_token`.
 * Le verrou vivait dans ce module, donc UN PAR ONGLET : plusieurs onglets
 * réveillés ensemble le matin se déconnectaient l'un l'autre. Désormais :
 *  - un appel en vol par onglet (`inflightRefresh`) ;
 *  - un seul onglet à la fois entre onglets (`withRefreshLock`) ;
 *  - l'onglet qui obtient le verrou APRÈS un autre lit la marque de
 *    renouvellement et ne rappelle pas `/auth/refresh` : les cookies du bocal
 *    sont déjà neufs ;
 *  - un refus (401/403) n'est « session morte » qu'après avoir revérifié
 *    qu'aucun onglet n'a renouvelé entre-temps.
 */
export function refreshSessionShared(): Promise<RefreshOutcome> {
  if (!inflightRefresh) {
    const requestedAt = Date.now()
    inflightRefresh = withRefreshLock(async (): Promise<RefreshOutcome> => {
      const renewedWhileWaiting = renewedSince(requestedAt)
      if (renewedWhileWaiting) return { status: 'renewed', session: null, expiresAt: renewedWhileWaiting.expiresAt }

      const outcome = await callRefreshEndpoint()
      if (outcome.status === 'renewed') {
        recordRenewal(outcome.expiresAt, outcome.session?.user.id ?? readTabIdentity())
        return outcome
      }
      if (outcome.status === 'dead') {
        const renewedMeanwhile = renewedSince(requestedAt)
        if (renewedMeanwhile) return { status: 'renewed', session: null, expiresAt: renewedMeanwhile.expiresAt }
      }
      return outcome
    }).finally(() => {
      inflightRefresh = null
    })
  }
  return inflightRefresh
}

/**
 * `true` quand les cookies sont neufs (la requête d'origine peut être rejouée).
 * Ne déclare la session expirée (`onAuthExpired`) que sur un refus réel — jamais
 * sur une panne, un délai ou une coupure.
 */
export async function refreshTokensOnce(): Promise<boolean> {
  const outcome = await refreshSessionShared()
  if (outcome.status === 'dead') onAuthExpired?.(outcome.revoked ? SESSION_REVOKED_CODE : 'expired')
  return outcome.status === 'renewed'
}

/* -------------------------------------------------------------------- */
/*  apiFetch                                                            */
/* -------------------------------------------------------------------- */

/**
 * L'appel, avec le repli d'origine quand la passerelle du client bloque l'API.
 *
 * Voir `api-origin.ts` pour le pourquoi. Ce qui se joue ici est le QUAND :
 *
 *  - le repli n'est tenté que sur un ÉCHEC DE TRANSPORT (`fetch` qui rejette),
 *    jamais sur une réponse du serveur — un 401 résout la promesse ;
 *  - il n'est tenté que sur une méthode SÛRE. Un `fetch` qui échoue ne dit pas
 *    si la requête est PARTIE : rejouer un POST pourrait écrire deux fois ;
 *  - une fois armé, il vaut pour toute la session et plus rien ne paie le
 *    double aller-retour ;
 *  - si le repli échoue AUSSI, on remonte l'erreur d'origine — celle qui décrit
 *    le vrai problème, pas celle du contournement.
 */
async function fetchWithOriginFallback(path: string, method: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${apiBase()}${path}`, init)
  } catch (error) {
    if (isFallbackArmed() || !isNetworkFailure(error) || !isSafeMethod(method)) throw error
    try {
      const res = await fetch(`${FALLBACK_BASE}${path}`, init)
      armFallback()
      return res
    } catch {
      throw error
    }
  }
}

/**
 * Auth travels via HttpOnly cookies (`credentials: 'include'`) — there is no
 * `Authorization` header path on purpose, so tokens never touch JS. On a 401
 * mid-session a single `/auth/refresh` is fired (single-flight) and the request
 * retried once; `/auth/*` and anonymous callers skip the retry.
 */
export async function apiFetch<TResponse, TBody = unknown>(args: ApiFetchArgs<TBody>): Promise<TResponse> {
  const { path, method = 'GET', body, headers, signal: callerSignal, responseType, idempotent = false } = args
  const signal =
    args.timeoutMs === undefined
      ? callerSignal
      : callerSignal
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(args.timeoutMs)])
        : AbortSignal.timeout(args.timeoutMs)
  const init: RequestInit = {
    method,
    headers: withTabIdentity(headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'include',
  }

  // #2519 / #2520 — une lecture (ou un démarrage idempotent) tombée pendant un
  // redéploiement se rejoue dans une borne ; une écriture part UNE fois.
  const send = () => fetchWithOriginFallback(path, method, init)
  const dispatch = canReplayAutomatically(method, idempotent) ? () => withTransientRetry(send, { signal }) : send
  let res = await dispatch()

  // Skip `/auth/*` to avoid an infinite refresh loop (those endpoints 401 too).
  // Session tenue 24 h (15/09/2026) : un onglet qui SAIT pour qui il travaille
  // a une session à défendre, même quand la sentinelle `loggedIn` est illisible
  // (API sur un autre site) — sans quoi son premier 401 du matin était définitif.
  const hasSessionToDefend = hasLoggedInCookie() || readTabIdentity() !== null
  // R15-7 (15/09/2026) — un appareil RÉVOQUÉ ne se rafraîchit pas : le refresh
  // reprendrait la même 401, et l'onglet restait une coquille vide. On le
  // signale (l'écran propose de se reconnecter) et l'erreur remonte telle quelle.
  const revoked = await isSessionRevokedResponse(res)
  if (revoked) onAuthExpired?.(SESSION_REVOKED_CODE)
  const canRetry = res.status === 401 && !revoked && !path.startsWith('/auth/') && hasSessionToDefend
  if (canRetry) {
    const refreshed = await refreshTokensOnce()
    if (refreshed) {
      res = await dispatch()
    }
  }

  if (!res.ok) {
    const { message, code, details } = await extractError(res)
    const err = new ApiError(message, res.status, code, details)
    notifyIfRateLimited(err)
    throw err
  }
  if (res.status === 204) return undefined as TResponse
  // Un export CSV n'est pas du JSON : le parser rendrait une erreur de syntaxe
  // là où l'appelant attend un fichier.
  if (responseType === 'text') return (await res.text()) as TResponse
  if (responseType === 'arrayBuffer') return (await res.arrayBuffer()) as TResponse
  /**
   * #1608, #1640.3 — UN CORPS VIDE SUR UN 200 N'EST PAS UNE PANNE.
   *
   * NestJS sérialise un `null` retourné par un contrôleur en **corps vide,
   * statut 200** — pas en `204`. `res.json()` y jetait donc
   * « Unexpected end of JSON input », et React Query traduisait ça en
   * `isError`. Mesuré en production le 08/09/2026 sur
   * `GET /accounts/:id/market-context`, qui rend `null` pour un compte non
   * couvert : les deux cartes de mémoire marché du dossier écrivaient
   * « Mémoire marché indisponible » — une PANNE — là où la réponse honnête
   * était « Non mesuré ». Deux comptes sur six étaient dans ce cas.
   *
   * Le plus cher n'était pas le libellé : les deux composants portent une
   * branche `data === null → « Non mesuré »`, écrite exprès et **inatteignable**
   * — `null` n'arrivait jamais, il devenait une erreur en chemin.
   *
   * ⚠️ On lit le corps en TEXTE puis on parse, plutôt que d'ajouter `res.json()`
   * dans un `try` : un `catch` autour du parse avalerait aussi un JSON
   * TRONQUÉ par le réseau, et ferait passer une réponse mutilée pour une
   * absence de donnée. Seul un corps de longueur ZÉRO est une absence ; tout
   * le reste se parse, et jette s'il est mal formé (témoin dans la garde).
   */
  const text = await res.text()
  if (text.length === 0) return undefined as TResponse
  return JSON.parse(text) as TResponse
}

// `ApiError` + `extractError` live in `./api-error` so the pure parsing can be
// unit-tested (the test suite globally mocks `@/lib/api`). Re-exported here so
// every existing `import { ApiError } from '@/lib/api'` keeps working.
export { ApiError, extractError, sessionIsDead }
