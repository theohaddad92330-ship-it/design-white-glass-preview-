import {
  contactCoordinates,
  type Contact,
  refuseEmailAttachments,
  type ContactRankingResponse,
  type ContactSendAttachmentProof,
  type ContactSendability,
  type ContactSendChannel,
} from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  SelectField,
  Text,
  TooltipButton,
} from '@bellum/ui'
import { Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useContactCadence } from '@/features/contacts/hooks/useContactCadence'
import { useContactRanking } from '@/features/contacts/hooks/useContactRanking'
import { useContactSendability } from '@/features/contacts/hooks/useContactSendability'
import { useResolveSendAttempt } from '@/features/contacts/hooks/useResolveSendAttempt'
import { useSendContactEmail } from '@/features/contacts/hooks/useSendContactEmail'
import { useMailboxSenders } from '@/features/mailbox/api'
import { formatBytes } from '@/features/expenses/presentation'
import { EngagementAttachmentPicker } from './EngagementAttachmentPicker'
import { SendReceipt } from './SendReceipt'

type EngagementSendEmailProps = {
  contact: Contact
  subject: string
  text: string
}

/** Pourquoi « Envoyer » est indisponible — clé i18n `message.cannotSend.<reason>`. */
type BlockedReason = 'noEmail' | 'noDraft' | 'suppressed' | 'sendInProgress' | 'homonym_conflict' | 'entity_mismatch'

/**
 * « Envoyer » depuis le module d'approche.
 *
 * Envoie EXACTEMENT le brouillon affiché (`subject` + `text` de ce message-là),
 * pas le `email_message` stocké en base : le panneau génère à la volée et ne
 * persiste rien, donc envoyer l'état serveur enverrait un autre texte que celui
 * que le commercial vient de relire. Le corps relu part dans la requête et le
 * serveur le persiste dans le même write que `email_sent_at`.
 *
 * L'envoi est irréversible et sortant → confirmation explicite (expéditeur réel,
 * adresse de réponse, destinataire, objet, corps relu — #3699.1) avant tout appel
 * réseau.
 */
