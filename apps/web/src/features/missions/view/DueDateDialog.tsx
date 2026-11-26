import type { InvoiceReadiness } from '@bellum/contracts'
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
import { Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMarkInvoiced } from '../api'

/**
 * « Saisir l'échéance » (Théo V22, `dlg-due`) — une facture sans échéance n'entre dans aucune
 * tranche échue : elle se nomme à part, jamais « à jour ».
 *
 * ⚠️ Seule une facture DÉCLARÉE (`invoiced_declared`) se complète ici : la déclaration se
 * rejoue avec sa référence, son montant et sa date d'origine, seule l'échéance s'ajoute. Une
 * facture LUE dans l'outil branché garde l'échéance que l'outil lui a fixée : la réécrire ici
 * la ferait passer pour déclarée (c80) — la fenêtre renvoie alors à Facturation.
 */
export function DueDateDialog({ row, onClose }: { row: InvoiceReadiness; onClose: () => void }) {
  const { t } = useTranslation('missions')
  const markInvoiced = useMarkInvoiced()
  const [dueOn, setDueOn] = useState('')
  const declared = row.state === 'invoiced_declared'
  const label = row.invoiceReference ?? row.accountName ?? t('invoices.prepared')
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('invoices.dialog.close')}>
        <DialogHeader>
          <DialogTitle>{t('invoices.due.title', { label })}</DialogTitle>
          <DialogDescription>{t('invoices.due.body')}</DialogDescription>
        </DialogHeader>
        {declared ? (
          <label className="block space-y-1">
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {t('invoices.due.field')}
            </Text>
            <Input type="date" value={dueOn} onChange={event => setDueOn(event.target.value)} />
          </label>
        ) : (
          <Box className="space-y-2">
            <Text element="p" size="sm" color="text-muted-foreground">
              {t('invoices.due.readOnly')}
            </Text>
            <Link to="/missions/facturation" className="inline-flex min-h-11 items-center text-sm underline md:min-h-8">
              {t('invoices.due.toBilling')}
            </Link>
          </Box>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('invoices.due.cancel')}
          </Button>
          {declared ? (
            <Button
              disabled={dueOn.length === 0 || markInvoiced.isPending}
              onClick={() =>
                markInvoiced.mutate(
                  {
                    missionId: row.missionId,
                    month: row.periodMonth.slice(0, 7),
                    dueOn,
                    ...(row.invoiceReference ? { reference: row.invoiceReference } : {}),
                    ...(row.invoicedAmountCents === null ? {} : { amountCents: row.invoicedAmountCents }),
                    ...(row.invoicedAt ? { invoicedAt: new Date(row.invoicedAt).toISOString() } : {}),
                  },
                  { onSuccess: onClose },
                )
              }
            >
              {t('invoices.due.save')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Une invite en ligne (règlement, litige) posée dans une VRAIE fenêtre : rendue en bas de page,
 * elle s'ouvrait loin de la ligne cliquée, et le clic se lisait mort.
 */
export function PromptModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation('missions')
  return (
    <Dialog open onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('invoices.dialog.close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
