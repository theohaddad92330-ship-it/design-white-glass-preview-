import { apiFetch } from '@/lib/api'
import { ApiError } from '@/lib/api-error'

/**
 * #4042.8 — LA génération d'un e-mail pour UN contact (`POST /ia/message`, le générateur du composer), avec un
 * délai borné et une raison NOMMÉE à l'échec : recette prod du 12/10, le brouillon restait sur « Rédaction du
 * brouillon… » plus de 25 s sans jamais dire pourquoi. Un seul endroit (GA-26) pour la fenêtre « Préparer un
 * e-mail par personne » et la revue avant envoi.
 */
export type EmailGenerationFailure = 'timeout' | 'refused' | 'empty' | 'failed'

export class EmailGenerationError extends Error {
  readonly reason: EmailGenerationFailure
  /** La phrase du moteur quand il sait dire pourquoi (`message_refused`), sinon `null`. */
  readonly detail: string | null

  constructor(reason: EmailGenerationFailure, detail: string | null = null) {
    super(detail ?? reason)
    this.name = 'EmailGenerationError'
    this.reason = reason
    this.detail = detail
  }
}

/** Au-delà, la personne est prévenue que ça dépasse l'attendu (affichage), puis l'appel est abandonné. */
export const EMAIL_GENERATION_TIMEOUT_MS = 60_000

type GenerateOptions = { timeoutMs?: number; signal?: AbortSignal }

export async function generateContactEmail(
  contactId: string,
  options: GenerateOptions = {},
): Promise<{ subject: string; body: string }> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? EMAIL_GENERATION_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    const res = await apiFetch<
      { success: boolean; data?: { subject?: string; body?: string } },
      { contactId: string; channel: 'email' }
    >({ path: '/ia/message', method: 'POST', body: { contactId, channel: 'email' }, signal: controller.signal })
    const body = res?.data?.body
    if (!res?.success || !body?.trim()) throw new EmailGenerationError('empty')
    return { subject: res.data?.subject ?? '', body }
  } catch (error) {
    if (error instanceof EmailGenerationError) throw error
    if (timedOut) throw new EmailGenerationError('timeout')
    if (error instanceof ApiError && error.code?.startsWith('message_')) {
      throw new EmailGenerationError('refused', error.message)
    }
    throw new EmailGenerationError('failed')
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}

/** #4050.3 — combien d'e-mails se rédigent en même temps (au-delà, on risque le 429 du service IA). */
export const EMAIL_GENERATION_CONCURRENCY = 4

/**
 * #4050.3 — LA génération de N e-mails, en parallèle BORNÉ (un seul endroit, GA-26 : la revue d'envoi groupé et
 * « Préparer un e-mail par personne » l'appellent). Chaque mail reste écrit POUR sa personne et `onSettled` le
 * rend dès qu'il est prêt ; l'échec de l'un (429 compris) ne compte que pour lui.
 */
export async function generateContactEmailsBounded(
  contactIds: readonly string[],
  options: {
    concurrency?: number
    onSettled?: (contactId: string, result: { subject: string; body: string } | EmailGenerationError) => void
  } = {},
): Promise<void> {
  const queue = [...contactIds]
  const worker = async () => {
    for (let contactId = queue.shift(); contactId !== undefined; contactId = queue.shift()) {
      let result: { subject: string; body: string } | EmailGenerationError
      try {
        result = await generateContactEmail(contactId)
      } catch (error) {
        result = error instanceof EmailGenerationError ? error : new EmailGenerationError('failed')
      }
      options.onSettled?.(contactId, result)
    }
  }
  const width = Math.min(options.concurrency ?? EMAIL_GENERATION_CONCURRENCY, queue.length)
  await Promise.all(Array.from({ length: width }, worker))
}
