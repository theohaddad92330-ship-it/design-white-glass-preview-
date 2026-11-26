import type { InvoiceReadiness } from '@bellum/contracts'
import { Badge } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { invoiceDocumentState, type InvoiceDocumentState } from '../invoice-documents'

// Les pastilles de la maquette (`.v18-pill`) : neutre, violet (accent), rouge, vert.
const STATE_VARIANT: Readonly<Record<InvoiceDocumentState, 'default' | 'primary' | 'success' | 'danger'>> = {
  draft: 'default',
  to_receive: 'primary',
  overdue: 'danger',
  partial_overdue: 'danger',
  disputed: 'danger',
  settled: 'success',
}

/** L'état d'affichage d'une facture — le MÊME badge sur Factures et sur Encaissements (GA-26). */
export function StateBadge({ row, now }: { row: InvoiceReadiness; now: Date }) {
  const { t } = useTranslation('missions')
  const state = invoiceDocumentState(row, now)
  return (
    <Badge variant={STATE_VARIANT[state]} title={state === 'disputed' ? (row.disputeReason ?? undefined) : undefined}>
      {t(`invoices.state.${state}`)}
    </Badge>
  )
}
