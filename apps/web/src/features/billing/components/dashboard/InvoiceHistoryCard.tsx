import { Badge, Text, TooltipButton } from '@bellum/ui'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import type { BillingInvoice } from '../../model/billing-view-model'
import { BillingCard } from './BillingCard'
import { EmptyInvoice } from './BillingShared'

type InvoiceHistoryCardProps = {
  invoices: BillingInvoice[]
  loading: boolean
}

export function InvoiceHistoryCard({ invoices, loading }: InvoiceHistoryCardProps) {
  const { t } = useTranslation('billing')
  return (
    <BillingCard title={t('invoices.title')}>
      {loading ? (
        <LoadingRow />
      ) : invoices.length === 0 ? (
        <EmptyInvoice />
      ) : (
        // Le tableau COMMUN du produit (refonte Théo PR12) : une ligne par facture, statut teinté.
        <ResponsiveTable
          rows={invoices}
          rowKey={invoice => invoice.id}
          scrollLabel={t('invoices.title')}
          columns={[
            {
              key: 'invoice',
              header: t('invoices.columns.invoice'),
              mobile: 'title',
              render: invoice => <InvoiceMain invoice={invoice} />,
            },
            {
              key: 'status',
              header: t('invoices.columns.status'),
              render: invoice => <InvoiceStatus status={invoice.status} />,
            },
            {
              key: 'amount',
              header: t('invoices.columns.amount'),
              className: 'text-right',
              render: invoice => (
                <Text size="sm" weight="semibold">
                  {invoice.amount}
                </Text>
              ),
            },
            {
              key: 'download',
              header: '',
              mobile: 'meta',
              className: 'w-px',
              render: invoice => <DownloadInvoiceButton url={invoice.url} />,
            },
          ]}
        />
      )}
    </BillingCard>
  )
}

function LoadingRow() {
  const { t } = useTranslation('billing')
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Loader2 className="size-4 animate-spin text-[var(--bellum-text-muted)]" />
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('invoices.loading')}
      </Text>
    </div>
  )
}

function InvoiceMain({ invoice }: { invoice: BillingInvoice }) {
  return (
    <div className="min-w-0">
      <Text size="sm" weight="semibold">
        {invoice.label}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {invoice.date}
      </Text>
    </div>
  )
}

function InvoiceStatus({ status }: { status: BillingInvoice['status'] }) {
  const { t } = useTranslation('billing')
  return (
    <Badge variant={status === 'paid' ? 'success' : 'warning'} className="w-fit">
      {status === 'paid' ? t('invoices.statusPaid') : t('invoices.statusPending')}
    </Badge>
  )
}

function DownloadInvoiceButton({ url }: { url: string | null }) {
  const { t } = useTranslation('billing')
  const open = (): void => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }
  return (
    <TooltipButton
      tooltip={url ? t('invoices.viewOnStripe') : t('invoices.unavailable')}
      variant="outline"
      size="icon"
      aria-label={t('invoices.viewAria')}
      disabled={!url}
      onClick={open}
      className="size-9 shrink-0"
    >
      <Download className="size-4" />
    </TooltipButton>
  )
}
