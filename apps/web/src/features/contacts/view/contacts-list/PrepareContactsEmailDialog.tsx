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
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ContactEmailDraftMailbox } from '@bellum/contracts'
import { mailboxToolName } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  EmailGenerationError,
  generateContactEmailsBounded,
  type EmailGenerationFailure,
} from '@/features/contacts/lib/generateContactEmail'
import { useSaveContactEmailDraft } from '@/features/contacts/hooks/useSaveContactEmailDraft'

type PrepareContact = { id: string; full_name: string; title: string | null; email: string | null }

type DraftState =
  | { status: 'loading' }
  | { status: 'ready'; subject: string; body: string }
  | { status: 'error'; reason: EmailGenerationFailure; detail: string | null }

/** Au-delà, on dit que ça prend plus longtemps que prévu (l'appel est de toute façon borné). */
const SLOW_NOTICE_MS = 20_000

/**
 * #3942.2 — spec de Louis (#3942, 08/10) : « cibler un type de profil,
 * sélectionner toutes les personnes, un mail personnalisé par personne qu'il
 * valide ». Réutilise le MÊME générateur que le composer et l'échantillon de
 * campagne (`POST /ia/message`, crédit zéro — `campaign-sample.ts`) et le
 * MÊME dépôt « préparé, jamais envoyé » que la fiche contact
 * (`useSaveContactEmailDraft` → `PATCH /contacts/:id/email-draft`) : aucun
 * second composeur, aucun second statut (#3694).
 *
 * Un contact à la fois, relu et validé avant de passer au suivant — jamais
 * une validation groupée qui déposerait N brouillons sans qu'aucun n'ait été
 * relu individuellement.
 */
