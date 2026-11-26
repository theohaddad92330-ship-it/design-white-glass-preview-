import { readTabIdentity } from './tab-identity'

/**
 * Session tenue 24 h (demande de Louis du 15/09/2026) — UN SEUL `/auth/refresh`
 * entre onglets.
 *
 * Le refresh token Supabase est à usage unique. Le verrou « single-flight » de
 * `api.ts` vivait dans le MODULE, donc un par onglet : plusieurs onglets de
 * l'application laissés ouverts la nuit se réveillaient ensemble, envoyaient le
 * même jeton, et l'un d'eux pouvait prendre `invalid_refresh_token` → retour à
 * la connexion.
 *
 * Deux pièces, et AUCUN jeton dans l'une ou l'autre (les jetons restent dans
 * des cookies HttpOnly, hors de portée du JS) :
 *  - un VERROU entre onglets : `navigator.locks`, ou à défaut un bail écrit dans
 *    `localStorage` (navigateurs sans Web Locks) ;
 *  - une MARQUE de renouvellement (quand, pour qui, jusqu'à quand) : l'onglet
 *    qui obtient le verrou après un autre la lit, et ne rappelle pas
 *    `/auth/refresh` si le bocal de cookies vient d'être renouvelé.
 */

const LOCK_NAME = 'bellum:auth:refresh'
const RENEWAL_MARK_KEY = 'bellum.auth.renewed'
const LEASE_KEY = 'bellum.auth.refresh-lease'
/** Plus long qu'une tentative de refresh (délai d'abandon de 30 s dans `api.ts`) :
 *  un bail ne doit pas expirer pendant que son détenteur attend encore la réponse. */
const LEASE_MS = 35_000
const LEASE_POLL_MS = 200
/** Tolérance d'horloge entre onglets d'une même machine (dérive NTP normale) :
 *  au-delà, un `at` dans le futur est le signe d'une marque FORGÉE — un script
 *  de même origine peut écrire n'importe quoi dans `localStorage` — pas d'une
 *  horloge désynchronisée. Sans ce plafond, `renewedSince` ne rappellerait
 *  plus jamais `/auth/refresh` : `mark.at >= since` resterait vrai pour
 *  toujours (revue sécurité, 15/09/2026). */
const CLOCK_SKEW_TOLERANCE_MS = 5_000
/** Durée de vie maximale d'un access Supabase (voir `expires_in: 3600` dans
 *  `apps/api/src/supabase/supabase.service.spec.ts`). Une marque ne peut pas
 *  prétendre à une échéance plus lointaine que `at` + cette durée — sinon un
 *  `expiresAt` forgé ferait croire à une session vivante indéfiniment. */
const MAX_ACCESS_TOKEN_LIFETIME_MS = 3_600_000

type RenewalMark = { at: number; expiresAt: number | null; userId: string | null }
type Lease = { owner: string; until: number }

function sharedStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw ? (JSON.parse(raw) as unknown) : null
  } catch {
    return null
  }
}

function readRenewalMark(): RenewalMark | null {
  const storage = sharedStorage()
  const value = storage ? readJson(storage, RENEWAL_MARK_KEY) : null
  if (!value || typeof value !== 'object') return null
  const { at, expiresAt, userId } = value as Partial<Record<keyof RenewalMark, unknown>>
  if (typeof at !== 'number') return null
  // Marque forgée dans le futur (au-delà de la dérive d'horloge normale) : on
  // ne lui fait pas confiance du tout, plutôt que de risquer de ne trouver
  // qu'un correctif partiel.
  if (at > Date.now() + CLOCK_SKEW_TOLERANCE_MS) return null
  return {
    at,
    expiresAt: typeof expiresAt === 'number' ? Math.min(expiresAt, at + MAX_ACCESS_TOKEN_LIFETIME_MS) : null,
    userId: typeof userId === 'string' ? userId : null,
  }
}

