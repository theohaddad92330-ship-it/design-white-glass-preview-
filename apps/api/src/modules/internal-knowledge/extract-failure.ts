import { HttpError, HttpRetriesExhaustedError, HttpTimeoutError } from '@bellum/errors'

/** #3586 — délai d'extraction IA : 60 s de base + 20 s par Mo, entre 60 s et 10 min (un fichier de 25 Mo, plafond IA du Drive interne, demande ~9 min). */
export function extractTimeoutMs(sizeBytes: number): number {
  const mb = sizeBytes / (1024 * 1024)
  return Math.min(600_000, Math.max(60_000, Math.round((60 + mb * 20) / 5) * 5000))
}

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
 * #3586 — « HTTP request failed » ne dit rien : le message stocké nomme la CAUSE (statut HTTP ou délai),
 * la taille du fichier et le délai accordé.
 */
export function describeExtractFailure(
  err: unknown,
  ctx: { filename: string; sizeBytes: number; timeoutMs: number },
): string {
  const size = `${(ctx.sizeBytes / (1024 * 1024)).toFixed(1)} Mo`
  const delai = `${Math.round(ctx.timeoutMs / 1000)} s`
  const head = `extraction IA de ${ctx.filename} échouée (${size}, délai ${delai})`
  const http = findInCauseChain(err, e => (e instanceof HttpError ? e : undefined))
  if (http) {
    const body = http.body ? ` : ${http.body.slice(0, 200)}` : ''
    return `${head} — HTTP ${http.status}${body}`
  }
  const timeout = findInCauseChain(err, e =>
    e instanceof HttpTimeoutError || e instanceof HttpRetriesExhaustedError ? e : undefined,
  )
  if (timeout) return `${head} — délai dépassé, pas de réponse du service IA`
  const detail = err instanceof Error ? err.message : 'erreur inconnue'
  return `${head} — ${detail}`
}
