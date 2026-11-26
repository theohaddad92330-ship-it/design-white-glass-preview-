import type { JobsOptions } from 'bullmq'

/**
 * Lecture automatique des CV à l'import (04/10/2026, import ZIP de 688 CV —
 * `c88_lecture_auto_cv_import`). Un job par FICHE créée par
 * `CvIntakeService.intakeAutomatic` (ZIP en ligne, ZIP volumineux, dépôt
 * automatique, pièce jointe), et par fiche remise en file par le rattrapage
 * ciblé « Lire les CV non lus ». Même patron que `cv-zip-import.queue.ts` : le
 * job ne porte que des identifiants, l'état vit sur la fiche
 * (`consultants.cv_auto_read_at`).
 */
export const CV_AUTO_PARSE_QUEUE = 'cv-auto-parse'

export type CvAutoParseJobData = {
  workspaceId: string
  userId: string
  consultantId: string
  /** #3935 — reports déjà faits pour saturation du service IA (aucune tentative consommée). */
  deferrals?: number
}

export const CV_AUTO_PARSE_JOB_OPTIONS: JobsOptions = {
  // Le service IA peut être momentanément saturé pendant un lot de centaines
  // de CV : trois tentatives espacées, jamais une boucle.
  attempts: 3,
  backoff: { type: 'exponential', delay: 15_000 },
  removeOnComplete: { age: 3_600, count: 5_000 },
  removeOnFail: { age: 604_800 },
}

/**
 * Fiches lues EN MÊME TEMPS par processus — #3935 (lot BATCH-CV, 12/10/2026,
 * urgence Louis : 400 à 2000 CV d'un coup). Était 1 en dur : 2000 CV × ~15 s
 * ÷ 2 réplicas ≈ 4 h. Désormais `CV_AUTO_PARSE_CONCURRENCY` (env), défaut 8,
 * borné [1, 24], invalide ⇒ défaut.
 *
 * Le pool Postgres (GA-303, `database.module.spec.ts`) : une lecture ne tient
 * PAS de connexion pendant l'appel IA (aucune transaction dans
 * `CvAutoParseService.readOne` : deux lectures courtes, l'appel IA, une
 * écriture) — la concurrence se paie en appels IA simultanés, pas en
 * connexions retenues. Le cliquet compte quand même le DÉFAUT (8), lu ici.
 */
export const CV_AUTO_PARSE_DEFAULT_CONCURRENCY = 8
const CV_AUTO_PARSE_CONCURRENCY_MIN = 1
const CV_AUTO_PARSE_CONCURRENCY_MAX = 24

/** Un entier strict (« 8 », « 12 ») ou rien — « 2.5 », « 8x », « beaucoup » ne sont pas des réglages. */
function parseStrictInt(raw: string | undefined): number | null {
  const trimmed = raw?.trim() ?? ''
  if (!/^-?\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function resolveCvAutoParseConcurrency(raw: string | undefined): number {
  const parsed = parseStrictInt(raw)
  if (parsed === null) return CV_AUTO_PARSE_DEFAULT_CONCURRENCY
  return clamp(parsed, CV_AUTO_PARSE_CONCURRENCY_MIN, CV_AUTO_PARSE_CONCURRENCY_MAX)
}

export const CV_AUTO_PARSE_CONCURRENCY = resolveCvAutoParseConcurrency(process.env['CV_AUTO_PARSE_CONCURRENCY'])

/**
 * #3935 — le LIMITEUR BullMQ : lectures démarrées par minute, TOUS réplicas
 * confondus (le limiteur vit dans Redis, sur la file). Remplace l'espacement
 * fixe de 20 s du rattrapage : le débit se borne à un seul endroit.
 */
export const CV_AUTO_PARSE_DEFAULT_RATE_PER_MINUTE = 120
const CV_AUTO_PARSE_RATE_MAX = 600

export function resolveCvAutoParseRatePerMinute(raw: string | undefined): number {
  const parsed = parseStrictInt(raw)
  if (parsed === null) return CV_AUTO_PARSE_DEFAULT_RATE_PER_MINUTE
  return clamp(parsed, 1, CV_AUTO_PARSE_RATE_MAX)
}

export const CV_AUTO_PARSE_RATE_PER_MINUTE = resolveCvAutoParseRatePerMinute(
  process.env['CV_AUTO_PARSE_RATE_PER_MINUTE'],
)

/** #3935 — délai de pause de la file quand le service IA sature sans dire combien attendre. */
export const CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS = 30_000
/** Un `retry-after` au-delà de 10 min est traité comme 10 min — une file ne dort pas une journée. */
export const CV_AUTO_PARSE_IA_MAX_BACKOFF_MS = 600_000
/** Reports SANS tentative consommée, au plus — au-delà, l'indisponibilité redevient un échec
 *  normal (3 tentatives) : un service IA en panne durable ne fait jamais tourner la file en rond. */
export const CV_AUTO_PARSE_MAX_DEFERRALS = 20

type ErrorLike = {
  status?: unknown
  statusCode?: unknown
  getStatus?: () => unknown
  headers?: unknown
  response?: unknown
  cause?: unknown
}

function statusOf(err: ErrorLike): number | null {
  const fromGetter = typeof err.getStatus === 'function' ? err.getStatus() : undefined
  for (const candidate of [fromGetter, err.status, err.statusCode]) {
    if (typeof candidate === 'number') return candidate
  }
  return null
}

function headerValue(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null
  const getter = (headers as { get?: unknown }).get
  if (typeof getter === 'function') {
    const value: unknown = getter.call(headers, name)
    if (typeof value === 'string') return value
  }
  for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
    if (key.toLowerCase() === name && (typeof value === 'string' || typeof value === 'number')) return String(value)
  }
  return null
}

function retryAfterMs(raw: string, now: number): number | null {
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const at = Date.parse(trimmed)
  if (Number.isNaN(at)) return null
  return Math.max(0, at - now)
}

/**
 * #3935 — si `err` est une SATURATION du service IA (429 ou 503, sur l'erreur
 * ou dans sa chaîne `cause`), le délai à respecter avant de relire : le
 * `retry-after` s'il est lisible (secondes ou date HTTP, plafonné), sinon
 * {@link CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS}. `null` = pas une saturation,
 * la file la traite comme un échec ordinaire.
 */
export function iaBackoffDelayMs(err: unknown, now: number = Date.now()): number | null {
  let saturated = false
  let retryAfter: number | null = null
  let current: unknown = err
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const e = current as ErrorLike
    const status = statusOf(e)
    if (status === 429 || status === 503) saturated = true
    if (retryAfter === null) {
      const response = e.response && typeof e.response === 'object' ? (e.response as { headers?: unknown }) : null
      const raw = headerValue(e.headers, 'retry-after') ?? headerValue(response?.headers, 'retry-after')
      if (raw !== null) retryAfter = retryAfterMs(raw, now)
    }
    current = e.cause
  }
  if (!saturated) return null
  if (retryAfter === null) return CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS
  return Math.min(retryAfter, CV_AUTO_PARSE_IA_MAX_BACKOFF_MS)
}

/**
 * Un job par FICHE : deux mises en file de la même fiche (l'import, puis un
 * clic « Lire les CV non lus » pendant qu'elle attend) partagent le même job.
 * ⚠️ AUCUN `:` — BullMQ l'utilise comme séparateur de clés Redis.
 */
export function cvAutoParseJobId(consultantId: string): string {
  return `cv-auto-parse-${consultantId}`
}