/** La marque vaut-elle pour CET onglet ? Sans identité connue pour cet onglet
 *  (pas de démonstration ouverte à côté), on ne peut rien exclure : elle
 *  compte. Dès que l'onglet CONNAÎT son identité, une marque sans `userId` ou
 *  d'un autre utilisateur ne dit rien de SES cookies à lui — elle ne compte
 *  plus (avant le 15/09/2026, l'absence de `userId` passait). */
function concernsThisTab(mark: RenewalMark): boolean {
  const identity = readTabIdentity()
  return !identity || mark.userId === identity
}

/** Consigne qu'un renouvellement vient de réussir. Jamais de jeton : une date,
 *  une échéance d'access, un identifiant d'utilisateur. */
export function recordRenewal(expiresAt: number | null, userId: string | null): void {
  try {
    sharedStorage()?.setItem(RENEWAL_MARK_KEY, JSON.stringify({ at: Date.now(), expiresAt, userId }))
  } catch {
    // Stockage refusé : on perd l'économie d'un appel, pas la session.
  }
}

/** Un onglet a-t-il renouvelé la session de cet onglet depuis `since` ? */
export function renewedSince(since: number): RenewalMark | null {
  const mark = readRenewalMark()
  if (!mark || mark.at < since || !concernsThisTab(mark)) return null
  return mark
}

/** L'échéance de l'access connue du dernier renouvellement, quel que soit
 *  l'onglet qui l'a fait. `null` = inconnue. */
export function sharedAccessExpiry(): number | null {
  const mark = readRenewalMark()
  return mark && concernsThisTab(mark) ? mark.expiresAt : null
}

/** Exécute `task` seul parmi tous les onglets de l'application. */
export async function withRefreshLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (locks && typeof locks.request === 'function') {
    let started = false
    try {
      return await locks.request(LOCK_NAME, () => {
        started = true
        return task()
      })
    } catch (error) {
      // Le verrou lui-même a échoué (contexte non sécurisé, document opaque) :
      // on fait sans. Une erreur de la tâche, elle, remonte telle quelle.
      if (started) throw error
      return task()
    }
  }
  return withStorageLease(task)
}

function readLease(storage: Storage): Lease | null {
  const value = readJson(storage, LEASE_KEY)
  if (!value || typeof value !== 'object') return null
  const { owner, until } = value as Partial<Record<keyof Lease, unknown>>
  return typeof owner === 'string' && typeof until === 'number' ? { owner, until } : null
}

function tryTakeLease(storage: Storage, owner: string): boolean {
  try {
    const lease = readLease(storage)
    if (lease && lease.owner !== owner && lease.until > Date.now()) return false
    storage.setItem(LEASE_KEY, JSON.stringify({ owner, until: Date.now() + LEASE_MS }))
    return readLease(storage)?.owner === owner
  } catch {
    return true
  }
}

function releaseLease(storage: Storage, owner: string): void {
  try {
    if (readLease(storage)?.owner === owner) storage.removeItem(LEASE_KEY)
  } catch {
    // Le bail expirera seul.
  }
}

/**
 * Repli sans Web Locks : un bail dans `localStorage`. Moins strict qu'un vrai
 * verrou (deux écritures simultanées au milliseconde près restent possibles) —
 * la fenêtre de réutilisation du refresh token côté fournisseur couvre ce reste.
 * On n'attend jamais plus d'un bail : un onglet fermé en le tenant ne bloque pas.
 */
async function withStorageLease<T>(task: () => Promise<T>): Promise<T> {
  const storage = sharedStorage()
  if (!storage) return task()
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const giveUpAt = Date.now() + LEASE_MS
  while (!tryTakeLease(storage, owner) && Date.now() < giveUpAt) {
    await new Promise(resolve => setTimeout(resolve, LEASE_POLL_MS))
  }
  try {
    return await task()
  } finally {
    releaseLease(storage, owner)
  }
}
