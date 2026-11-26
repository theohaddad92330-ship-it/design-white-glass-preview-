import {
  EMAIL_ATTACHMENT_MAX_COUNT,
  type OutreachAsset,
  type OutreachAssetFile,
  refuseEmailAttachments,
} from '@bellum/contracts'
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
  Text,
  Textarea,
} from '@bellum/ui'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Paperclip, Send, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatBytes } from '@/features/expenses/presentation'
import { EmailGenerationError, generateContactEmailsBounded } from '@/features/contacts/lib/generateContactEmail'
import { useOutreachAssets } from '@/features/outreach-assets/hooks/useOutreachAssets'
import { contactKeys, contactsApi, type BulkSendEmailResponse, type BulkSendSkipReason } from '@/features/contacts/api'
import { useMailboxStatus } from '@/features/mailbox/api'
import { useContactSendability } from '@/features/contacts/hooks/useContactSendability'
import { sendEmailErrorDescription } from '@/features/contacts/hooks/useSendContactEmail'
import { ApiError } from '@/lib/api'
import { EstimatedBadge } from '@/components/primitives/EstimatedBadge'
import {
  addAttachment,
  buildReviewItems,
  editItem,
  itemState,
  markReviewed,
  removeAttachment,
  sendGate,
  setExcluded,
  withGeneratedDraft,
  withStoredDraft,
  type ReviewItem,
  type ReviewState,
} from '@/features/contacts/lib/bulkEmailReview'

type ReviewContact = {
  id: string
  full_name: string
  title?: string | null
  entity?: string | null
  email: string | null
  email_estimated_at?: string | null
}

type Outcome = { kind: 'sent' } | { kind: 'failed'; message: string; reason: BulkSendSkipReason }

type BulkEmailReviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: readonly ReviewContact[]
  /** #3701.9 — reçoit le résultat : l'appelant ne retire de la sélection que ce qui est PARTI. */
  onSent?: (result: BulkSendEmailResponse) => void
}

const STATE_VARIANT: Record<ReviewState, 'default' | 'secondary' | 'outline'> = {
  ready: 'secondary',
  modified: 'default',
  to_review: 'outline',
  excluded: 'outline',
  missing: 'outline',
  loading: 'outline',
}

/**
 * #4042 — « quand je clique sur envoyer le mail rédigé, je veux voir pour
 * CHAQUE personne le mail, pouvoir le modifier, ajouter des pièces jointes ; si
 * aucun n'est préparé, tu me les génères puis je les review 1 par 1 ».
 *
 * Rien de neuf côté serveur : le brouillon vient de la fiche (`email_message`),
 * la génération est celle de `PrepareContactsEmailDialog` (`POST /ia/message`),
 * les pièces sont les documents de la bibliothèque (limite unique des contrats),
 * et l'envoi est l'envoi INDIVIDUEL (`POST /contacts/:id/send-email`) — un mail
 * par personne, jamais un message à N destinataires. Il ne part qu'au clic
 * « Envoyer », après la revue, et seulement depuis la messagerie connectée du
 * commercial : sans elle, l'écran le dit et propose de la connecter.
 */
