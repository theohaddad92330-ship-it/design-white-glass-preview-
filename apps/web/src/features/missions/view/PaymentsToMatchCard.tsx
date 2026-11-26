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
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useMatchPayment,
  useNoteCustomerCredit,
  useRecordUnmatchedPayment,
  useUnmatchedPayments,
  type UnmatchedPaymentDetail,
} from '../payments-matching'
import { formatDay, formatEuros, formatMonth } from '../money-format'
import { ControlRow, FinanceCard, RowLine } from './FinanceTheo'

/**
 * « Les règlements à rapprocher » — les règlements consignés qu'aucune facture ne porte encore
 * (Théo V22, Encaissements). « Affecter » ouvre les factures PROPOSÉES par le serveur (celles dont le
 * reste dû égale le règlement) : le rapprochement est un geste humain, jamais validé seul. Sans
 * candidate, l'écran le dit au lieu d'en inventer une. Rien ne s'affiche sans droit Finance.
 */
export function PaymentsToMatchCard({ canWrite, locale }: { canWrite: boolean; locale: string }) {
  const { t } = useTranslation('missions')
  const { data } = useUnmatchedPayments()
  const [allocating, setAllocating] = useState<UnmatchedPaymentDetail | null>(null)
  const rows = data?.unmatched ?? []
  // Une absence ne fait aucune ligne : sans règlement à rapprocher, la tuile « À rapprocher » le dit déjà.
  if (rows.length === 0) return null

  return (
    <FinanceCard title={t('collections.toMatch.title')} titleId="payments-to-match">
      {rows.map(row => (
        <ControlRow
          key={row.id}
          tone="warn"
          title={`${row.payer ?? row.accountName ?? t('collections.toMatch.unknownPayer')} · ${formatEuros(row.amountCents, locale)}`}
          actions={
            canWrite ? (
              <Button size="sm" onClick={() => setAllocating(row)}>
                {t('collections.toMatch.allocate')}
              </Button>
            ) : null
          }
        >
          <RowLine>
            {formatDay(row.receivedOn, locale)}
            {row.reference ? ` · « ${row.reference} »` : ''}
            {row.ambiguous ? ` · ${t('collections.toMatch.ambiguous')}` : ''}
          </RowLine>
        </ControlRow>
      ))}
      {allocating ? <AllocateDialog payment={allocating} locale={locale} onClose={() => setAllocating(null)} /> : null}
    </FinanceCard>
  )
}

function AllocateDialog({
  payment,
  locale,
  onClose,
}: {
  payment: UnmatchedPaymentDetail
  locale: string
  onClose: () => void
}) {
  const { t } = useTranslation('missions')
  const match = useMatchPayment()
  const credit = useNoteCustomerCredit()
  const [crediting, setCrediting] = useState(false)
  const [note, setNote] = useState('')
  const [chosen, setChosen] = useState<string | null>(
    payment.candidates.length === 1 ? payment.candidates[0]!.invoiceReadinessId : null,
  )
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('collections.toMatch.close')}>
        <DialogHeader>
          <DialogTitle>
            {t('collections.toMatch.dialogTitle', { date: formatDay(payment.receivedOn, locale) })}
          </DialogTitle>
          <DialogDescription>
            {t('collections.toMatch.dialogIntro', {
              payer: payment.payer ?? payment.accountName ?? t('collections.toMatch.unknownPayer'),
              amount: formatEuros(payment.amountCents, locale),
            })}
          </DialogDescription>
        </DialogHeader>
        {payment.candidates.length === 0 ? (
          <Text element="p" size="sm" color="text-muted-foreground">
            {t('collections.toMatch.noCandidate')}
          </Text>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('collections.toMatch.chooseInvoice')}</legend>
            {payment.candidates.map(candidate => (
              <label
                key={candidate.invoiceReadinessId}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border p-2 text-sm md:min-h-8"
              >
                <input
                  type="radio"
                  name="candidate"
                  checked={chosen === candidate.invoiceReadinessId}
                  onChange={() => setChosen(candidate.invoiceReadinessId)}
                />
                <span>
                  {candidate.accountName ?? t('collections.unknownAccountReason')} ·{' '}
                  {candidate.missionLabel ?? t('collections.unknownMissionReason')} ·{' '}
                  {formatMonth(candidate.periodMonth, locale)} ·{' '}
                  {t('collections.outstanding', { value: formatEuros(candidate.dueCents, locale) })}
                </span>
              </label>
            ))}
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('collections.toMatch.rule')}
            </Text>
          </fieldset>
        )}
        {/* Notre maquette validée (back.talents.240) : un trop-perçu se note comme crédit dû au client — jamais un avoir émis. */}
        {crediting ? (
          <Box className="space-y-1">
            <label className="block space-y-1">
              <Text element="span" size="xs" color="text-muted-foreground" className="block">
                {t('collections.toMatch.creditNote')}
              </Text>
              <Input value={note} onChange={event => setNote(event.target.value)} />
            </label>
            <Box className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                disabled={note.trim().length === 0 || credit.isPending}
                onClick={() => credit.mutate({ paymentId: payment.id, note: note.trim() }, { onSuccess: onClose })}
              >
                {t('collections.toMatch.creditConfirm')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCrediting(false)}>
                {t('collections.toMatch.cancel')}
              </Button>
            </Box>
          </Box>
        ) : (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setCrediting(true)}>
            {t('collections.toMatch.credit')}
          </Button>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('collections.toMatch.cancel')}
          </Button>
          <Button
            disabled={chosen === null || match.isPending}
            onClick={() => {
              if (chosen === null) return
              match.mutate({ paymentId: payment.id, invoiceReadinessId: chosen }, { onSuccess: onClose })
            }}
          >
            {t('collections.toMatch.validate')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * « Consigner un règlement » (geste de tête) : un mouvement tel que la banque l'a reçu — date, montant,
 * payeur, référence. Il reste « à rapprocher » jusqu'à ce qu'un humain l'affecte ; le montant est
 * obligatoire (un règlement sans montant n'en est pas un).
 */
export function RecordPaymentDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('missions')
  const record = useRecordUnmatchedPayment()
  const [receivedOn, setReceivedOn] = useState('')
  const [amount, setAmount] = useState('')
  const [payer, setPayer] = useState('')
  const [reference, setReference] = useState('')
  const cents = Math.round(Number(amount.replace(',', '.')) * 100)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(receivedOn) && Number.isFinite(cents) && cents > 0
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('collections.toMatch.close')}>
        <DialogHeader>
          <DialogTitle>{t('collections.record.title')}</DialogTitle>
          <DialogDescription>{t('collections.record.intro')}</DialogDescription>
        </DialogHeader>
        <Box className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.record.date')}
            </Text>
            <Input type="date" value={receivedOn} onChange={event => setReceivedOn(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.record.amount')}
            </Text>
            <Input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.record.payer')}
            </Text>
            <Input value={payer} onChange={event => setPayer(event.target.value)} />
          </label>
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('collections.record.reference')}
            </Text>
            <Input value={reference} onChange={event => setReference(event.target.value)} />
          </label>
        </Box>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('collections.toMatch.cancel')}
          </Button>
          <Button
            disabled={!valid || record.isPending}
            onClick={() =>
              record.mutate(
                {
                  amountCents: cents,
                  receivedOn,
                  ...(payer.trim() ? { payer: payer.trim() } : {}),
                  ...(reference.trim() ? { reference: reference.trim() } : {}),
                },
                { onSuccess: onClose },
              )
            }
          >
            {t('collections.record.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
