import { HttpError, HttpTimeoutError } from '@bellum/errors'

/**
 * Why an enrichment could not be attempted, in the vocabulary the rest of the
 * stack already speaks.
 *
 * These are the `DegradeReason` values from `apps/ia/app/services/company_filters.py`
 * (#628 / #638). Reusing them rather than inventing a parallel set is the point:
 * the same word means the same thing whether it comes from a discovery run, a
 * source-health rollup, or this button.
 */
export type EnrichmentFailureReason =
  | 'missing_api_key' // no credential configured at all
  | 'unauthorized' // credential present but rejected
  | 'quota_exceeded' // plan / credits exhausted upstream
  | 'rate_limited' // throttled (429, or our own limiter deadline)
  | 'upstream_error' // provider answered 5xx, or we cannot tell why
  | 'network_error' // never reached the provider (transport, timeout)

const KNOWN_REASONS = new Set<string>([
  'missing_api_key',
  'unauthorized',
  'quota_exceeded',
  'rate_limited',
  'upstream_error',
  'network_error',
])

/** Status → reason, mirroring the IA's `reason_for_status`. 401 and 403 both
 *  mean "the credential was refused"; only the body could say more, and when it
 *  can, the IA already told us via `code`. */
const STATUS_REASONS: Record<number, EnrichmentFailureReason> = {
  401: 'unauthorized',
  402: 'quota_exceeded',
  403: 'unauthorized',
  429: 'rate_limited',
}

type EnrichmentFailure = {
  reason: EnrichmentFailureReason
  /** Upstream sentence, for logs and operator triage. Never shown raw to the
   *  seller — the web renders a localized sentence keyed on `reason`. */
  detail?: string
}

/**
 * French sentence per reason, used as the response `message`.
 *
 * The client localises on `reason` and normally never renders these; they are
 * the honest fallback for any consumer that only reads `message` (curl, an
 * older web build, a log line). Each one names the failure and implies the next
 * step — « réessaie » for a throttle, « contacte le support » for a credential —
 * because "API error" told the seller neither.
 */
export const ENRICHMENT_FAILURE_MESSAGES: Record<EnrichmentFailureReason, string> = {
  missing_api_key:
    "L'enrichissement n'est pas configuré sur ce service. Contacte le support — aucun crédit n'a été débité.",
  unauthorized:
    "Le fournisseur d'enrichissement a refusé notre accès (clé ou plan insuffisant). Contacte le support — aucun crédit n'a été débité.",
  quota_exceeded:
    "Le quota du fournisseur d'enrichissement est épuisé. Réessaie plus tard — aucun crédit n'a été débité.",
  rate_limited:
    'Trop de demandes d’enrichissement en même temps. Réessaie dans quelques instants — aucun crédit n’a été débité.',
  upstream_error: "Le fournisseur d'enrichissement est indisponible. Réessaie plus tard — aucun crédit n'a été débité.",
  network_error:
    "Impossible de joindre le fournisseur d'enrichissement. Réessaie plus tard — aucun crédit n'a été débité.",
}

/** Walk an error's `cause` chain looking for the first match. `HttpClient` nests
 *  two deep on a retried call (`TechnicalError` → `HttpRetriesExhaustedError` →
 *  `HttpError`), so stopping at the first level loses the reason on exactly the
 *  transient failures. Bounded, and cycle-safe via the visited set. */
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
 * Turn whatever the IA client threw into a reason the product can act on.
 *
 * This is the step that was missing. `IaClient.enrichContact` throws a
 * `TechnicalError` wrapping an `HttpError`; `ContactsService` let it escape;
 * the catch-all filter answered a bare `'Internal server error'` string; and the
 * web's `extractError`, unable to parse that as JSON, fell through to its
 * last-resort `'API error'`. Every link preserved the failure and dropped the
 * reason.
 *
 * Precedence is deliberate: the code the IA *named* beats anything we could
 * infer, because only the IA saw the provider's body. Unknown or absent, we fall
 * back to the HTTP status, which is at least a fact. Never empty — that
 * guarantee is what makes the "no reason at all" path unreachable.
 */
export function classifyEnrichmentFailure(err: unknown): EnrichmentFailure {
  const httpError = findInCauseChain(err, e => (e instanceof HttpError ? e : undefined))

  if (httpError) {
    const named = readIaReason(httpError.body)
    if (named) return { reason: named.reason, detail: named.detail }
    return {
      reason: STATUS_REASONS[httpError.status] ?? 'upstream_error',
      detail: httpError.body ? httpError.body.slice(0, 200) : undefined,
    }
  }

  // No HTTP response at all: we never got an answer, so we know nothing about
  // the contact. A timeout is a network fact, not an upstream refusal.
  const timeout = findInCauseChain(err, e => (e instanceof HttpTimeoutError ? e : undefined))
  if (timeout) return { reason: 'network_error', detail: timeout.message }

  return { reason: 'upstream_error', detail: err instanceof Error ? err.message : undefined }
}

/** Read `{detail: {message, code}}` — the shape the IA's `/phase/2/enrich`
 *  returns since this PR. A code outside the shared vocabulary is ignored
 *  rather than forwarded: an untranslatable code would land the user right back
 *  on an untranslated string. */
function readIaReason(body: string): EnrichmentFailure | undefined {
  if (!body) return undefined
  try {
    const parsed: unknown = JSON.parse(body)
    const detail = (parsed as { detail?: unknown })?.detail
    if (!detail || typeof detail !== 'object') return undefined
    const { code, message } = detail as { code?: unknown; message?: unknown }
    if (typeof code !== 'string' || !KNOWN_REASONS.has(code)) return undefined
    return {
      reason: code as EnrichmentFailureReason,
      detail: typeof message === 'string' && message ? message : undefined,
    }
  } catch {
    // Not JSON — a proxy's HTML 504 page, most often. The status still speaks.
    return undefined
  }
}

/**
 * Apollo « à sec » : crédits épuisés (422 « insufficient credits », 402), plan ou clé refusés
 * (403, 401), clé absente. Pour CET appel Apollo est indisponible — la cascade continue sur les
 * sources suivantes (Kaspr, FullEnrich…) au lieu de s'arrêter. Un timeout / réseau / 429 n'en est
 * pas un : « un timeout n'est pas un échec », la reprise s'arrête (doctrine).
 */
export function isApolloDry(failure: EnrichmentFailure): boolean {
  if (
    failure.reason === 'quota_exceeded' ||
    failure.reason === 'unauthorized' ||
    failure.reason === 'missing_api_key'
  ) {
    return true
  }
  return failure.reason === 'upstream_error' && /insufficient credits|\[HTTP 422\]/i.test(failure.detail ?? '')
}
