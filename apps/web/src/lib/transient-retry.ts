import { isNetworkFailure, isSafeMethod } from '@/lib/api-origin'

/**
 * #2519 / #2520 — UNE REQUÊTE QUI TOMBE PENDANT UN REDÉPLOIEMENT SE REJOUE, UNE OU DEUX FOIS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE PASSE PENDANT UNE MISE EN PRODUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque fusion redéploie l'API et le moteur IA (deux réplicas chacun). Pendant
 * la bascule, une requête peut tomber sur une connexion fermée (`fetch` rejette
 * un `TypeError`) ou sur la passerelle de l'hébergeur qui n'a plus d'amont
 * (502/503/504). Ce n'est pas une réponse de NOTRE serveur : c'est l'absence de
 * serveur, pendant quelques secondes. Louis le voyait comme « des bugs après
 * une merge request ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI SE REJOUE, ET CE QUI NE SE REJOUE JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * « Un timeout n'est pas un échec » (CLAUDE.md) : une requête partie sans
 * réponse est INCONNUE. La rejouer à l'aveugle peut écrire ou débiter deux fois.
 * La relance automatique ne vaut donc que pour :
 *  - une LECTURE (`GET`/`HEAD`) — la répéter ne change rien ;
 *  - un démarrage que son APPELANT déclare idempotent (`idempotent: true` sur
 *    `apiFetch`) parce que le serveur le dédoublonne lui-même — ex.
 *    `POST /analysis/start`, dont le `jobId` est déterministe et qui rend
 *    `in_flight` sans rien débiter quand le run tourne déjà.
 * Toute autre écriture remonte l'erreur au premier échec : c'est l'écran qui
 * propose « Relancer », et c'est la personne qui décide.
 *
 * Une réponse du SERVEUR (400, 401, 409, 429, 500…) n'est jamais rejouée : elle
 * dit quelque chose, la répéter ne changerait rien — et un 429 rejoué creuserait
 * le plafond qu'il annonce.
 *
 * La borne est courte (deux relances, ~2 s en tout) : au-delà, attendre sans
 * rien dire coûte plus cher que d'afficher l'erreur et son bouton.
 */

/** L'attente avant chaque relance — croissante, deux relances au plus. */
const TRANSIENT_RETRY_DELAYS_MS: readonly number[] = [500, 1500]

/** Les statuts d'une passerelle qui n'a pas (ou plus) d'amont. */
const TRANSIENT_STATUSES = new Set([502, 503, 504])

export function isTransientStatus(status: number): boolean {
  return TRANSIENT_STATUSES.has(status)
}

/** Une requête que l'on peut rejouer SANS que personne ne l'ait demandé. */
export function canReplayAutomatically(method: string, idempotent: boolean): boolean {
  return isSafeMethod(method) || idempotent
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

/** Attend `ms`, ou rejette dès que `signal` est levé — jamais une relance après un arrêt. */
function wait(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Envoie, et rejoue sur une panne de TRANSPORT seulement, dans la borne.
 *
 * À la borne, la DERNIÈRE issue est rendue telle quelle (la réponse 50x, ou
 * l'erreur réseau) : l'appelant la traite exactement comme avant ce lot.
 * L'appelant garantit que `send` est rejouable (voir `canReplayAutomatically`).
 */
export async function withTransientRetry(
  send: () => Promise<Response>,
  options: { signal?: AbortSignal | null } = {},
): Promise<Response> {
  const delays = TRANSIENT_RETRY_DELAYS_MS
  for (let attempt = 0; ; attempt += 1) {
    const isLast = attempt >= delays.length
    try {
      const res = await send()
      if (isLast || !isTransientStatus(res.status)) return res
      // Le corps de la réponse écartée n'est jamais lu : on le libère.
      void res.body?.cancel().catch(() => {})
    } catch (error) {
      if (isLast || !isNetworkFailure(error)) throw error
    }
    await wait(delays[attempt] ?? 0, options.signal)
  }
}
