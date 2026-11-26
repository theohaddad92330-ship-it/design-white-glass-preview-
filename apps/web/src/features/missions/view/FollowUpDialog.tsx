import { MAX_REMINDERS, outstandingAmountCents, type InvoiceReadiness } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
  Textarea,
} from '@bellum/ui'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { overdueDaysAt } from '../collections'
import { formatDay, formatEuros, formatMonth } from '../money-format'

type FollowUpDraft = { to: string; subject: string; body: string }

/**
 * La relance que Laura RÉDIGE d'après la facture — jamais un champ vide (Louis 23/10).
 *
 * Aucune donnée n'est inventée : le contact et les montants sont ceux de la ligne ; un terme
 * absent (pas d'échéance, pas de montant) n'est pas écrit plutôt que deviné. Au-delà de
 * `MAX_REMINDERS` relances sans réponse, le texte ne répète pas la même demande au même
 * contact : il demande qui solliciter. Rien ne part : c'est le commercial qui envoie.
 */
function buildFollowUpDraft(row: InvoiceReadiness, now: Date, locale: string, t: TFunction): FollowUpDraft {
  const days = overdueDaysAt(row.dueOn, now)
  const outstanding = outstandingAmountCents(row)
  const reference = row.invoiceReference ?? formatMonth(row.periodMonth, locale)
  const escalate = row.remindersSent >= MAX_REMINDERS
  const facts = {
    reference,
    month: formatMonth(row.periodMonth, locale),
    amount: outstanding === null ? '' : formatEuros(outstanding, locale),
    due: row.dueOn ? formatDay(row.dueOn, locale) : '',
    days: days === null ? '' : days,
  }
  const situation =
    row.dueOn && days !== null && days > 0
      ? t('missions:collections.followUp.draft.overdue', facts)
      : row.dueOn
        ? t('missions:collections.followUp.draft.upcoming', facts)
        : t('missions:collections.followUp.draft.noDue', facts)
  const lines = [
    row.billingContactName
      ? t('missions:collections.followUp.draft.greeting', { name: row.billingContactName })
      : t('missions:collections.followUp.draft.greetingNoName'),
    '',
    situation,
    outstanding === null ? '' : t('missions:collections.followUp.draft.amount', facts),
    escalate ? t('missions:collections.followUp.draft.escalate') : t('missions:collections.followUp.draft.ask'),
    '',
    t('missions:collections.followUp.draft.thanks'),
  ]
  return {
    to: row.billingContactName ?? '',
    subject: t('missions:collections.followUp.draft.subject', facts),
    body: lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n'),
  }
}

/**
 * « Suivre » — la fenêtre de relance d'une facture (Théo V22, Encaissements.A1) : le texte arrive
 * DÉJÀ rédigé, éditable, avec « Régénérer » ; « Consigner une relance faite » enregistre un geste
 * déclaratif (jamais une preuve d'envoi, c31) ; « Ouvrir dans ma messagerie » ouvre le brouillon
 * chez toi — il n'envoie rien.
 */
export function FollowUpDialog({
  row,
  now,
  locale,
  canWrite,
  pending,
  onRecordReminder,
  onClose,
}: {
  row: InvoiceReadiness
  now: Date
  locale: string
  canWrite: boolean
  pending: boolean
  onRecordReminder: () => void
  onClose: () => void
}) {
  const { t } = useTranslation('missions')
  const [draft, setDraft] = useState(() => buildFollowUpDraft(row, now, locale, t))
  const escalate = row.remindersSent >= MAX_REMINDERS
  const mailto = `mailto:${draft.to.includes('@') ? encodeURIComponent(draft.to) : ''}?subject=${encodeURIComponent(
    draft.subject,
  )}&body=${encodeURIComponent(draft.body)}`

  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('collections.followUp.close')} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('collections.followUp.title', {
              reference: row.invoiceReference ?? formatMonth(row.periodMonth, locale),
            })}
          </DialogTitle>
          <DialogDescription>{row.accountName ?? t('collections.unknownAccountReason')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          <Box className="rounded-md border border-border bg-card/50 p-3">
            <Text size="sm" weight="medium" className="block">
              {escalate
                ? t('collections.followUp.escalateTitle', { count: row.remindersSent })
                : t('collections.followUp.draftTitle')}
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground">
              {escalate ? t('collections.followUp.escalateBody') : t('collections.followUp.draftBody')}
            </Text>
          </Box>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.followUp.to')}
            </Text>
            <Input value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.followUp.subject')}
            </Text>
            <Input value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })} />
          </label>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.followUp.message')}
            </Text>
            <Textarea
              rows={9}
              value={draft.body}
              onChange={event => setDraft({ ...draft, body: event.target.value })}
            />
          </label>
          <Button variant="outline" size="sm" onClick={() => setDraft(buildFollowUpDraft(row, now, locale, t))}>
            {t('collections.followUp.regenerate')}
          </Button>
          <Text element="p" size="sm" color="text-muted-foreground">
            {row.remindersSent > 0
              ? row.lastReminderAt
                ? t('invoices.dialog.remindersLast', {
                    count: row.remindersSent,
                    date: formatDay(row.lastReminderAt, locale),
                  })
                : t('invoices.reminders', { count: row.remindersSent })
              : t('invoices.dialog.noReminder')}
          </Text>
        </Box>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('collections.followUp.cancel')}
          </Button>
          {canWrite ? (
            <Button variant="outline" disabled={pending} onClick={onRecordReminder}>
              {t('invoices.dialog.recordReminder')}
            </Button>
          ) : null}
          <a
            href={mailto}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-3 text-sm text-primary-foreground md:min-h-8"
          >
            {t('collections.followUp.openMail')}
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
