import { HttpError } from '@bellum/errors'

/**
 * #3458 — Pourquoi un message (mail, LinkedIn…) ne s'est PAS généré.
 *
 * `IaClient.generateMessage` lève une `TechnicalError` pour TOUT échec de
 * `/message/generate`, et le contrôleur la laissait filer au filtre générique :
 * un 500 « Internal server error » muet, y compris quand le moteur SAIT dire
 * pourquoi (packet de contexte insuffisant, brouillon rejeté : 422 avec une
 * phrase française). Même patron que `icebreaker-failure.ts` : on classe le
 * VRAI échec, on ne devine jamais un motif que le moteur n'a pas nommé.
 */
type MessageFailureReason = 'refused' | 'contact_not_found' | 'account_not_found' | 'upstream_error'

type MessageFailure = {
  reason: MessageFailureReason
  status: number
  message: string
  detail?: string
}

export const MESSAGE_FAILURE_MESSAGES = {
  contact_not_found: 'Ce contact est introuvable — il a peut-être été supprimé ou déplacé.',
  account_not_found: 'Le compte de ce contact est introuvable — il a peut-être été supprimé ou n’est plus accessible.',
  upstream_error: 'Le service de génération est temporairement indisponible. Réessaie dans un instant.',
} as const

/**
 * #4458 (Louis, tri Sentry 22/10/2026) — le niveau de journal d'un échec. Un
 * REFUS du moteur (brouillon rejeté, contexte insuffisant : il dit pourquoi,
 * l'écran le relaie) est un signal métier : `warn`, pas une exception Sentry.
 */
export function messageFailureLogLevel(reason: MessageFailureReason): 'warn' | 'error' {
  return reason === 'refused' ? 'warn' : 'error'
}

function findHttpError(err: unknown): HttpError | undefined {
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && !seen.has(current)) {
    seen.add(current)
    if (current instanceof HttpError) return current
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

/** La phrase d'un refus du moteur : `detail` texte (garde de contexte / brouillon) ou `{ user_message }` (erreur modèle typée). */
function readRefusal(body: string): string | undefined {
  try {
    const detail = (JSON.parse(body) as { detail?: unknown } | null)?.detail
    if (typeof detail === 'string' && detail.trim()) return detail.trim()
    if (detail && typeof detail === 'object') {
      const { user_message: userMessage, message } = detail as { user_message?: unknown; message?: unknown }
      const phrase = typeof userMessage === 'string' ? userMessage : message
      if (typeof phrase === 'string' && phrase.trim()) return phrase.trim()
    }
  } catch {
    // corps non JSON : pas de raison nommée
  }
  return undefined
}

export function classifyMessageFailure(err: unknown): MessageFailure {
  const httpError = findHttpError(err)
  if (httpError?.status === 422) {
    const phrase = readRefusal(httpError.body)
    if (phrase) return { reason: 'refused', status: 422, message: phrase }
  }
  if (httpError?.status === 404) {
    // #4609 — le moteur dit CE qu'il n'a pas trouvé (`ownership.py` : « Contact not found » / « Account not found »).
    // Un 404 sans cette phrase (« Not Found » d'une route absente) n'est PAS un contact disparu : panne du moteur.
    const missing = readRefusal(httpError.body)
    if (missing === 'Account not found') {
      return { reason: 'account_not_found', status: 404, message: MESSAGE_FAILURE_MESSAGES.account_not_found }
    }
    if (missing === 'Contact not found') {
      return { reason: 'contact_not_found', status: 404, message: MESSAGE_FAILURE_MESSAGES.contact_not_found }
    }
  }
  return {
    reason: 'upstream_error',
    status: 503,
    message: MESSAGE_FAILURE_MESSAGES.upstream_error,
    detail: httpError?.body ? httpError.body.slice(0, 200) : err instanceof Error ? err.message : undefined,
  }
}
