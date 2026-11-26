import { SCHEDULABLE_DRAFT_CHANNELS, type MessageDraftChannel } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EntityAvatar,
  Text,
  TYPE_SCALE,
} from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Archive, ArrowLeft, Copy } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/locale'
import { outreachMessagesApi } from '@/features/outreach/api'
import {
  useCreateDraft,
  useDraftReviewActions,
  useDraftVersions,
  useMailboxStatus,
  useRejectSequenceMessage,
  useScheduleSendActions,
  useScheduledSends,
  useSendMail,
} from '../../api'
import type { DraftRow } from '../../lib/mailbox-views'
import { SchedulePicker } from '../ScheduledSendsPanel'
import { DeclareSentAction } from './DeclareSentAction'
import { MailReaderFrame } from '../shared/MailWorkspace'

/**
 * Théo B m2-brouillons — le VOLET d'un brouillon, à droite de « Messages à relire » : état et origine, le destinataire
 * en clair, le texte, « Relire & valider » (la relecture, une case de confirmation puis « Valider le brouillon » —
 * valider n'envoie RIEN), puis, une fois validé, les gestes d'envoi que le commercial garde : envoyer sur son clic,
 * déposer dans sa boîte, programmer. Le texte du brouillon est celui que
 * Bellum a déjà en base ; le corps d'un mail REÇU n'est jamais ici.
 */
