import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Contact, ContactSendChannel } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api'
import { accountKeys } from '@/features/accounts/api'
import { contactAccountQueryKeys } from '@/features/contacts/lib/contactAccountKeys'
import {
  contactKeys,
  contactsApi,
  type ContactEmailDraft,
  type SendContactEmailResponse,
} from '@/features/contacts/api'

/**
 * Variables accepted by the send mutation: the contact, plus — optionally — the
 * `draft` the seller just reviewed on screen. Passing the contact itself (not
 * `{ contact }`) keeps existing call sites (`mutate(contact)`, `variables?.id`)
 * working unchanged.
 */
type SendContactEmailVariables = Contact & {
  draft?: ContactEmailDraft
  channel?: ContactSendChannel
  /** #3699.6 — les documents choisis par le commercial, rien d'autre. */
  attachmentAssetIds?: readonly string[]
  /** #4546.5 — la boîte connectée choisie parmi les siennes ; absente = la boîte par défaut. */
  senderConnectionId?: string
}

/**
 * Palier 1 « Envoie l'email » — sends the contact's drafted email to their
 * address via Resend (backend `POST /contacts/:id/send-email`).
 *
 * On success: stamps `email_sent_at` into the cached contact + invalidates the
 * account's contact list so the "Envoyé" state sticks, and toasts. On error the
 * business reason (no_email / no_draft / already_sent / send_failed /
 * suppressed) is translated — the raw server sentence is only a last resort.
 */
export function useSendContactEmail() {
  const qc = useQueryClient()

  return useMutation<SendContactEmailResponse, Error, SendContactEmailVariables>({
    mutationKey: ['contacts', 'send-email'],
    mutationFn: contact =>
      // #3699.6 — la liste n'est passée que si la personne a CHOISI des pièces : l'appel sans pièce reste celui d'avant.
      // #4546.5 — idem pour la boîte désignée.
      contact.senderConnectionId
        ? contactsApi.sendEmail(
            contact.id,
            contact.draft,
            contact.channel,
            contact.attachmentAssetIds ?? [],
            contact.senderConnectionId,
          )
        : contact.attachmentAssetIds?.length
          ? contactsApi.sendEmail(contact.id, contact.draft, contact.channel, contact.attachmentAssetIds)
          : contactsApi.sendEmail(contact.id, contact.draft, contact.channel),
    onSuccess: (result, contact) => {
      qc.setQueryData<Contact>(contactKeys.detail(contact.id), current =>
        current ? { ...current, email_sent_at: result.email_sent_at } : current,
      )
      // #1473 — sans compte, il n'y a rien à rafraîchir de ce côté.
      for (const key of contactAccountQueryKeys(contact.account_id)) qc.invalidateQueries({ queryKey: key })
      // Le premier email ouvre la cadence multi-touch (Drive #8) côté serveur —
      // rafraîchir le calendrier de relance affiché sur la fiche.
      qc.invalidateQueries({ queryKey: contactKeys.cadence(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.sendability(contact.id) })
      toast.success(i18n.t('contacts:email.sentTo', { name: contact.full_name }))
    },
    onError: (err, contact) => {
      // #3699.5 — l'état de la tentative a changé côté serveur (incertaine, en cours) :
      // l'écran le relit au lieu de proposer un renvoi qu'il ne doit pas proposer.
      qc.invalidateQueries({ queryKey: contactKeys.sendability(contact.id) })
      toast.error(i18n.t('contacts:email.failedTo', { name: contact.full_name }), {
        description: sendEmailErrorDescription(err),
      })
    },
  })
}

/**
 * Turns a send failure into a sentence a seller understands. The server tags
 * business failures with a stable `code`; anything else falls back to the
 * server message, then to a generic retry line. Never surfaces a bare code.
 */
export function sendEmailErrorDescription(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined
  switch (code) {
    case 'suppressed':
      return i18n.t('contacts:email.error.suppressed')
    case 'already_sent':
      return i18n.t('contacts:email.error.alreadySent')
    case 'no_email':
      return i18n.t('contacts:email.error.noEmail')
    case 'no_draft':
      return i18n.t('contacts:email.error.noDraft')
    case 'send_failed':
      return i18n.t('contacts:email.error.sendFailed')
    case 'send_uncertain':
      return i18n.t('contacts:email.error.sendUncertain')
    case 'send_in_progress':
      return i18n.t('contacts:email.error.sendInProgress')
    case 'mailbox_unavailable':
      return i18n.t('contacts:email.error.mailboxUnavailable')
    case 'demo_send_blocked':
      return i18n.t('contacts:email.error.demoSendBlocked')
    // #3699.6 — le serveur NOMME la pièce qui bloque (droit d'usage, taille…) : sa phrase prime.
    case 'attachment_refused':
      return error instanceof Error && error.message ? error.message : i18n.t('contacts:email.error.attachmentRefused')
    default:
      return error instanceof Error && error.message ? error.message : i18n.t('contacts:email.error.unknown')
  }
}
