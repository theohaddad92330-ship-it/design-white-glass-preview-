import { SESSION_REVOKED_CODE } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { readSupportReference, rememberSupportReference } from '@/lib/support-reference'

/**
 * A failed API call. Stays a plain `Error` with the same `message`/`cause` as
 * before (callers relying on either keep working); it just also carries the
 * HTTP `status` and, when the endpoint provides one, the machine-readable
 * `code` from the response body — so a caller can localise a business failure
 * instead of echoing the server's French sentence.
 *
 * Lives in its own module (not `api.ts`) so the pure response-parsing below can
 * be unit-tested: the test suite globally mocks `@/lib/api`, which would
 * otherwise replace `extractError` with a stub and make it untestable.
 */
/** Le serveur a répondu « ces jetons ne valent plus rien ». Tout le reste —
 *  429, 5xx, coupure réseau — dit seulement qu'il n'a pas pu répondre, ce qui
 *  n'invalide aucune session. Vit ici, et pas dans `api.ts`, parce que la suite
 *  de tests mocke globalement `@/lib/api` : la logique pure doit rester testable.
 */
export function sessionIsDead(status: number): boolean {
  return status === 401 || status === 403
}

/**
 * R15-7 (15/09/2026) — cette 401 dit-elle « appareil RÉVOQUÉ » ?
 *
 * Une révocation (plafond d'appareils, ou « déconnecter cet appareil » depuis
 * un autre) n'est pas un jeton périmé : aucun refresh ne la lève. On la
 * reconnaît au CODE machine, jamais à la phrase. Lit une COPIE du corps : la
 * réponse d'origine reste lisible par `extractError`.
 */
export async function isSessionRevokedResponse(res: Response): Promise<boolean> {
  if (res.status !== 401) return false
  try {
    const body: unknown = await res.clone().json()
    return (body as { code?: unknown } | null)?.code === SESSION_REVOKED_CODE
  } catch {
    return false
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code?: string
  /**
   * Le CORPS JSON de la réponse d'erreur, tel quel.
   *
   * ⚠️ Ajouté le 30/08 pour une raison précise : certaines erreurs ne sont pas
   * une phrase, ce sont des DONNÉES. Le 409 du verrou optimiste de
   * l'organigramme porte les deux versions ET la liste de ce qui s'est
   * intercalé (`intervening`) — « voici ce qui a changé pendant que tu
   * corrigeais ». `extractError` n'en gardait que `message` et `code` : le
   * client jetait le diff, et un verrou optimiste dont on jette le diff est
   * une perte de saisie déguisée en message d'erreur.
   *
   * Reste `unknown` : chaque appelant le REVALIDE contre son propre contrat
   * (ici `orgGraphConflictSchema`). Un corps d'erreur n'est jamais une forme
   * garantie — c'est ce que le serveur a eu le temps d'écrire.
   */
  readonly details?: unknown

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message, { cause: status })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/** #4833 — les champs refusés par la validation (premier segment du chemin), sans doublon. */
export function validationIssueFields(body: unknown): string[] {
  const fields = readValidationIssues(body).map(issue => String(issue.path[0] ?? ''))
  return [...new Set(fields.filter(field => field.length > 0))]
}

// NestJS errors serialise as `{ message, error }`, where `message` is a string
// (HttpException) or string[] (ValidationPipe). Endpoints that need the client
// to branch on the reason also put a stable `code` alongside it.
export async function extractError(res: Response): Promise<{ message: string; code?: string; details?: unknown }> {
  try {
    const body = await res.json()
    const code = typeof body?.code === 'string' && body.code.length > 0 ? body.code : undefined
    // Le corps entier voyage avec l'erreur : certaines réponses portent des
    // données que l'écran doit rendre (le diff d'un 409), pas seulement une
    // phrase. Voir le docbloc de `ApiError.details`.
    const details = body
    // #2442.5 — la référence support voyage dans le corps de toute réponse
    // d'erreur (`AllExceptionsFilter`). On la retient ici, une fois, pour les
    // écrans d'échec : ils n'ont pas tous accès à l'erreur qui les a causés.
    rememberSupportReference(readSupportReference(body))
    // #4833 — le filtre de validation de l'API renvoie `message: 'Validation failed'` + `errors` (les issues zod) :
    // l'écran nomme le champ et la règle, il n'affiche pas un « Validation failed » nu.
    // `describeValidationIssues` vérifie lui-même le `Validation failed` et rend `undefined` sinon.
    const named = describeValidationIssues(body)
    if (named) return { message: named, code, details }
    if (typeof body?.message === 'string' && body.message.length > 0) return { message: body.message, code, details }
    if (Array.isArray(body?.message) && typeof body.message[0] === 'string') {
      return { message: body.message[0], code, details }
    }
    if (typeof body?.error === 'string' && body.error.length > 0) return { message: body.error, code, details }
    return { message: noReasonGiven(res.status), code, details }
  } catch {
    // body not JSON
  }
  return { message: noReasonGiven(res.status) }
}

type ValidationIssue = { path: readonly (string | number)[]; message: string }

/** Les refus de validation d'un corps d'erreur (`errors` du filtre Zod), ou `[]` si le corps n'en porte pas. */
export function readValidationIssues(body: unknown): ValidationIssue[] {
  const errors = (body as { errors?: unknown } | null)?.errors
  if (!Array.isArray(errors)) return []
  return errors.flatMap((entry: unknown): ValidationIssue[] => {
    const { path, message } = (entry ?? {}) as { path?: unknown; message?: unknown }
    if (!Array.isArray(path) || typeof message !== 'string' || message.length === 0) return []
    return [{ path: path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number'), message }]
  })
}

/** « champ : règle ; champ : règle » pour un « Validation failed » qui porte ses détails ; `undefined` sinon. */
function describeValidationIssues(body: unknown): string | undefined {
  if ((body as { message?: unknown } | null)?.message !== 'Validation failed') return undefined
  const issues = readValidationIssues(body)
  if (issues.length === 0) return undefined
  return issues
    .map(issue => (issue.path.length > 0 ? `${issue.path.join('.')} : ${issue.message}` : issue.message))
    .join(' ; ')
}

/**
 * What to say when the server failed and told us nothing.
 *
 * This used to be the literal string `'API error'` — untranslated, in a French
 * UI, and phrased as though it were a diagnosis. It is not one: it is the
 * absence of a diagnosis. A seller who read « Échec de l'enrichissement de
 * Gilles Denoyel · API error » learned only that something broke.
 *
 * So the sentence now admits exactly that, in the user's language, and carries
 * the HTTP status — the one thing we genuinely know. A support ticket saying
 * « erreur 502 » is actionable; « API error » never was.
 *
 * Endpoints are expected to explain themselves (`{message, code}`); reaching
 * this line means one didn't, which is a bug in that endpoint, not a state to
 * paper over.
 */
function noReasonGiven(status: number): string {
  return i18n.t('common:errors.noReasonGiven', { status })
}