export function DraftDetail({
  row,
  timeZone,
  onBack,
}: {
  row: DraftRow | null
  timeZone: string
  /** Mobile : revenir à la liste (« ← Retour aux messages »). */
  onBack: () => void
}) {
  const { t } = useTranslation('mailbox')
  const { t: tOutreach } = useTranslation('outreach')
  const queryClient = useQueryClient()
  const status = useMailboxStatus().data
  const { validate, archive } = useDraftReviewActions()
  const createDraft = useCreateDraft()
  const send = useSendMail()
  const { schedule } = useScheduleSendActions()
  const [reviewing, setReviewing] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [batchId] = useState(() => crypto.randomUUID())

  const isDraft = row?.source === 'draft'
  const channel = (row?.channel ?? 'email') as MessageDraftChannel
  const versions = useDraftVersions(row?.contactId ?? '', channel, Boolean(row && isDraft))
  const alreadyScheduled = Boolean(
    useScheduledSends().data?.items.some(item => item.versionId === row?.id && item.status === 'scheduled'),
  )

  const refreshSequences = () => void queryClient.invalidateQueries({ queryKey: ['outreach'] })
  const approve = useMutation({
    mutationFn: () =>
      outreachMessagesApi.approve({ items: [{ id: row?.id ?? '', version: row?.outreachVersion ?? 1 }] }),
    onSuccess: refreshSequences,
  })
  const reject = useRejectSequenceMessage()

  if (!row) return null
  const date = (iso: string) => formatDateTime(iso) ?? ''
  const subject = row.subject ?? t('scheduled.noSubject')
  const blocked = row.blockers.length > 0
  const sendable = isDraft && row.validated && (SCHEDULABLE_DRAFT_CHANNELS as readonly string[]).includes(row.channel)
  const recipient = row.contactEmail

  const close = () => {
    setReviewing(false)
    setScheduling(false)
    onBack()
  }
  const copy = () => {
    void navigator.clipboard?.writeText(row.subject ? `${row.subject}\n\n${row.body}` : row.body)
    toast.success(t('m2.detail.copied'))
  }
  const doArchive = () => {
    if (isDraft) archive.mutate(row.id, { onSuccess: close })
    else reject.mutate(row.id, { onSuccess: close })
  }
  const doValidate = () => {
    if (isDraft) validate.mutate(row.id, { onSuccess: () => setReviewing(false) })
    else approve.mutate(undefined, { onSuccess: () => setReviewing(false) })
  }
  const sendNow = () => {
    if (!recipient) return
    send.mutate({
      batchId,
      mode: 'send',
      items: [{ to: recipient, subject: row.subject ?? '', body: row.body }],
    })
  }
  const deposit = () => {
    if (!recipient) return
    createDraft.mutate({
      to: recipient,
      cc: [],
      subject: row.subject ?? '',
      body: row.body,
      appendSignature: true,
      documentIds: [],
    })
  }
  const outcome = send.data?.outcomes[0] ?? null

  return (
    <MailReaderFrame label={t('m2.detail.aria')}>
      <button
        type="button"
        onClick={close}
        className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-medium text-[var(--bellum-text-accent)] md:hidden"
      >
        <ArrowLeft className="size-4 shrink-0" aria-hidden />
        {t('reader.back')}
      </button>

      {/* Barre du brouillon : son état, son origine ; copier le message, l'archiver (ou refuser l'envoi de séquence). */}
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex flex-wrap items-center gap-2">
          <Badge variant={row.validated ? 'success' : 'primary'}>
            {t(row.validated ? 'm2.drafts.status.validated' : 'm2.drafts.status.toReview')}
          </Badge>
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t(`m2.drafts.origin.${row.origin}`)}
          </Text>
        </Box>
        <Box className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label={t('m2.detail.copyMessage')}
            title={t('m2.detail.copyMessage')}
            onClick={copy}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
          {isDraft ? (
            <Button
              size="sm"
              variant="ghost"
              className="min-h-11 min-w-11"
              aria-label={t('m2.detail.archive')}
              title={t('m2.detail.archive')}
              disabled={archive.isPending}
              onClick={doArchive}
            >
              <Archive className="size-4" aria-hidden />
            </Button>
          ) : null}
        </Box>
      </Box>

      {/* Théo B m2-brouillons.A3 — pourquoi ce destinataire est refusé, dit AVANT de valider. */}
      {blocked ? (
        <Box role="alert" className="rounded-control bg-[var(--danger-soft-bg)] p-3">
          <Text size="sm" weight="medium" className="text-[var(--danger-soft-text)]">
            {t('m2.detail.blockedTitle')}
          </Text>
          <ul className="mt-1 list-disc pl-5">
            {row.blockers.map(blocker => (
              <li key={blocker}>
                <Text size="sm">{tOutreach(`approval.blocker.${blocker}`, { defaultValue: blocker })}</Text>
              </li>
            ))}
          </ul>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('m2.detail.blockedHint')}
          </Text>
        </Box>
      ) : null}

      <Text element="h2" className={`${TYPE_SCALE.pageTitle} break-words`}>
        {subject}
      </Text>

      <Box className="flex flex-wrap items-center gap-3">
        <EntityAvatar name={row.contactName ?? '?'} size="sm" />
        <Box className="flex min-w-0 flex-1 flex-col">
          <Text size="sm" weight="semibold" className="truncate">
            {row.contactName ?? t('m2.detail.unknownContact')}
          </Text>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {recipient ? t('m2.detail.to', { address: recipient }) : t('m2.detail.noAddress')}
          </Text>
        </Box>
        {/* Théo B m2-brouillons.R2 — « Modifier » rouvre LE MÊME brouillon sur la préparation du contact. */}
        <Button asChild size="sm" variant="outline" className="min-h-11">
          <Link to="/contacts/$id" params={{ id: row.contactId }}>
            {t('m2.detail.edit')}
          </Link>
        </Button>
      </Box>

      <Box className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {row.accountName ? (
          <Text element="span" size="sm" weight="medium">
            {row.accountName}
          </Text>
        ) : null}
        <Link
          to="/contacts/$id"
          params={{ id: row.contactId }}
          className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
        >
          {t('m2.detail.contactCard')}
        </Link>
        {row.origin === 'sequence' && row.sequenceId ? (
          <Link
            to="/mailbox"
            search={{ vue: 'drafts', sequence: row.sequenceId }}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('m2.detail.sequenceAll')}
          </Link>
        ) : null}
      </Box>

      {/* Le texte du BROUILLON (préparé dans Bellum) — jamais le corps d'un mail reçu. */}
      <Text size="sm" className="whitespace-pre-wrap rounded-control bg-[var(--bellum-surface-2)] p-4">
        {row.body}
      </Text>

      {row.validated ? (
        <Text size="sm" weight="medium" className="text-[var(--success-soft-text)]">
          {t('m2.detail.validatedAt', { date: row.validatedAt ? date(row.validatedAt) : '' })}
        </Text>
      ) : null}

      <Box className="flex flex-wrap items-center gap-2 border-t border-[var(--bellum-border)] pt-4">
        {row.validated ? null : (
          <Button className="min-h-11" disabled={blocked} onClick={() => setReviewing(true)}>
            {t('m2.detail.review')}
          </Button>
        )}
        {/* Une fois validé : les gestes d'envoi que le commercial GARDE — rien ne part sans son clic. */}
        {sendable ? (
          <>
            <Button
              className="min-h-11"
              disabled={!recipient || !status?.capabilities.send || send.isPending}
              onClick={sendNow}
            >
              {t('m2.detail.sendNow')}
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={!recipient || !status?.capabilities.draft || createDraft.isPending}
              onClick={deposit}
            >
              {t('m2.detail.deposit')}
            </Button>
            {alreadyScheduled ? null : (
              <Button className="min-h-11" variant="outline" onClick={() => setScheduling(open => !open)}>
                {t('scheduled.actions.schedule')}
              </Button>
            )}
          </>
        ) : null}
        {!isDraft ? (
          <Button className="min-h-11" variant="outline" disabled={reject.isPending} onClick={doArchive}>
            {t('m2.detail.reject')}
          </Button>
        ) : null}
        <Button className="min-h-11" variant="ghost" onClick={copy}>
          {t('m2.detail.copy')}
        </Button>
      </Box>

      {/* #4418.1 — le commercial l'a envoyé LUI-MÊME : le geste déclaratif planifie J+3/J+6/J+9 et l'écran les dit. */}
      {row.contactId ? (
        <DeclareSentAction
          contactId={row.contactId}
          channel={row.channel.includes('linkedin') ? 'linkedin' : 'email'}
        />
      ) : null}

      {sendable ? (
        <Box className="flex flex-col gap-2">
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('m2.detail.sendNote', { address: status?.address ?? '' })}
          </Text>
          {scheduling ? (
            <SchedulePicker
              idPrefix={`m2-schedule-${row.id}`}
              timeZone={timeZone}
              initial=""
              confirmLabel={t('scheduled.actions.confirm')}
              pending={schedule.isPending}
              error={schedule.error}
              onClose={() => setScheduling(false)}
              onConfirm={scheduledAt =>
                schedule.mutate({ versionId: row.id, scheduledAt, timeZone }, { onSuccess: () => setScheduling(false) })
              }
            />
          ) : null}
          {createDraft.data ? (
            <Text size="sm" role="status">
              {t('draft.success')}
            </Text>
          ) : null}
          {outcome ? (
            <Text size="sm" role="status">
              {outcome.status === 'sent'
                ? t('draft.sendSuccess')
                : outcome.status === 'skipped' && outcome.reason === 'suppressed'
                  ? t('draft.skippedSuppressed')
                  : t('draft.skippedOther')}
            </Text>
          ) : null}
        </Box>
      ) : null}

      {/* Théo B m2-brouillons.N2 — l'expéditeur, la version, l'historique. */}
      <details className="rounded-control border border-[var(--bellum-border)] px-3 py-2">
        <summary className="min-h-11 cursor-pointer content-center text-sm font-medium">{t('m2.trace.title')}</summary>
        <Box className="flex flex-col gap-1 pb-2">
          <Text size="sm">{t('m2.trace.sender', { address: status?.address ?? t('m2.trace.senderUnknown') })}</Text>
          {isDraft ? (
            <ol className="flex flex-col gap-1">
              {[...(versions.data?.items ?? [])].reverse().map((version, index, all) => {
                const number = all.length - index
                const kind = version.editedBody
                  ? 'edited'
                  : version.usedStyleId || version.usedTemplateSource
                    ? 'styled'
                    : number === 1
                      ? 'prepared'
                      : 'rephrased'
                return (
                  <li key={version.id}>
                    <Text size="sm">
                      {t('m2.trace.version', { n: number })} · {t(`m2.trace.kind.${kind}`)} · {date(version.createdAt)}
                    </Text>
                  </li>
                )
              })}
            </ol>
          ) : (
            <Text size="sm">
              {t('m2.trace.version', { n: row.versionCount })} · {t('m2.trace.kind.sequence')} · {date(row.createdAt)}
            </Text>
          )}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t(isDraft ? 'm2.trace.personalDraft' : 'm2.trace.sequenceDraft')}
          </Text>
        </Box>
      </details>

      <ValidateDraftDialog
        open={reviewing}
        onOpenChange={setReviewing}
        recipient={recipient}
        sender={status?.address ?? null}
        subject={subject}
        body={row.body}
        blocked={blocked}
        pending={validate.isPending || approve.isPending}
        onValidate={doValidate}
      />
    </MailReaderFrame>
  )
}

