import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError } from '@bellum/errors'

/**
 * #2496 — Découvrir : « Ta cible » (tous les secteurs de l'ICP appliqués d'un
 * coup) rendait un écran « La recherche a échoué — le service n'a pas pu être
 * joint » pour `POST /ia/discover/registry`, avec un `500 {"statusCode":500,
 * "message":"Internal server error"}` générique.
 *
 * La cause n'était pas dans le moteur (`apps/ia`) — vérifié par des corps
 * plausibles rejouant « Ta cible » (plusieurs secteurs croisés en un `nafCode`
 * unique jusqu'à 32 codes, puis cinq secteurs couvrant huit sections NAF
 * distinctes tronquées à `MAX_CROSSED_SECTORS`), tous verts en test. Elle est
 * ici : `IaClient.discoverRegistry`/`discoverSignals` lèvent une `TechnicalError`
 * (`@bellum/errors`, via `HttpClient.request`) pour TOUT échec — qu'il s'agisse
 * d'une validation refusée par l'IA (422), d'une panne amont (5xx) ou d'un
 * abandon par timeout (le rail unifié peut envoyer jusqu'à
 * `MAX_CROSSED_SECTORS` sous-recherches, plus longues qu'une recherche à un
 * seul secteur + département). Le contrôleur ne l'attrapait pas : l'erreur
 * traversait jusqu'au filtre générique (`AllExceptionsFilter`), qui répond
 * `{statusCode:500, message:'Internal server error'}` pour toute exception qui
 * n'est pas une `HttpException` — perdant au passage le statut et le corps
 * RÉELS de la réponse IA, exactement l'information qui aurait permis de
 * diagnostiquer l'incident depuis les logs.
 *
 * Même défaut, même correctif que `contacts/enrichment-failure.ts`
 * (`classifyEnrichmentFailure`) : on ne devine jamais un résultat, on classe le
 * VRAI type d'échec (fait dur : ce que l'IA a répondu, ou qu'elle n'a pas
 * répondu du tout) et on le rend en clair — journalisé côté opérateur, et en
 * statut HTTP correct côté client (422 ≠ 503 ≠ 500 : trois faits différents).
 */
type DiscoverFailureReason = 'invalid_filters' | 'timeout' | 'upstream_error'

type DiscoverFailure = {
  reason: DiscoverFailureReason
  /** Statut HTTP à rendre au client. Jamais 500 : ce code-là dit « notre
   *  serveur a un bug », ce qui n'est vrai dans aucun des trois cas. */
  status: number
  /** Phrase pour les logs et le corps de réponse — jamais montrée telle
   *  quelle à l'écran (Découvrir garde son message générique, cf.
   *  `discover.json#errorHint` : « aucun résultat plutôt qu'un résultat
   *  approximatif »), mais un consommateur qui lit le JSON brut (support,
   *  script, ancien build) a enfin une phrase et pas un mot de trois
   *  syllabes non traduit. */
  message: string
  /** Détail amont, pour les logs opérateur uniquement — jamais renvoyé au
   *  client : il peut porter le corps brut d'une réponse IA. */
  detail?: string
}

export const DISCOVER_FAILURE_MESSAGES: Record<DiscoverFailureReason, string> = {
  invalid_filters:
    "La recherche contient des critères que le moteur n'a pas pu traiter. Réessaie avec des filtres différents.",
  timeout:
    'La recherche prend plus de temps que prévu sur ces critères. Réessaie avec moins de secteurs ou de filtres, ou réessaie dans un instant.',
  upstream_error: 'Le service de recherche est temporairement indisponible. Réessaie dans un instant.',
}

/** Marche la chaîne `cause` d'une erreur — `HttpClient` empile `TechnicalError`
 *  → (`HttpRetriesExhaustedError` →) `HttpError`/`HttpTimeoutError` selon que
 *  l'appel a retenté ou non. Bornée et résistante aux cycles. */
function findInCauseChain<T>(err: unknown, pick: (e: unknown) => T | undefined): T | undefined {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && !seen.has(current)) {
    seen.add(current)
    const hit = pick(current)
    if (hit !== undefined) return hit
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/**
 * Classe ce que `IaClient.discoverRegistry`/`discoverSignals` a levé.
 *
 * Précédence : une réponse HTTP réelle de l'IA (même en erreur) prime sur
 * l'absence de réponse — un 422 EST une réponse, un timeout n'en est pas. Un
 * statut 4xx est un critère refusé (`invalid_filters`), jamais une panne du
 * moteur ; tout le reste avec réponse est `upstream_error`. Sans réponse du
 * tout (timeout, budget de retries épuisé sur du transitoire) → `timeout`.
 */
export function classifyDiscoverFailure(err: unknown): DiscoverFailure {
  const httpError = findInCauseChain(err, e => (e instanceof HttpError ? e : undefined))
  if (httpError) {
    if (httpError.status >= 400 && httpError.status < 500) {
      return {
        reason: 'invalid_filters',
        status: 422,
        message: DISCOVER_FAILURE_MESSAGES.invalid_filters,
        detail: httpError.body ? httpError.body.slice(0, 200) : undefined,
      }
    }
    return {
      reason: 'upstream_error',
      status: 503,
      message: DISCOVER_FAILURE_MESSAGES.upstream_error,
      detail: httpError.body ? httpError.body.slice(0, 200) : undefined,
    }
  }

  const timeout = findInCauseChain(err, e =>
    e instanceof HttpTimeoutError || e instanceof HttpRetriesExhaustedError ? e : undefined,
  )
  if (timeout) {
    return { reason: 'timeout', status: 503, message: DISCOVER_FAILURE_MESSAGES.timeout, detail: timeout.message }
  }

  return {
    reason: 'upstream_error',
    status: 503,
    message: DISCOVER_FAILURE_MESSAGES.upstream_error,
    detail: err instanceof Error ? err.message : undefined,
  }
}
