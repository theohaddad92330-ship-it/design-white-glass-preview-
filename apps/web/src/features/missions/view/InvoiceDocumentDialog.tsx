import { isDisputeOpen, outstandingAmountCents, type InvoiceReadiness } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useOpenDispute, useRecordPayment, useRecordReminder, useResolveDispute } from '../api'
import { formatDay, formatEuros, formatMonth } from '../money-format'
import { DisputeDialog } from './DisputeDialog'
import { InvoiceAttachments } from './InvoiceAttachments'
import { PaymentDialog } from './PaymentDialog'

const LINK_CLASS =
  'inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm hover:bg-card/50 md:min-h-8'

/**
 * LA FENÊTRE D'UNE FACTURE — « Ouvrir » sur une ligne de Factures (Théo V22, refonte du 23/10).
 *
 * ⚠️ #2564 — elle LIT, elle ne réécrit rien d'une pièce créée : le numéro, les lignes et les
 * avoirs viennent de l'outil branché. Une préparation montre ses trois étapes (préparée ≠ créée
 * ≠ envoyée) ; une facture « lue » dit sa source, une facture « déclarée » dit qui l'a déclarée
 * et qu'elle n'est pas confirmée (c80). Les gestes d'après-émission (règlement, litige, relance)
 * sont CEUX d'Encaissements — mêmes mutations, même invite : un geste, une seule forme (GA-26).
 *
 * Aucun montant TTC : le modèle ne porte que le HT, et on ne devine pas un taux de TVA.
 */