export function BulkEmailReviewDialog({ open, onOpenChange, contacts, onSent }: BulkEmailReviewDialogProps) {
  const { t } = useTranslation('contacts')
  const qc = useQueryClient()
  const [items, setItems] = useState<ReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [generatedCount, setGeneratedCount] = useState(0)
  const [generatingTotal, setGeneratingTotal] = useState(0)
  const [sending, setSending] = useState(false)
  const [outcomes, setOutcomes] = useState<Record<string, Outcome> | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const library = useOutreachAssets()
  const documents = useMemo(() => attachableLibrary(library.data ?? []), [library.data])

  const total = contacts.filter(contact => Boolean(contact.email)).length
  const withoutEmail = contacts.length - total

  // Ouverture : une revue neuve, puis la lecture du brouillon DÉPOSÉ de chaque personne.
  useEffect(() => {
    if (!open) return
    const initial = buildReviewItems(contacts)
    setItems(initial)
    setIndex(0)
    setOutcomes(null)
    setPickerOpen(false)
    let cancelled = false
    for (const item of initial) {
      void contactsApi
        .getOne(item.contactId)
        .then(contact => contact?.email_message ?? null)
        .catch(() => null)
        .then(draft => {
          if (!cancelled) setItems(current => withStoredDraft(current, item.contactId, draft))
        })
    }
    return () => {
      cancelled = true
    }
    // La revue se rouvre avec l'ouverture, pas à chaque rendu de la liste parente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const current = items[index]
  const sendability = useContactSendability(current?.contactId ?? '', open && Boolean(current))
  // #3702 (recette 14/10) — UNE source pour « la messagerie est-elle connectée » : le statut de la
  // boîte (celui de /actions/sequences), jamais la fiche d'envoi d'UN contact — qui n'en porte aucune
  // quand ce contact n'a pas d'e-mail, est déjà écrit ou supprimé, et lisait alors « non connectée ».
  const mailboxStatus = useMailboxStatus()
  const mailbox = mailboxStatus.data
  const mailboxReady = mailbox?.connected === true && mailbox.capabilities.send
  const mailboxStuck = mailbox?.connected === true && !mailbox.capabilities.send
  const demo = sendability.data?.demo === true
  const sendabilityKnown = mailbox !== undefined && sendability.data !== undefined

  const docById = useMemo(() => new Map(documents.map(doc => [doc.id, doc])), [documents])
  const refusalOf = useCallback(
    (item: ReviewItem) =>
      refuseEmailAttachments(
        item.attachmentIds.flatMap(id => {
          const file = docById.get(id)?.file
          return file ? [{ contentType: file.contentType, byteSize: file.byteSize }] : []
        }),
      ),
    [docById],
  )

  const gate = sendGate(items, {
    mailboxReady,
    demo,
    attachmentRefused: item => refusalOf(item) !== null,
  })

  const missing = items.filter(item => itemState(item) === 'missing')

  const goTo = (next: number) => {
    if (current) setItems(prev => markReviewed(prev, current.contactId))
    setIndex(Math.min(Math.max(next, 0), items.length - 1))
    setPickerOpen(false)
  }

  const generateMissing = async () => {
    if (generating || missing.length === 0) return
    setGenerating(true)
    setGeneratedCount(0)
    setGeneratingTotal(missing.length)
    let failed = 0
    // #4050.1 / #4050.3 — en parallèle BORNÉ (`generateContactEmailsBounded`, un seul endroit) : chaque mail reste écrit POUR sa personne,
    // s'affiche dès qu'il est prêt, et l'échec de l'un (429 compris) ne compte que pour lui.
    await generateContactEmailsBounded(
      missing.map(item => item.contactId),
      {
        onSettled: (contactId, result) => {
          // #4042.8 — délai borné : une génération qui ne revient pas compte comme un échec NOMMÉ.
          if (result instanceof EmailGenerationError) failed += 1
          else setItems(prev => withGeneratedDraft(prev, contactId, result))
          setGeneratedCount(count => count + 1)
        },
      },
    )
    setGenerating(false)
    if (failed > 0) toast.error(t('bulkReview.generateFailed', { count: failed }))
  }

  const handleSend = async () => {
    if (!gate.ok || sending) return
    setSending(true)
    const results: Record<string, Outcome> = {}
    const targets = items.filter(item => {
      const state = itemState(item)
      return state === 'ready' || state === 'modified'
    })
    // Un envoi PAR personne, séquentiel : l'échec de l'un ne touche pas les autres.
    for (const item of targets) {
      try {
        await contactsApi.sendEmail(
          item.contactId,
          { subject: item.subject.trim() || undefined, body: item.body },
          'mailbox',
          item.attachmentIds,
        )
        results[item.contactId] = { kind: 'sent' }
      } catch (error) {
        results[item.contactId] = {
          kind: 'failed',
          message: sendEmailErrorDescription(error),
          reason: error instanceof ApiError && error.code ? skipReasonOf(error.code) : 'send_failed',
        }
      }
    }
    setOutcomes(results)
    setSending(false)
    qc.invalidateQueries({ queryKey: contactKeys.list })
    qc.invalidateQueries({ queryKey: contactKeys.stats })
    const sentCount = Object.values(results).filter(outcome => outcome.kind === 'sent').length
    if (sentCount > 0) toast.success(t('bulkSend.sentCount', { count: sentCount }))
  }

  const handleClose = () => {
    if (sending) return
    onOpenChange(false)
    if (outcomes) {
      onSent?.({
        sent: Object.entries(outcomes)
          .filter(([, outcome]) => outcome.kind === 'sent')
          .map(([contactId]) => ({
            contact_id: contactId,
            sent_to: items.find(item => item.contactId === contactId)?.email ?? '',
          })),
        skipped: Object.entries(outcomes)
          .filter(([, outcome]) => outcome.kind === 'failed')
          .map(([contactId, outcome]) => ({
            contact_id: contactId,
            reason: outcome.kind === 'failed' ? outcome.reason : 'send_failed',
          })),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-2xl border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('bulkReview.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('bulkReview.description')}
          </DialogDescription>
        </DialogHeader>

        {outcomes ? (
          <ResultView items={items} outcomes={outcomes} />
        ) : items.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('bulkReview.noRecipients')}
          </Text>
        ) : (
          <Box className="flex flex-col gap-3">
            {sendabilityKnown && !mailboxReady && !demo && (
              <Box
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--bellum-warning)]/40 bg-[color-mix(in_srgb,var(--bellum-warning)_10%,transparent)] p-3"
              >
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {mailboxStuck
                    ? t('bulkReview.mailboxStuck', { address: mailbox?.address ?? '' })
                    : t('bulkReview.noMailbox')}
                </Text>
                <Button asChild variant="outline" size="sm">
                  <Link to="/integrations">{t('bulkReview.connectMailbox')}</Link>
                </Button>
              </Box>
            )}
            {demo && (
              <Text size="sm" role="status" className="rounded-md border border-[var(--bellum-border)] p-3">
                {t('bulkReview.demo')}
              </Text>
            )}
            {withoutEmail > 0 && (
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('bulkReview.withoutEmail', { count: withoutEmail })}
              </Text>
            )}

            {missing.length > 0 && (
              <Box className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3">
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('bulkReview.missing', { count: missing.length })}
                </Text>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={Sparkles}
                  disabled={generating}
                  onClick={() => void generateMissing()}
                >
                  {generating
                    ? t('bulkReview.generatingProgress', { done: generatedCount, total: generatingTotal })
                    : t('bulkReview.generate', { count: missing.length })}
                </Button>
              </Box>
            )}

            {current && (
              <PersonReview
                item={current}
                index={index}
                total={items.length}
                documents={documents}
                docById={docById}
                refusal={refusalOf(current)}
                pickerOpen={pickerOpen}
                onTogglePicker={() => setPickerOpen(value => !value)}
                disabled={sending}
                onEdit={change => setItems(prev => editItem(prev, current.contactId, change))}
                onToggleExcluded={() => setItems(prev => setExcluded(prev, current.contactId, !current.excluded))}
                onMarkReviewed={() => setItems(prev => markReviewed(prev, current.contactId))}
                onAttach={(assetId, target) =>
                  setItems(prev => addAttachment(prev, assetId, target === 'all' ? 'all' : [current.contactId]))
                }
                onDetach={assetId => setItems(prev => removeAttachment(prev, current.contactId, assetId))}
              />
            )}
          </Box>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {outcomes ? (
            <Button type="button" variant="default" size="sm" onClick={handleClose}>
              {t('common:actions.close')}
            </Button>
          ) : (
            <>
              <Box display="flex" className="items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={ChevronLeft}
                  onClick={() => goTo(index - 1)}
                  disabled={index <= 0 || sending}
                >
                  {t('bulkReview.previous')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={ChevronRight}
                  onClick={() => goTo(index + 1)}
                  disabled={index >= items.length - 1 || sending}
                >
                  {t('bulkReview.next')}
                </Button>
              </Box>
              <Box display="flex" className="flex-wrap items-center gap-2">
                {!gate.ok && items.length > 0 && (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t(`bulkReview.gate.${gate.reason}`)}
                  </Text>
                )}
                <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={sending}>
                  {t('common:actions.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="black"
                  size="sm"
                  icon={Send}
                  isLoading={sending}
                  disabled={!gate.ok}
                  onClick={() => void handleSend()}
                >
                  {sending ? t('bulkSend.sending') : t('bulkReview.send', { count: gate.ok ? gate.count : 0 })}
                </Button>
              </Box>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function skipReasonOf(code: string): BulkSendSkipReason {
  const known: readonly BulkSendSkipReason[] = [
    'suppressed',
    'already_sent',
    'no_email',
    'no_draft',
    'send_failed',
    'send_in_progress',
    'send_uncertain',
    'demo_send_blocked',
  ]
  return known.find(reason => reason === code) ?? 'send_failed'
}

/** Les documents de la bibliothèque qui ont un fichier : les seuls joignables. */
function attachableLibrary(assets: readonly OutreachAsset[]): (OutreachAsset & { file: OutreachAssetFile })[] {
  return assets.flatMap(asset => (asset.file ? [{ ...asset, file: asset.file }] : []))
}

type LibraryDocument = OutreachAsset & { file: OutreachAssetFile }

function PersonReview({
  item,
  index,
  total,
  documents,
  docById,
  refusal,
  pickerOpen,
  onTogglePicker,
  disabled,
  onEdit,
  onToggleExcluded,
  onMarkReviewed,
  onAttach,
  onDetach,
}: {
  item: ReviewItem
  index: number
  total: number
  documents: readonly LibraryDocument[]
  docById: ReadonlyMap<string, LibraryDocument>
  refusal: ReturnType<typeof refuseEmailAttachments>
  pickerOpen: boolean
  onTogglePicker: () => void
  disabled: boolean
  onEdit: (change: { subject?: string; body?: string }) => void
  onToggleExcluded: () => void
  onMarkReviewed: () => void
  onAttach: (assetId: string, target: 'one' | 'all') => void
  onDetach: (assetId: string) => void
}) {
  const { t } = useTranslation('contacts')
  const state = itemState(item)
  const editable = state !== 'loading' && state !== 'missing' && state !== 'excluded'
  const firstName = item.fullName.split(/\s+/)[0] ?? item.fullName

  return (
    <Box className="flex flex-col gap-3" data-testid="bulk-review-person">
      <Box display="flex" className="items-start justify-between gap-3">
        <Box className="min-w-0">
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('bulkReview.progress', { current: index + 1, total })}
          </Text>
          <Text size="sm" weight="medium" className="truncate text-[var(--bellum-text-primary)]">
            {item.fullName}
          </Text>
          <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
            {[item.title, item.entity].filter(Boolean).join(' · ') || t('prepareEmails.noRole')}
          </Text>
          <Text size="xs" className="truncate text-[var(--bellum-text-muted)]">
            {t('bulkReview.to')} {item.email}
          </Text>
          {/* #4986.1 — une adresse DEVINÉE par motif se badge jusque sur l'écran d'envoi (GA-412). */}
          {item.emailEstimatedAt ? <EstimatedBadge verifiedAt={item.emailEstimatedAt} /> : null}
        </Box>
        <Box display="flex" className="shrink-0 flex-col items-end gap-1.5">
          <Badge variant={STATE_VARIANT[state]}>{t(`bulkReview.state.${state}`)}</Badge>
          {state === 'to_review' && (
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onMarkReviewed}>
              {t('bulkReview.markReviewed')}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onToggleExcluded}>
            {item.excluded ? t('bulkReview.include') : t('bulkReview.exclude')}
          </Button>
        </Box>
      </Box>

      {state === 'loading' && (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('bulkReview.loading')}
        </Text>
      )}
      {state === 'missing' && (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('bulkReview.noneForPerson', { name: firstName })}
        </Text>
      )}

      {(editable || state === 'excluded') && (
        <Box className="flex flex-col gap-2">
          <input
            aria-label={t('prepareEmails.subjectLabel')}
            placeholder={t('prepareEmails.subjectLabel')}
            className="min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm disabled:opacity-60"
            value={item.subject}
            disabled={disabled || state === 'excluded'}
            onChange={event => onEdit({ subject: event.target.value })}
          />
          <Textarea
            aria-label={t('prepareEmails.bodyLabel')}
            value={item.body}
            disabled={disabled || state === 'excluded'}
            onChange={event => onEdit({ body: event.target.value })}
            rows={9}
          />

          <Box className="flex flex-col gap-1.5">
            <Box display="flex" className="flex-wrap items-center gap-1.5">
              {item.attachmentIds.map(id => {
                const doc = docById.get(id)
                return (
                  <Badge key={id} variant="secondary" className="max-w-[240px] gap-1">
                    <Paperclip className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{doc ? doc.file.fileName : id}</span>
                    {doc ? <span className="shrink-0">({formatBytes(doc.file.byteSize)})</span> : null}
                    <button
                      type="button"
                      aria-label={t('bulkReview.attachments.remove', { name: doc?.file.fileName ?? id })}
                      className="shrink-0 rounded-sm p-0.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                      disabled={disabled || state === 'excluded'}
                      onClick={() => onDetach(id)}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </Badge>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={Paperclip}
                aria-expanded={pickerOpen}
                disabled={disabled || state === 'excluded'}
                onClick={onTogglePicker}
              >
                {t('bulkReview.attachments.add')}
              </Button>
            </Box>
            {refusal && (
              <Text size="xs" role="alert" className="text-[var(--bellum-text-primary)]">
                {t(`bulkReview.attachments.refusal.${refusal}`, { count: EMAIL_ATTACHMENT_MAX_COUNT })}
              </Text>
            )}
            {pickerOpen && (
              <ul className="divide-y divide-border/60 rounded-md border border-[var(--bellum-border)]">
                {documents.length === 0 && (
                  <li className="px-3 py-2">
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t('bulkReview.attachments.empty')}
                    </Text>
                  </li>
                )}
                {documents.map(doc => {
                  const blocked = doc.usageRights !== 'always'
                  const already = item.attachmentIds.includes(doc.id)
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <Text size="sm" className="block truncate text-[var(--bellum-text-primary)]">
                          {doc.title}
                        </Text>
                        <Text size="xs" className="block truncate text-[var(--bellum-text-muted)]">
                          {doc.file.fileName} · {formatBytes(doc.file.byteSize)}
                          {blocked ? ` · ${t('bulkReview.attachments.afterInterest')}` : ''}
                        </Text>
                      </span>
                      <Box display="flex" className="gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={blocked || already}
                          onClick={() => onAttach(doc.id, 'one')}
                        >
                          {t('bulkReview.attachments.toThis')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={blocked}
                          onClick={() => onAttach(doc.id, 'all')}
                        >
                          {t('bulkReview.attachments.toAll')}
                        </Button>
                      </Box>
                    </li>
                  )
                })}
              </ul>
            )}
          </Box>
        </Box>
      )}
    </Box>
  )
}

function ResultView({ items, outcomes }: { items: readonly ReviewItem[]; outcomes: Record<string, Outcome> }) {
  const { t } = useTranslation('contacts')
  const rows = items.filter(item => outcomes[item.contactId])
  const sent = rows.filter(item => outcomes[item.contactId]?.kind === 'sent').length
  return (
    <Box className="flex flex-col gap-2" data-testid="bulk-review-result">
      <Text size="sm" weight="medium">
        {t('bulkReview.result', { sent, total: rows.length })}
      </Text>
      <ul className="divide-y divide-border/60 rounded-md border border-[var(--bellum-border)]">
        {rows.map(item => {
          const outcome = outcomes[item.contactId]
          return (
            <li key={item.contactId} className="flex items-center justify-between gap-2 px-3 py-2">
              <Text size="sm" className="truncate">
                {item.fullName} · {item.email}
              </Text>
              <Text size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
                {outcome?.kind === 'failed' ? outcome.message : t('bulkReview.sentOne')}
              </Text>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}
