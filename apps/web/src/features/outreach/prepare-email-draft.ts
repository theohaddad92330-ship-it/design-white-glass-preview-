import { contactsApi } from '@/features/contacts/api'
import { apiFetch } from '@/lib/api'

/**
 * #3702 — L'ÉTAPE E-MAIL D'UNE SÉQUENCE DOIT AVOIR UN BROUILLON RELISIBLE.
 *
 * Cause racine (mesurée en prod le 10/10) : le serveur fige à la création le
 * `contacts.email_message` du contact dans l'étape (`buildStepPayload`,
 * `outreach.service.ts`) — et ce champ n'est écrit que par une analyse de
 * compte. Un contact sans analyse (créé à la main, importé) n'avait donc
 * JAMAIS de brouillon : « Aperçu non chargé », « Aucun brouillon préparé »,
 * centre « À valider » vide, et la délégation inatteignable.
 *
 * Correctif : avant de créer la séquence, on prépare le brouillon avec le
 * moteur de rédaction DÉJÀ servi au composer (`POST /ia/message`, crédit zéro)
 * et on l'enregistre sur le contact (`PATCH /contacts/:id/email-draft` —
 * « préparé, jamais envoyé »). Aucun second moteur. Rien ne part : le message
 * naît `needs_review` dans « À valider ».
 *
 * Un brouillon déjà écrit n'est JAMAIS écrasé (correction humaine gagne).
 * Un échec se NOMME (`reason`) : l'écran le dit, jamais un pense-bête muet.
 */
export type DraftFailureReason = 'no_email' | 'generation_failed' | 'save_failed'

type DraftOutcome =
  | { contactId: string; status: 'existing' | 'prepared' }
  | { contactId: string; status: 'failed'; reason: DraftFailureReason }

type DraftContact = {
  id: string
  email: string | null
  /** `undefined` = non chargé ici (fiche contact) ≠ `null` = chargé, aucun brouillon. */
  email_message?: { subject?: string | null; body?: string | null } | null
}

const hasBody = (message: DraftContact['email_message']): boolean => Boolean(message?.body?.trim())

export async function prepareEmailDraft(contact: DraftContact, objective?: string | null): Promise<DraftOutcome> {
  if (hasBody(contact.email_message)) return { contactId: contact.id, status: 'existing' }
  if (!contact.email) return { contactId: contact.id, status: 'failed', reason: 'no_email' }

  // « Je ne sais pas » n'est pas « il n'y a rien » : on lit avant d'écrire.
  if (contact.email_message === undefined) {
    try {
      const fresh = await contactsApi.getOne(contact.id)
      if (hasBody(fresh.email_message)) return { contactId: contact.id, status: 'existing' }
    } catch {
      return { contactId: contact.id, status: 'failed', reason: 'generation_failed' }
    }
  }

  let subject: string | undefined
  let body: string
  try {
    const res = await apiFetch<
      { success: boolean; data?: { subject?: string; body?: string } },
      { contactId: string; channel: 'email'; context?: string }
    >({
      path: '/ia/message',
      method: 'POST',
      body: { contactId: contact.id, channel: 'email', context: objective?.trim() || undefined },
    })
    if (!res?.success || !res.data?.body?.trim()) {
      return { contactId: contact.id, status: 'failed', reason: 'generation_failed' }
    }
    subject = res.data.subject?.trim() || undefined
    body = res.data.body
  } catch {
    return { contactId: contact.id, status: 'failed', reason: 'generation_failed' }
  }

  try {
    await contactsApi.saveEmailDraft(contact.id, { subject, body })
  } catch {
    return { contactId: contact.id, status: 'failed', reason: 'save_failed' }
  }
  return { contactId: contact.id, status: 'prepared' }
}