/**
 * Théo B m2-brouillons.R3 — « Relire avant de valider » : le destinataire, l'expéditeur, l'objet et le texte relus,
 * une case de confirmation, puis « Valider le brouillon ». Valider n'envoie RIEN : l'envoi reste un clic à part.
 */
function ValidateDraftDialog({
  open,
  onOpenChange,
  recipient,
  sender,
  subject,
  body,
  blocked,
  pending,
  onValidate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  recipient: string | null
  sender: string | null
  subject: string
  body: string
  blocked: boolean
  pending: boolean
  onValidate: () => void
}) {
  const { t } = useTranslation('mailbox')
  const [confirmed, setConfirmed] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setConfirmed(false)
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('m2.validate.title')}</DialogTitle>
          <DialogDescription>{t('m2.detail.validateNote')}</DialogDescription>
        </DialogHeader>
        <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Box className="flex flex-col gap-0.5">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('m2.validate.to')}
            </Text>
            <Text size="sm" weight="semibold">
              {recipient ?? t('m2.detail.noAddress')}
            </Text>
          </Box>
          {sender ? (
            <Box className="flex flex-col gap-0.5">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('m2.validate.from')}
              </Text>
              <Text size="sm" weight="semibold">
                {sender}
              </Text>
            </Box>
          ) : null}
        </Box>
        <Text element="h3" size="sm" weight="semibold">
          {subject}
        </Text>
        <Text
          size="sm"
          className="max-h-[40dvh] overflow-y-auto whitespace-pre-wrap rounded-control bg-[var(--bellum-surface-2)] p-4"
        >
          {body}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('m2.validate.note')}
        </Text>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={event => setConfirmed(event.target.checked)}
            className="size-5"
          />
          {t('m2.detail.confirm')}
        </label>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t('m2.validate.back')}
          </Button>
          <Button className="min-h-11" disabled={!confirmed || blocked || pending} onClick={onValidate}>
            {t('m2.detail.validate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
