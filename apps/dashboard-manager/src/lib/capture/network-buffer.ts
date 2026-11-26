// Anneau des appels HTTP qui ont ÉCHOUÉ, en structuré.
//
// `errorBuffer` en gardait déjà une ligne de texte (« 500 GET /accounts »), et
// c'est tout ce qu'une issue pouvait montrer. Il y manquait le seul champ qui
// relie un bug vu par l'utilisateur aux logs du serveur : l'identifiant de
// corrélation que l'API pose sur CHAQUE réponse (`x-correlation-id`). Avec lui,
// on ouvre Railway, on colle l'identifiant, on lit la pile exacte. Sans lui, on
// cherche dans une journée de logs.
//
// Ce module possède l'unique patch de `fetch` de l'application : y ajouter un
// second (un par besoin) ferait s'empiler les enveloppes et fausserait les durées.

/**
 * ⚠️ NON exporté ici, contrairement à l'app cliente.
 *
 * Le widget du back-office envoie ces objets tels quels, sans jamais nommer
 * leur type — la forme qui TRANCHE vit au contrat de l'API
 * (`networkFailureSchema`). Un type exporté que personne n'importe est
 * exactement ce que `pnpm lint:exports:types` refuse, et il aurait fait une
 * seconde déclaration de la même chose, à côté de celle qui décide.
 */
type NetworkFailure = {
  time: string
  method: string
  /** Origine + chemin. Jamais la query — voir {@link sanitiseUrl}. */
  url: string
  /** Code HTTP, ou `null` quand l'appel n'a même pas abouti. */
  status: number | null
  /** Message d'erreur réseau (DNS, coupure, CORS), `null` si la réponse est arrivée. */
  error: string | null
  durationMs: number
  /** `x-correlation-id` de la réponse — `null` si l'en-tête n'est pas lisible. */
  correlationId: string | null
}

const MAX_ENTRIES = 25
/** Ce qu'on joint au rapport : les derniers échecs, pas tout l'historique. */
const REPORTED = 12

const failures: NetworkFailure[] = []
let installed = false

/**
 * Installe la sonde `fetch`. `sink` reçoit la ligne de texte historique pour le
 * tampon d'erreurs — les deux vues sortent donc du MÊME appel observé, il ne
 * peut pas y en avoir une qui voie un échec que l'autre ignore.
 */
export function installNetworkProbe(sink?: (text: string) => void): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true

  const original = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const url = requestUrl(input)
    const startedAt = performance.now()
    try {
      const response = await original(input, init)
      if (!response.ok) {
        record({
          method,
          url,
          status: response.status,
          error: null,
          startedAt,
          // En cross-origin, l'en-tête n'est lisible que s'il est listé dans
          // `Access-Control-Expose-Headers` côté API. Absent = `null`, jamais
          // une valeur inventée.
          correlationId: response.headers.get('x-correlation-id'),
        })
        sink?.(`${response.status} ${method} ${sanitiseUrl(url)}`)
      }
      return response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      record({ method, url, status: null, error: message, startedAt, correlationId: null })
      sink?.(`FAILED ${method} ${sanitiseUrl(url)} — ${message}`)
      throw error
    }
  }
}

/** Les derniers échecs, du plus ancien au plus récent. */
export function getRecentNetworkFailures(): NetworkFailure[] {
  return failures.slice(-REPORTED)
}

function record(input: {
  method: string
  url: string
  status: number | null
  error: string | null
  startedAt: number
  correlationId: string | null
}): void {
  try {
    failures.push({
      time: new Date().toISOString(),
      method: input.method.toUpperCase(),
      url: sanitiseUrl(input.url),
      status: input.status,
      error: input.error,
      durationMs: Math.round(performance.now() - input.startedAt),
      correlationId: input.correlationId,
    })
    if (failures.length > MAX_ENTRIES) failures.shift()
  } catch {
    // Observer une panne ne doit jamais en provoquer une.
  }
}

/**
 * Origine + chemin, query RETIRÉE. Une issue est lue par plus de monde qu'une
 * session : les paramètres portent des jetons (`?t=` du lien de démonstration,
 * `code`/`state` d'un retour OAuth) qui n'ont rien à faire dans un ticket. La
 * présence d'une query est signalée par `?…` — l'absence d'un paramètre peut
 * être la cause du bug, la taire serait mentir.
 */
function sanitiseUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin)
    return url.search ? `${url.origin}${url.pathname}?…` : `${url.origin}${url.pathname}`
  } catch {
    return raw.split('?')[0] ?? raw
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}