export function InvoiceDocumentDialog({
  row,
  badge,
  canReadFinance,
  canWriteFinance,
  demo,
  locale,
  onClose,
}: {
  row: InvoiceReadiness
  badge: ReactNode
  canReadFinance: boolean
  canWriteFinance: boolean
  demo: boolean
  locale: string
  onClose: () => void
}) {
  const { t } = useTranslation('missions')
  const recordPayment = useRecordPayment()
  const openDispute = useOpenDispute()
  const resolveDispute = useResolveDispute()
  const recordReminder = useRecordReminder()
  const [gesture, setGesture] = useState<'payment' | 'dispute' | null>(null)

  const draft = row.state === 'ready'
  const declared = row.state === 'invoiced_declared'
  const month = row.periodMonth.slice(0, 7)
  const amount = draft ? row.preparedAmountCents : row.invoicedAmountCents
  const outstanding = !draft && canReadFinance ? outstandingAmountCents(row) : null
  const disputed = isDisputeOpen(row)
  const pending =
    recordPayment.isPending || openDispute.isPending || resolveDispute.isPending || recordReminder.isPending
  const money = (cents: number | null | undefined, reason: string) =>
    !canReadFinance ? (
      <UnknownValue reason={t('readiness.financeHidden')} />
    ) : cents === null || cents === undefined ? (
      <UnknownValue reason={reason} />
    ) : (
      formatEuros(cents, locale)
    )

  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('invoices.dialog.close')} className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft
              ? t('invoices.dialog.preparedTitle', { account: row.accountName ?? '' })
              : (row.invoiceReference ?? t('invoices.noReference'))}
          </DialogTitle>
          <DialogDescription>
            {row.accountName ?? t('collections.unknownAccountReason')} · {formatMonth(row.periodMonth, locale)}
          </DialogDescription>
        </DialogHeader>

        <Box className="space-y-3">
          <Box className="flex flex-wrap items-center gap-2">{badge}</Box>

          {draft ? (
            // Préparée ≠ créée ≠ envoyée : les trois étapes, la première seule est ici.
            <ol className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label={t('invoices.dialog.lifecycle.label')}>
              {(['prepared', 'created', 'sent'] as const).map((step, index) => (
                <li
                  key={step}
                  aria-current={index === 0 ? 'step' : undefined}
                  className={`rounded-md border p-2 ${index === 0 ? 'border-primary bg-card' : 'border-border'}`}
                >
                  <Text element="span" size="sm" weight="medium" className="block">
                    {index + 1}. {t(`invoices.dialog.lifecycle.${step}`)}
                  </Text>
                  <Text element="span" size="xs" color="text-muted-foreground" className="block">
                    {t(`invoices.dialog.lifecycle.${step}Note`)}
                  </Text>
                </li>
              ))}
            </ol>
          ) : (
            <Box className="rounded-md border border-border bg-card/50 p-3">
              <Text size="sm" weight="medium" className="block">
                {declared ? t('invoices.dialog.sourceDeclaredTitle') : t('invoices.dialog.sourceReadTitle')}
              </Text>
              <Text element="p" size="xs" color="text-muted-foreground">
                {declared
                  ? row.invoicedByName
                    ? t('readiness.declaredBy', {
                        name: row.invoicedByName,
                        date: formatDay(row.invoicedAt ?? '', locale),
                      })
                    : t('readiness.declaredByUnknown')
                  : t('invoices.dialog.sourceReadBody')}
              </Text>
            </Box>
          )}

          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('invoices.dialog.mission')}>
              {row.missionLabel ?? <UnknownValue reason={t('collections.unknownMissionReason')} />}
            </Field>
            <Field label={t('invoices.dialog.order')}>
              {row.poNumber ?? <UnknownValue reason={t('invoices.dialog.orderUnknown')} />}
            </Field>
            <Field label={draft ? t('invoices.dialog.calculation') : t('invoices.dialog.createdOn')}>
              {draft ? (
                t('invoices.dialog.calculationBody', { month: formatMonth(row.periodMonth, locale) })
              ) : row.invoicedAt ? (
                formatDay(row.invoicedAt, locale)
              ) : (
                <UnknownValue reason={t('invoices.dialog.createdUnknown')} />
              )}
            </Field>
            <Field label={t('invoices.dialog.dueOn')}>
              {draft ? (
                t('invoices.dueAtCreation')
              ) : row.dueOn ? (
                formatDay(row.dueOn, locale)
              ) : (
                <UnknownValue reason={t('collections.noDueDate')} />
              )}
            </Field>
          </dl>

          {/* Les lignes : jours × tarif = montant HT. Un terme manquant se NOMME, jamais un zéro. */}
          <Box className="rounded-md border border-border p-3">
            <Text size="sm" weight="medium" className="block">
              {row.missionLabel ?? t('collections.unknownMissionReason')} — {formatMonth(row.periodMonth, locale)}
            </Text>
            <Text element="p" size="xs" color="text-muted-foreground">
              {row.days === null ? (
                <UnknownValue reason={t('invoices.dialog.daysUnknown')} />
              ) : (
                t('invoices.dialog.days', { count: row.days })
              )}
              {' × '}
              {money(row.dailyRateCents, t('invoices.dialog.rateUnknown'))}
              {' = '}
              {money(amount, t('collections.noAmount'))}
            </Text>
          </Box>

          <Box className="space-y-1" aria-label={t('invoices.dialog.totals')} role="group">
            <Total label={t('invoices.dialog.totalHt')} value={money(amount, t('collections.noAmount'))} strong />
            {!draft && row.paidAt ? (
              <Total
                label={t('invoices.dialog.settled')}
                value={money(row.paidAmountCents, t('invoices.dialog.settledUnknown'))}
              />
            ) : null}
            {!draft ? (
              <Total
                label={t('invoices.dialog.remaining')}
                value={money(outstanding, t('invoices.dialog.remainingUnknown'))}
                strong
              />
            ) : null}
          </Box>

          {draft ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('invoices.dialog.draftWarning')}
            </Text>
          ) : (
            <>
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
              {disputed ? (
                <Box className="rounded-md border border-border bg-card/50 p-3">
                  <Text size="sm" weight="medium" className="block">
                    {t('invoices.dialog.disputeTitle')}
                  </Text>
                  <Text element="p" size="xs" color="text-muted-foreground">
                    {row.disputeReason ?? <UnknownValue reason={t('invoices.dialog.disputeNoReason')} />}
                  </Text>
                </Box>
              ) : null}
            </>
          )}

          {gesture === 'payment' ? (
            <PaymentDialog
              pending={recordPayment.isPending}
              onCancel={() => setGesture(null)}
              onConfirm={amountCents => {
                recordPayment.mutate({
                  missionId: row.missionId,
                  month,
                  ...(amountCents === null ? {} : { amountCents }),
                })
                setGesture(null)
              }}
            />
          ) : null}
          {gesture === 'dispute' ? (
            <DisputeDialog
              pending={openDispute.isPending}
              onCancel={() => setGesture(null)}
              onConfirm={reason => {
                openDispute.mutate({ missionId: row.missionId, month, reason })
                setGesture(null)
              }}
            />
          ) : null}

          <Box className="flex flex-wrap gap-2">
            {draft ? (
              <>
                <Link to="/missions/facturation" className={LINK_CLASS}>
                  {t('invoices.openPreparation')}
                </Link>
                <Link to="/missions/facturation" className={LINK_CLASS}>
                  {t('invoices.dialog.declareElsewhere')}
                </Link>
              </>
            ) : canWriteFinance ? (
              <>
                <Button size="sm" disabled={pending} onClick={() => setGesture('payment')}>
                  {t('invoices.dialog.recordPayment')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => recordReminder.mutate({ missionId: row.missionId, month })}
                >
                  {t('invoices.dialog.recordReminder')}
                </Button>
                {disputed ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => resolveDispute.mutate({ missionId: row.missionId, month })}
                  >
                    {t('invoices.dialog.resolveDispute')}
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => setGesture('dispute')}>
                    {t('invoices.dialog.openDispute')}
                  </Button>
                )}
                {!row.dueOn ? (
                  <Link to="/missions/facturation" className={LINK_CLASS}>
                    {t('invoices.enterDueDate')}
                  </Link>
                ) : null}
              </>
            ) : null}
            {!draft && row.accountName ? (
              <Link to="/missions/encaissements" search={{ client: row.accountName }} className={LINK_CLASS}>
                {t('invoices.dialog.prepareFollowUp')}
              </Link>
            ) : null}
          </Box>

          {/* Pièces jointes (A4) — rangées en repli, après les totaux ; monté à l'ouverture seulement. */}
          <AttachmentsFold row={row} month={row.periodMonth.slice(0, 10)} canWrite={canWriteFinance} demo={demo} />

          {!draft && row.paidAt ? (
            <Box className="space-y-1">
              <Text element="h3" size="sm" weight="semibold">
                {t('invoices.dialog.trace')}
              </Text>
              <Total
                label={t('invoices.dialog.paymentLine', { date: formatDay(row.paidAt, locale) })}
                value={money(row.paidAmountCents, t('invoices.dialog.settledUnknown'))}
              />
            </Box>
          ) : null}
        </Box>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('invoices.dialog.close')}
          </Button>
          <Link to="/missions/$id" params={{ id: row.missionId }} className={LINK_CLASS}>
            {t('invoices.dialog.openMission')}
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AttachmentsFold({
  row,
  month,
  canWrite,
  demo,
}: {
  row: InvoiceReadiness
  month: string
  canWrite: boolean
  demo: boolean
}) {
  const { t } = useTranslation('missions')
  const [open, setOpen] = useState(false)
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm underline md:min-h-8">
        {t('invoices.attachments')}
      </summary>
      {open ? (
        <InvoiceAttachments missionId={row.missionId} periodMonth={month} canWrite={canWrite} demo={demo} />
      ) : null}
    </details>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box>
      <dt className="block text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </Box>
  )
}

function Total({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <Box className="flex items-baseline justify-between gap-3">
      <Text element="span" size="sm" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="span" size="sm" weight={strong ? 'semibold' : 'normal'}>
        {value}
      </Text>
    </Box>
  )
}
