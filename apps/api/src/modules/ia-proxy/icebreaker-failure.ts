import { HttpError } from '@bellum/errors'

/**
 * #2648.1 — Pourquoi une accroche ne s'est PAS générée, dans le vocabulaire
 * que l'écran peut nommer sans deviner.
 *
 * `ContactIcebreakers.tsx` retombait entièrement sur `icebreakers.unavailable`
 * (un motif générique) et `IaEnvelope` (`ia.client.ts`) ne portait même pas de
 * champ raison — le travail traverse trois couches (moteur → enveloppe →
 * écran) et un correctif d'écran seul serait inerte tant que la raison
 * n'existe pas en amont.
 *
 * Même patron que `discover-failure.ts` / `contacts/enrichment-failure.ts` :
 * on classe le VRAI type d'échec (ce que l'IA a répondu, ou qu'elle n'a pas
 * répondu du tout), on ne devine jamais un motif qu'elle n'a pas nommé.
 */
type IcebreakerFailureReason = 'contact_not_found' | 'insufficient_context' | 'upstream_error'

type IcebreakerFailure = {
  reason: IcebreakerFailureReason
  /** Statut HTTP à rendre au client. */
  status: number
  /** Phrase pour les logs et le corps de réponse — jamais montrée telle
   *  quelle à l'écran (qui lit `code`, pas `message`, pour se traduire). */
  message: string
  /** Détail amont, pour les logs opérateur uniquement. */
  detail?: string
}

export const ICEBREAKER_FAILURE_MESSAGES: Record<IcebreakerFailureReason, string> = {
  contact_not_found: 'Ce contact est introuvable — il a peut-être été supprimé ou déplacé.',
  insufficient_context:
    'Ni poste connu ni signal récent sur ce contact — rien à quoi accrocher une accroche personnalisée.',
  upstream_error: 'Le service de génération est temporairement indisponible. Réessaie dans un instant.',
}

/** Marche la chaîne `cause` d'une erreur — `HttpClient` empile `TechnicalError`
 *  → (`HttpRetriesExhaustedError` →) `HttpError`/`HttpTimeoutError` selon que
 *  l'appel a retenté ou non. Bornée et résistante aux cycles. Même copie locale
 *  que `discover-failure.ts` / `contacts/enrichment-failure.ts` — pas de
 *  dépendance croisée entre ces modules pour un utilitaire de dix lignes. */
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

/** Lit `{detail: {code, message}}` — la forme que `apps/ia/app/routers/
 *  icebreaker.py` renvoie pour son seul cas NOMMÉ (`insufficient_context`).
 *  Un code hors du vocabulaire connu est ignoré, pas forwardé. */
function readNamedInsufficientContext(body: string): { message: string } | undefined {
  if (!body) return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    const detail = (parsed as { detail?: unknown })?.detail
    if (!detail || typeof detail !== 'object') return undefined
    const { code, message } = detail as { code?: unknown; message?: unknown }
    if (code !== 'insufficient_context') return undefined
    return {
      message: typeof message === 'string' && message ? message : ICEBREAKER_FAILURE_MESSAGES.insufficient_context,
    }
  } catch {
    return undefined
  }
}

/**
 * Classe ce que `IaClient.icebreaker` a levé.
 *
 * Précédence : un 422 nommé `insufficient_context` par l'IA d'abord (c'est le
 * SEUL cas où le moteur sait dire pourquoi) ; puis le statut HTTP quand il est
 * sans ambiguïté (404 = contact introuvable) ; tout le reste — 5xx, 422 non
 * nommé, timeout — est `upstream_error` : une panne, jamais une raison
 * inventée.
 */
export function classifyIcebreakerFailure(err: unknown): IcebreakerFailure {
  const httpError = findInCauseChain(err, e => (e instanceof HttpError ? e : undefined))

  if (httpError) {
    if (httpError.status === 422) {
      const named = readNamedInsufficientContext(httpError.body)
      if (named) return { reason: 'insufficient_context', status: 422, message: named.message }
    }
    if (httpError.status === 404) {
      return { reason: 'contact_not_found', status: 404, message: ICEBREAKER_FAILURE_MESSAGES.contact_not_found }
    }
    return {
      reason: 'upstream_error',
      status: 503,
      message: ICEBREAKER_FAILURE_MESSAGES.upstream_error,
      detail: httpError.body ? httpError.body.slice(0, 200) : undefined,
    }
  }

  return {
    reason: 'upstream_error',
    status: 503,
    message: ICEBREAKER_FAILURE_MESSAGES.upstream_error,
    detail: err instanceof Error ? err.message : undefined,
  }
}