export function EngagementSendEmailAction({ contact, subject, text }: EngagementSendEmailProps) {
  const { t } = useTranslation('engagement')
  // #3710.5 — la confirmation et l'envoi appartiennent à UN contact (son `id`) : si le panneau
  // reste monté et passe à un autre contact, ni la confirmation ouverte ni le reçu « envoyé »
  // du précédent ne le suivent.
  const [confirmFor, setConfirmFor] = useState<string | null>(null)
  const confirmOpen = confirmFor === contact.id
  const setConfirmOpen = (open: boolean) => setConfirmFor(open ? contact.id : null)
  // L'envoi réussi ici fait foi même si le `contact` porté par le panneau vient
  // d'une liste que le cache n'a pas encore rafraîchie.
  // #3710.5 + #3699 — l'envoi réussi appartient à UN contact : le reçu (date, canal, expéditeur) ne suit pas un autre contact.
  const [sent, setSent] = useState<{
    contactId: string
    at: string
    via: { channel: ContactSendChannel; from: string | null }
    attachments: ContactSendAttachmentProof[]
  } | null>(null)
  const sentAt = sent?.contactId === contact.id ? sent.at : null
  // #3699 — d'où et par où le message vient de partir, tels que le serveur les a rapportés.
  const sentVia = sent?.contactId === contact.id ? sent.via : null
  // #3699.4 — le canal CHOISI par la personne ; `null` = pas encore choisi.
  const [channelChoice, setChannelChoice] = useState<ContactSendChannel | null>(null)
  // #3699.6 — les pièces CHOISIES par la personne, pour CE contact (#3710.5) : rien n'est coché d'office.
  const [attachmentChoice, setAttachmentChoice] = useState<{ contactId: string; ids: string[] }>({
    contactId: contact.id,
    ids: [],
  })
  const chosenIds = attachmentChoice.contactId === contact.id ? attachmentChoice.ids : []
  const sendEmail = useSendContactEmail()
  const alreadySent = sentAt ?? contact.email_sent_at ?? null
  const body = text.trim()
  const pending = sendEmail.isPending
  // #3694.8 — même source de vérité que `ContactRecommendationAuthorizationCard`
  // (déjà chargée ailleurs dans l'app pour ce compte : requête mise en cache,
  // aucun appel réseau de plus). La rédaction reste possible ; seul l'ENVOI se bloque.
  const ranking = useContactRanking(contact.account_id ?? '', {})
  const localBlock = sendBlockedReason(contact, body) ?? identityDoubtBlockedReason(contact, ranking.data)
  // L'opt-out ne vit que côté serveur : on ne l'interroge que si un envoi est
  // encore plausible à l'écran (rien de local ne bloque déjà, pas déjà envoyé).
  // Après l'envoi on la relit aussi : c'est elle qui porte la dernière tentative
  // (canal, expéditeur réel) pour le compte rendu d'un envoi plus ancien.
  const sendability = useContactSendability(contact.id, !localBlock || Boolean(alreadySent))

  // #4546.5 — l'expéditeur se choisit parmi SES boîtes qui peuvent envoyer. Lue seulement quand la fenêtre est ouverte
  // et que la boîte connectée est prête : sinon aucun appel de plus.
  const senders = useMailboxSenders(confirmOpen && sendability.data?.mailbox?.can_send === true)
  const sendableSenders = useMemo(() => (senders.data ?? []).filter(sender => sender.capabilities.send), [senders.data])
  // Le choix appartient à UN contact (#3710.5) ; avec plusieurs boîtes rien n'est choisi d'office (jamais un expéditeur
  // deviné) — la personne désigne, l'écran dit l'adresse qui part.
  const [senderChoice, setSenderChoice] = useState<{ contactId: string; connectionId: string } | null>(null)
  const chosenSender =
    senderChoice?.contactId === contact.id
      ? (sendableSenders.find(sender => sender.connectionId === senderChoice.connectionId) ?? null)
      : null
  const mustChooseSender = sendableSenders.length > 1
  const senderLabel = (address: string | null, index: number) =>
    address ?? t('message.confirm.senderUnnamed', { n: index + 1 })

  // #2714 — le compte rendu APRÈS l'envoi : `nature="verified"`, Bellum a
  // réellement expédié via Resend (c73_fait_ne_porte_pas_preuve_denvoi).
  if (alreadySent) {
    const lastSend = sendability.data?.last_send
    return (
      <EmailSentReceipt
        contact={contact}
        sentAt={alreadySent}
        via={
          sentVia ??
          (lastSend?.channel
            ? { channel: lastSend.channel, from: lastSend.from, observedInSent: Boolean(lastSend.observed_at) }
            : null)
        }
        attachments={(sent?.contactId === contact.id ? sent.attachments : lastSend?.attachments) ?? []}
      />
    )
  }

  // #3699.5 — une tentative INCERTAINE bloque le renvoi : on propose de vérifier, jamais de renvoyer.
  if (sendability.data?.reason === 'send_uncertain') {
    return <UncertainSend contactId={contact.id} />
  }

  const blockedReason = localBlock ?? serverBlockedReason(sendability.data)

  // #3699.4 — la boîte connectée du commercial, dite telle quelle. Prête ⇒ proposée
  // par défaut ; connectée SANS droit d'envoi ⇒ aucun canal choisi à sa place.
  const mailbox = sendability.data?.mailbox
  const mailboxReady = mailbox?.can_send === true
  const mailboxStuck = mailbox?.connected === true && !mailbox.can_send
  const channel: ContactSendChannel | null =
    channelChoice ?? (mailboxReady ? 'mailbox' : mailboxStuck ? null : 'workspace')
  const spaceSender = sendability.data?.sender ?? null
  // #4546.5 — avec plusieurs boîtes, « De » dit l'adresse CHOISIE (rien tant qu'aucune n'est désignée).
  const pickingSender = channel === 'mailbox' && mustChooseSender
  const chosenAddress = chosenSender ? senderLabel(chosenSender.address, sendableSenders.indexOf(chosenSender)) : null
  const senderMissing = pickingSender && !chosenSender
  const fromValue = pickingSender ? chosenAddress : channel === 'mailbox' ? (mailbox?.address ?? null) : spaceSender
  const isDemo = sendability.data?.demo === true
  // #3699.6 — ce qui part avec le message : les documents choisis, et rien d'autre.
  const attachable = sendability.data?.attachable_documents ?? []
  const chosenDocuments = attachable.filter(document => chosenIds.includes(document.asset_id))
  const attachmentRefusal = refuseEmailAttachments(
    chosenDocuments.map(document => ({ contentType: document.content_type, byteSize: document.byte_size })),
  )
  const toggleAttachment = (assetId: string) =>
    setAttachmentChoice({
      contactId: contact.id,
      ids: chosenIds.includes(assetId) ? chosenIds.filter(id => id !== assetId) : [...chosenIds, assetId],
    })

  const confirmSend = () => {
    if (pending || !channel || isDemo || attachmentRefusal || senderMissing) return // garde anti double-envoi (le serveur re-garde : réservation atomique)
    sendEmail.mutate(
      {
        ...contact,
        draft: { subject: subject.trim() || undefined, body },
        channel,
        attachmentAssetIds: chosenDocuments.map(document => document.asset_id),
        // #4546.5 — la boîte désignée ; avec une seule boîte l'appel reste celui d'avant.
        ...(pickingSender && chosenSender ? { senderConnectionId: chosenSender.connectionId } : {}),
      },
      {
        onSuccess: result => {
          setSent({
            contactId: contact.id,
            at: result.email_sent_at,
            via: { channel: result.channel, from: result.sent_from },
            attachments: result.attachments ?? [],
          })
          setConfirmOpen(false)
        },
        onError: () => setConfirmOpen(false),
      },
    )
  }

  return (
    <>
      <TooltipButton
        tooltip={blockedReason ? t(`message.cannotSend.${blockedReason}`) : t('message.send')}
        variant="ghost"
        size="xs"
        icon={Send}
        iconClassName="size-3.5"
        aria-label={t('message.send')}
        className="text-[var(--bellum-text-muted)] text-xs rounded-full"
        disabled={Boolean(blockedReason) || pending}
        onClick={() => setConfirmOpen(true)}
      >
        {pending ? t('message.sending') : t('message.send')}
      </TooltipButton>

      <Dialog open={confirmOpen} onOpenChange={open => (pending ? undefined : setConfirmOpen(open))}>
        <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
              <Send className="size-4" aria-hidden />
              {t('message.confirm.title')}
            </DialogTitle>
            <DialogDescription className="text-[var(--bellum-text-secondary)]">
              {t('message.confirm.description')}
            </DialogDescription>
          </DialogHeader>

          {isDemo && (
            <Text
              size="sm"
              color="text-[var(--bellum-text-secondary)]"
              className="block rounded-lg border border-[var(--bellum-border)] p-3"
            >
              {t('message.confirm.demo')}
            </Text>
          )}
          {(mailboxReady || mailboxStuck) && (
            <div className="space-y-2">
              <span className="text-sm text-[var(--bellum-text-muted)]">{t('message.confirm.channel.label')}</span>
              {mailboxStuck && (
                <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="block">
                  {t('message.confirm.channel.mailboxStuck', { address: mailbox?.address ?? '' })}
                </Text>
              )}
              <FilterChips
                ariaLabel={t('message.confirm.channel.label')}
                options={[
                  ...(mailboxReady
                    ? [
                        {
                          value: 'mailbox' as const,
                          label: pickingSender
                            ? chosenAddress
                              ? t('message.confirm.channel.mailbox', { address: chosenAddress })
                              : t('message.confirm.channel.mailboxToPick')
                            : t('message.confirm.channel.mailbox', { address: mailbox?.address ?? '' }),
                        },
                      ]
                    : []),
                  {
                    value: 'workspace' as const,
                    label: t('message.confirm.channel.workspace', { address: spaceSender ?? '' }),
                  },
                ]}
                value={channel}
                onChange={next => (pending ? undefined : setChannelChoice(next))}
              />
            </div>
          )}

          {pickingSender && (
            // #4546.5 — plusieurs boîtes : on désigne celle d'où le message part, aucune n'est choisie à la place de la personne.
            <div className="space-y-1">
              <label htmlFor="engagement-sender" className="text-sm text-[var(--bellum-text-muted)]">
                {t('message.confirm.senderPick')}
              </label>
              <SelectField
                id="engagement-sender"
                value={chosenSender?.connectionId}
                onChange={connectionId =>
                  pending ? undefined : setSenderChoice({ contactId: contact.id, connectionId })
                }
                options={sendableSenders.map((sender, index) => ({
                  value: sender.connectionId,
                  label: senderLabel(sender.address, index),
                }))}
                placeholder={t('message.confirm.senderPlaceholder')}
                size="sm"
                className="min-w-0 max-w-full"
              />
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
            <ConfirmRow
              label={t('message.confirm.from')}
              value={
                channel
                  ? (fromValue ?? t(senderMissing ? 'message.confirm.fromToChoose' : 'message.confirm.fromUnknown'))
                  : t('message.confirm.fromToChoose')
              }
            />
            {channel === 'workspace' && sendability.data?.reply_to && sendability.data.reply_to !== spaceSender && (
              <ConfirmRow label={t('message.confirm.replyTo')} value={sendability.data.reply_to} />
            )}
            {channel === 'mailbox' && (
              // #4179.3 — l'envoi par l'API n'ajoute PAS la signature du client de messagerie :
              // on le dit avant, jamais après.
              <ConfirmRow label={t('message.confirm.signature')} value={t('message.confirm.noSignature')} />
            )}
            <ConfirmRow label={t('message.confirm.to')} value={`${contact.full_name} · ${contact.email ?? ''}`} />
            <ConfirmRow label={t('message.confirm.subject')} value={subject.trim() || t('message.confirm.noSubject')} />
            <ConfirmRow
              label={t('message.confirm.attachments')}
              value={
                chosenDocuments.length
                  ? chosenDocuments
                      .map(document => `${document.file_name} (${formatBytes(document.byte_size)})`)
                      .join(', ')
                  : t('message.confirm.noAttachments')
              }
            />
          </div>
          <EngagementAttachmentPicker
            documents={attachable}
            selected={chosenIds}
            onToggle={toggleAttachment}
            disabled={pending}
          />
          <div className="space-y-1">
            <span className="text-sm text-[var(--bellum-text-muted)]">{t('message.confirm.body')}</span>
            <Text
              size="sm"
              color="text-[var(--bellum-text-primary)]"
              className="block max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[var(--bellum-border)] p-3"
            >
              {body}
            </Text>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={pending}>
              {t('common:actions.cancel')}
            </Button>
            <Button
              onClick={confirmSend}
              disabled={pending || !channel || isDemo || Boolean(attachmentRefusal) || senderMissing}
            >
              {pending ? t('message.sending') : t('message.confirm.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="shrink-0 text-[var(--bellum-text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-[var(--bellum-text-primary)]">{value}</span>
    </div>
  )
}

/**
 * #2714 — le compte rendu après envoi (retour SKAIZen Group, 22/09/2026) :
 * « quand on envoie un mail, manque d'un compte rendu après avoir envoyé ».
 * Avant : un simple « Envoyé le … », rien de plus — le récapitulatif existait
 * du mauvais côté du geste (avant l'envoi, dans le dialogue de confirmation).
 *
 * S'appuie sur `SendReceipt` (nature="verified", partagé avec la déclaration
 * LinkedIn — GA-26 : un composant, pas un par canal) et y ajoute deux lignes
 * propres à l'email : l'ACTION D'ORIGINE (ce message individuel, jamais une
 * campagne — `SendReceipt` seul ne le distingue pas) et la PROCHAINE ÉTAPE de
 * cadence : `useSendContactEmail` invalide déjà `contactKeys.cadence`, donc
 * `next_step` reflète le calendrier FRAIS, jamais une supposition ; `null` ⇒
 * silence, jamais une relance inventée.
 *
 * Jamais le CORPS du message : c'est la demande distincte de l'issue sœur
 * #2716 (relire le message expédié), hors périmètre ici.
 */
function EmailSentReceipt({
  contact,
  sentAt,
  via,
  attachments,
}: {
  contact: Contact
  sentAt: string
  /** #4179.2 — `observedInSent` : le message a été LU dans la boîte (sinon on ne promet pas « éléments envoyés »). */
  via: { channel: ContactSendChannel; from: string | null; observedInSent?: boolean } | null
  /** #3699.6 — les pièces parties : nom et taille (l'empreinte reste dans la preuve, pas à l'écran). */
  attachments: readonly ContactSendAttachmentProof[]
}) {
  const { t, i18n } = useTranslation('engagement')
  const { data: cadence } = useContactCadence(contact.id)
  const nextStep = cadence?.next_step

  return (
    <div data-testid="engagement-sent-summary" className="space-y-1.5">
      <SendReceipt
        contact={contact}
        channel="email"
        sentAt={sentAt}
        nature={via?.channel === 'mailbox' ? 'sent_mailbox' : 'handed_off'}
      />
      <ConfirmRow
        label={t('message.sentSummary.from')}
        value={via?.from ?? t('message.sentSummary.fromIndividualMessage')}
      />
      {via?.channel === 'mailbox' && via.observedInSent && (
        <ConfirmRow label={t('message.sentSummary.findIt')} value={t('message.sentSummary.findItMailbox')} />
      )}
      {attachments.length > 0 && (
        <ConfirmRow
          label={t('message.sentSummary.attachments')}
          value={attachments.map(attachment => `${attachment.name} (${formatBytes(attachment.byte_size)})`).join(', ')}
        />
      )}
      {/* #3699.5 — « livré » ou « lu » ne s'écrit jamais ici : seul un rebond CONNU s'ajoute. */}
      {contact.email_bounced_at && (
        <ConfirmRow label={t('message.sentSummary.bounced')} value={t('message.sentSummary.bouncedValue')} />
      )}
      {nextStep && (
        <Text
          size="xs"
          color="text-[var(--bellum-text-secondary)]"
          className="block border-t border-[var(--bellum-border)] pt-1.5"
        >
          {t('message.sentSummary.nextStep', {
            label: nextStep.label,
            date: formatDueDate(nextStep.due_date, i18n.language),
          })}
        </Text>
      )}
    </div>
  )
}

/** Ce que le client sait sans appeler personne : pas d'adresse, pas de corps. */
function sendBlockedReason(contact: Contact, body: string): BlockedReason | null {
  if (!contactCoordinates(contact).can_prepare_email) return 'noEmail'
  if (!body) return 'noDraft'
  return null
}

/**
 * #3694.8 — « identité ambiguë empêche un envoi aveugle ». Même porte que le
 * CLASSEMENT (#2160.60, `contact-eligibility.ts`) : un homonyme non résolu
 * (`homonym_conflict`) ou une entité hors périmètre du compte
 * (`entity_mismatch`) reste bloquant pour L'ENVOI tant que personne n'a levé
 * le doute sur CETTE fiche, pour CETTE raison précise (symétrique de
 * `isAuthorizedFor`, jamais une autorisation posée pour l'autre raison).
 */
export function identityDoubtBlockedReason(
  contact: Contact,
  ranking: ContactRankingResponse | undefined,
): 'homonym_conflict' | 'entity_mismatch' | null {
  const reason = ranking?.excluded.find(x => x.contact_id === contact.id)?.reason
  if (reason !== 'homonym_conflict' && reason !== 'entity_mismatch') return null
  if (contact.recommendation_authorized_reason === reason) return null
  return reason
}

/**
 * Ce que SEUL le serveur sait — le désabonnement (table `email_suppression`).
 * Tant que la réponse n'est pas là on n'affirme rien : le bouton reste actif et
 * le serveur refuse in extremis. On ne dit JAMAIS « désinscrit » par défaut.
 */
function serverBlockedReason(sendability: ContactSendability | undefined): BlockedReason | null {
  if (!sendability || sendability.can_send) return null
  if (sendability.reason === 'suppressed') return 'suppressed'
  if (sendability.reason === 'no_email') return 'noEmail'
  if (sendability.reason === 'send_in_progress') return 'sendInProgress'
  return null
}

/** #2714 — même patron que `ContactCadenceCard.tsx:9` (jour/mois court/année),
 *  sur une date calendaire (`YYYY-MM-DD`, sans heure). */
function formatDueDate(date: string, language: string): string {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * #3699.5 — après une tentative d'envoi INCERTAINE (la réponse du transport n'est
 * jamais arrivée), le message est peut-être parti. On ne propose PAS de renvoyer :
 * on demande de vérifier la boîte d'envoi, puis on enregistre ce que la personne a
 * constaté. « Le message y est » est un geste déclaratif, jamais une preuve d'envoi.
 */
function UncertainSend({ contactId }: { contactId: string }) {
  const { t } = useTranslation('engagement')
  const resolve = useResolveSendAttempt(contactId)
  return (
    <div
      data-testid="engagement-send-uncertain"
      className="space-y-2 rounded-lg border border-[var(--bellum-border)] p-2.5"
    >
      <Text size="sm" color="text-[var(--bellum-text-primary)]" className="block">
        {t('message.uncertain.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
        {t('message.uncertain.help')}
      </Text>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate('not_sent')}>
          {t('message.uncertain.notSent')}
        </Button>
        <Button variant="outline" disabled={resolve.isPending} onClick={() => resolve.mutate('sent')}>
          {t('message.uncertain.sent')}
        </Button>
      </div>
    </div>
  )
}
