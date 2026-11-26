import { readTabIdentity } from '@/features/auth/tab-identity'
import { apiBase } from '@/lib/api-origin'
import { refreshTokensOnce } from '@/lib/api'

/**
 * UN ENVOI DONT ON VOIT L'AVANCEMENT (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI PAS `apiFetch`
 * ─────────────────────────────────────────────────────────────────────────────
 * `fetch` n'expose AUCUN avancement d'envoi. Sur un fichier de dix mégaoctets
 * derrière une connexion de gare, l'utilisateur regarde un bouton grisé pendant
 * une minute et conclut que ça a planté — puis redépose. `XMLHttpRequest`, lui,
 * porte `upload.onprogress`, qui compte de VRAIS octets partis.
 *
 * ⚠️ La barre affichée est donc MESURÉE, jamais une animation qui fait semblant.
 * Une fausse barre est un chiffre inventé à l'écran : elle prétend savoir où en
 * est un envoi qu'elle ne mesure pas.
 *
 * ⚠️ Le serveur peut encore travailler après le dernier octet reçu (il range le
 * fichier, il écrit la ligne). L'appelant doit donc distinguer « 100 % envoyé »
 * de « terminé » — c'est `phase`, et c'est ce qui évite d'annoncer « c'est
 * fait » pendant que ça ne l'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'AUTHENTIFICATION EST LA MÊME
 * ─────────────────────────────────────────────────────────────────────────────
 * `withCredentials` porte les cookies HttpOnly, exactement comme
 * `credentials: 'include'` ; l'en-tête d'identité d'onglet est le même. Un 401
 * rejoue le refresh SINGLE-FLIGHT du dépôt (`refreshTokensOnce`) puis réessaie
 * UNE fois : deux rafraîchissements concurrents invalideraient le jeton de
 * l'autre et déconnecteraient l'utilisateur en pleine session.
 */

/** L'en-tête par lequel l'onglet déclare l'identité sous laquelle il travaille.
 *  Doit rester identique à `SESSION_SCOPE_HEADER` côté API. */
const TAB_IDENTITY_HEADER = 'X-Bellum-User'

/** NON exporté : il n'est nommé que dans `UploadProgress`, juste en dessous. */
type UploadPhase = 'sending' | 'finishing'

export type UploadProgress = {
  phase: UploadPhase
  /** Part des octets réellement partis, entre 0 et 1. Mesurée, jamais estimée.
   *  `null` quand le navigateur ne sait pas dire la taille totale — l'écran
   *  affiche alors « envoi en cours » plutôt qu'un pourcentage inventé. */
  ratio: number | null
}

/**
 * Envoie un corps JSON en rendant compte de l'avancement.
 *
 * Rend la réponse désérialisée, ou lève une `Error` dont le message est CELUI
 * DU SERVEUR quand il en donne un — « ce fichier dépasse 10 Mo » fait
 * compresser, « une erreur est survenue » fait redéposer le même fichier.
 */
export async function uploadWithProgress<TResponse, TBody>(
  path: string,
  body: TBody,
  onProgress: (progress: UploadProgress) => void,
): Promise<TResponse> {
  try {
    return await send<TResponse, TBody>(path, body, onProgress)
  } catch (error) {
    if (!(error instanceof UnauthorizedUpload)) throw error
    // Le jeton a expiré pendant l'envoi. Une seule reprise, après le refresh
    // partagé : c'est le même contrat que `apiFetch`.
    if (!(await refreshTokensOnce())) throw new Error(error.message)
    return send<TResponse, TBody>(path, body, onProgress)
  }
}

/** Le 401 est une classe à part : lui seul justifie de rejouer l'envoi. */
class UnauthorizedUpload extends Error {}

function send<TResponse, TBody>(
  path: string,
  body: TBody,
  onProgress: (progress: UploadProgress) => void,
): Promise<TResponse> {
  return new Promise<TResponse>((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${apiBase()}${path}`)
    request.withCredentials = true
    request.setRequestHeader('Content-Type', 'application/json')
    const identity = readTabIdentity()
    if (identity) request.setRequestHeader(TAB_IDENTITY_HEADER, identity)

    request.upload.onprogress = event => {
      onProgress({ phase: 'sending', ratio: event.lengthComputable ? event.loaded / event.total : null })
    }
    // Le dernier octet est parti, le serveur travaille encore : c'est une
    // phase distincte, et la nommer évite d'annoncer « c'est fait » trop tôt.
    request.upload.onload = () => onProgress({ phase: 'finishing', ratio: 1 })

    request.onerror = () => reject(new Error('network'))
    request.onload = () => {
      if (request.status === 401) {
        reject(new UnauthorizedUpload(readServerMessage(request.responseText)))
        return
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(readServerMessage(request.responseText)))
        return
      }
      try {
        resolve(JSON.parse(request.responseText || '{}') as TResponse)
      } catch {
        reject(new Error('parse'))
      }
    }
    request.send(JSON.stringify(body))
  })
}

/**
 * Le message porté par la réponse d'erreur — vide si le serveur n'en donne pas.
 *
 * ⚠️ On ne fabrique AUCUN message ici : c'est l'appelant qui décide quoi dire
 * quand le serveur s'est tu. Inventer une phrase à cet étage la rendrait
 * indistinguable d'une vraie raison.
 */
function readServerMessage(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw || '{}')
    if (parsed && typeof parsed === 'object' && 'message' in parsed) {
      const message = (parsed as { message: unknown }).message
      if (typeof message === 'string') return message
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0]
    }
  } catch {
    // Une réponse non-JSON (une page d'erreur d'une passerelle) n'a pas de
    // message utile à extraire : on rend vide plutôt que du HTML.
  }
  return ''
}