export function PrepareContactsEmailDialog({
  open,
  onOpenChange,
  contacts,
  onReviewWithAttachments,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: readonly PrepareContact[]
  /** #4042.8 — les pièces jointes se choisissent à l'envoi : ouvre la revue d'envoi (modifier + joindre). */
  onReviewWithAttachments?: () => void
}) {
  const { t } = useTranslation('contacts')
  const saveDraft = useSaveContactEmailDraft()
  const eligible = contacts.filter(contact => Boolean(contact.email))
  const withoutEmailCount = contacts.length - eligible.length

  const [index, setIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({})
  const [preparedIds, setPreparedIds] = useState<ReadonlySet<string>>(() => new Set())
  // #4412 — ce que chaque enregistrement a fait chez le fournisseur (la messagerie branchée), dit sur l'écran final.
  const [mailboxOutcomes, setMailboxOutcomes] = useState<Record<string, ContactEmailDraftMailbox>>({})

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setDrafts({})
    setPreparedIds(new Set())
    setMailboxOutcomes({})
  }, [open])

  const current = eligible[index]

  const settle = (contactId: string, result: { subject: string; body: string } | EmailGenerationError) =>
    setDrafts(prev => ({
      ...prev,
      [contactId]:
        result instanceof EmailGenerationError
          ? { status: 'error', reason: result.reason, detail: result.detail }
          : { status: 'ready', ...result },
    }))

  const generate = (contact: PrepareContact) => {
    setDrafts(prev => ({ ...prev, [contact.id]: { status: 'loading' } }))
    // #4042.8 — délai borné + raison nommée : jamais un spinner infini.
    void generateContactEmailsBounded([contact.id], { onSettled: settle })
  }

  // #4050.3 — TOUS les brouillons partent à l'ouverture, en parallèle borné (4) : le 2e est déjà prêt quand on
  // arrive dessus, au lieu d'attendre ~10 s par personne (recette M 12/10 : 3 contacts = 40 s).
  const eligibleKey = eligible.map(contact => contact.id).join(',')
  useEffect(() => {
    if (!open || eligibleKey === '') return
    const ids = eligibleKey.split(',')
    setDrafts(Object.fromEntries(ids.map(id => [id, { status: 'loading' } as DraftState])))
    void generateContactEmailsBounded(ids, { onSettled: settle })
  }, [open, eligibleKey])

  const draft = current ? drafts[current.id] : undefined
  const done = index >= eligible.length

  const updateDraft = (patch: Partial<{ subject: string; body: string }>) => {
    if (!current || draft?.status !== 'ready') return
    setDrafts(prev => ({ ...prev, [current.id]: { ...draft, ...patch } }))
  }

  const advance = () => setIndex(i => i + 1)

  const handleValidate = () => {
    if (!current || draft?.status !== 'ready') return
    saveDraft.mutate(
      { id: current.id, subject: draft.subject.trim() || undefined, body: draft.body },
      {
        onSuccess: saved => {
          setPreparedIds(prev => new Set([...prev, current.id]))
          // #4412 — absent (ancien serveur) : on n'affirme rien sur la boîte.
          if (saved.mailbox_draft) setMailboxOutcomes(prev => ({ ...prev, [current.id]: saved.mailbox_draft! }))
          advance()
        },
        onError: () => toast.error(t('prepareEmails.saveError', { name: current.full_name })),
      },
    )
  }

  const handleClose = () => {
    onOpenChange(false)
    if (preparedIds.size > 0) toast.success(t('prepareEmails.doneToast', { count: preparedIds.size }))
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? onOpenChange(true) : handleClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('prepareEmails.title')}</DialogTitle>
          <DialogDescription>{t('prepareEmails.description')}</DialogDescription>
        </DialogHeader>

        {eligible.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('prepareEmails.noEligible')}
          </Text>
        ) : done ? (
          <Box className="flex flex-col gap-2">
            <Text size="sm" weight="medium">
              {t('prepareEmails.summary', { count: preparedIds.size, total: eligible.length })}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('prepareEmails.neverAutoSend')}
            </Text>
            {eligible
              .filter(contact => mailboxOutcomes[contact.id])
              .map(contact => (
                <MailboxOutcomeLine key={contact.id} name={contact.full_name} outcome={mailboxOutcomes[contact.id]!} />
              ))}
          </Box>
        ) : (
          <Box className="flex flex-col gap-3">
            <Box display="flex" className="items-center justify-between">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('prepareEmails.progress', { current: index + 1, total: eligible.length })}
              </Text>
              {withoutEmailCount > 0 ? (
                <Badge variant="outline" className="text-xs">
                  {t('prepareEmails.excludedNoEmail', { count: withoutEmailCount })}
                </Badge>
              ) : null}
            </Box>

            <Box className="flex flex-col gap-0.5">
              <Text size="sm" weight="medium">
                {current?.full_name}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {current?.title ?? t('prepareEmails.noRole')}
              </Text>
            </Box>

            {!draft || draft.status === 'loading' ? (
              <GeneratingNotice key={current?.id} />
            ) : draft.status === 'error' ? (
              <Box className="flex flex-col items-start gap-2" role="alert">
                <Text size="sm" className="text-[var(--danger-soft-text)]">
                  {draft.reason === 'refused' && draft.detail
                    ? draft.detail
                    : t(`prepareEmails.generationError.${draft.reason === 'refused' ? 'failed' : draft.reason}`)}
                </Text>
                <Button type="button" variant="outline" size="sm" onClick={() => current && generate(current)}>
                  {t('prepareEmails.retry')}
                </Button>
              </Box>
            ) : (
              <Box className="flex flex-col gap-2">
                <input
                  aria-label={t('prepareEmails.subjectLabel')}
                  placeholder={t('prepareEmails.subjectLabel')}
                  className="min-w-0 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm"
                  value={draft.subject}
                  onChange={event => updateDraft({ subject: event.target.value })}
                />
                <Textarea
                  aria-label={t('prepareEmails.bodyLabel')}
                  value={draft.body}
                  onChange={event => updateDraft({ body: event.target.value })}
                  rows={8}
                />
              </Box>
            )}
          </Box>
        )}

        {eligible.length > 0 && onReviewWithAttachments ? (
          <Box className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] px-3 py-2">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('prepareEmails.attachmentsHint')}
            </Text>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false)
                onReviewWithAttachments()
              }}
            >
              {t('prepareEmails.attachmentsAction')}
            </Button>
          </Box>
        ) : null}

        <DialogFooter className="gap-2">
          {done || eligible.length === 0 ? (
            <Button type="button" variant="default" size="sm" onClick={handleClose}>
              {t('common:actions.close')}
            </Button>
          ) : (
            <>
              <Button type="button" variant="ghost" size="sm" icon={ChevronLeft} onClick={advance}>
                {t('prepareEmails.skip')}
              </Button>
              <Button
                type="button"
                variant="black"
                size="sm"
                icon={ChevronRight}
                disabled={draft?.status !== 'ready' || saveDraft.isPending}
                isLoading={saveDraft.isPending}
                onClick={handleValidate}
              >
                {t('prepareEmails.validate')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** « Rédaction du brouillon… », puis une phrase honnête quand ça dépasse l'attendu. */
function GeneratingNotice() {
  const { t } = useTranslation('contacts')
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [])
  return (
    <Box className="flex flex-col gap-1 text-[var(--bellum-text-secondary)]" role="status">
      <Box display="flex" className="items-center gap-2">
        <Sparkles className="size-3.5 shrink-0 animate-pulse" aria-hidden="true" />
        <Text size="sm">{t('prepareEmails.generating')}</Text>
      </Box>
      {slow ? <Text size="xs">{t('prepareEmails.generatingSlow')}</Text> : null}
    </Box>
  )
}

/** #4412 — la ligne qui dit, pour UN contact, où le brouillon existe : jamais un faux succès. */
function MailboxOutcomeLine({ name, outcome }: { name: string; outcome: ContactEmailDraftMailbox }) {
  const { t } = useTranslation('contacts')
  const provider = outcome.status === 'not_connected' ? null : outcome.provider
  const label = (provider ? mailboxToolName(provider) : null) ?? t('prepareEmails.mailbox.unknownProvider')
  return (
    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
      {name} — {outcome.status === 'created' ? t('prepareEmails.mailbox.created', { provider: label }) : null}
      {outcome.status === 'not_connected' ? (
        <>
          {t('prepareEmails.mailbox.notConnected')}{' '}
          <Link to="/integrations" className="underline underline-offset-2">
            {t('prepareEmails.mailbox.connect')}
          </Link>
        </>
      ) : null}
      {outcome.status === 'failed'
        ? t('prepareEmails.mailbox.failed', { provider: label, reason: outcome.reason })
        : null}
    </Text>
  )
}
