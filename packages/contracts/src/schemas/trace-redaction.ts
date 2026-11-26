/**
 * #4113 — LE MASQUAGE DES TRACES (Sentry web + api), un seul module TS.
 *
 * Ce qui part vers Sentry est masqué : e-mails, téléphones (E.164 ou national
 * français), jetons / Bearer / clés. Miroir exact des motifs de
 * `apps/ia/app/services/langfuse_client.py` (`_redact`) — le Python a son
 * propre module (un par runtime), celui-ci est réutilisé par le web ET l'API.
 *
 * ⚠️ PÉRIMÈTRE : traces SEULEMENT. Ce module n'est jamais appelé pour un
 * rendu d'écran ni une réponse d'API : à l'écran, e-mails, téléphones et noms
 * restent TOUJOURS en clair (décision Louis). Un SIREN, un CA, un effectif,
 * un code postal passent (motifs de téléphone volontairement étroits).
 *
 * Non configurable : retirer le moyen vaut mieux que retirer la permission.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE_RE =
  /(?<![\w.])(?:\+\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,6}\d{2,4}|0[1-9](?:[\s.-]?\d{2}){4})(?![\w.])/g

const SECRET_MASK = '[secret masqué]'
const EMAIL_MASK = '[email masqué]'
const PHONE_MASK = '[téléphone masqué]'

const JWT_RE = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g
const AUTH_RE = /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi
const PREFIXED_KEY_RE = /\b[a-z]{2}[-_](?:[A-Za-z0-9]+[-_])*[A-Za-z0-9]{12,}/g
const KEY_VALUE_RE =
  /((?:api[-_]?key|access[-_]?token|token|secret|password|authorization)"?\s*[:=]\s*"?)([^"'\s,;}&[\]]{6,})/gi

/** Noms de clé dont la valeur n'est jamais envoyée (en-têtes, cookies…). */
const SENSITIVE_KEY_RE = /(authorization|cookie|x-internal-secret|password|secret|token|api[-_]?key|jwt|refresh)/i

const MAX_DEPTH = 8

/** Masque e-mails, téléphones et secrets d'un texte. Ne lève jamais. */
function maskTraceText(text: string): string {
  try {
    let out = text.replace(EMAIL_RE, EMAIL_MASK)
    out = out.replace(JWT_RE, SECRET_MASK).replace(AUTH_RE, SECRET_MASK).replace(PREFIXED_KEY_RE, SECRET_MASK)
    out = out.replace(KEY_VALUE_RE, (_m, key: string) => `${key}${SECRET_MASK}`)
    return out.replace(PHONE_RE, PHONE_MASK)
  } catch {
    return SECRET_MASK
  }
}

function maskValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return maskTraceText(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= MAX_DEPTH) return '[Truncated]'
  if (Array.isArray(value)) return value.map(item => maskValue(item, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY_RE.test(key) ? '[Filtered]' : maskValue(child, depth + 1)
  }
  return out
}

type Json = Record<string, unknown>

/**
 * Rend une COPIE de l'événement Sentry masquée (message, exception, extra,
 * contexts, tags, request.data/headers/cookies/query_string/url, breadcrumbs).
 * L'entrée n'est jamais mutée. Générique : sert aux événements web et api.
 */
export function scrubSentryEvent<T extends object>(event: T): T {
  try {
    const copy = maskValue(event, 0) as Json
    return copy as T
  } catch {
    return { message: SECRET_MASK } as unknown as T
  }
}

/** Masque un breadcrumb (message + data). Copie, jamais de mutation. */
export function scrubSentryBreadcrumb<T extends object>(breadcrumb: T): T {
  try {
    return maskValue(breadcrumb, 0) as T
  } catch {
    return { message: SECRET_MASK } as unknown as T
  }
}
