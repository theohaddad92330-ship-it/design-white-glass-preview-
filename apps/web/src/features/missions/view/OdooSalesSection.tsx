import { clientToolName } from '@bellum/contracts'
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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { appLocale, formatCount, formatDate } from '@/lib/locale'
import {
  useOdooSales,
  useOdooSalesImport,
  useOdooSalesPreview,
  type OdooReprisePreview,
  type OdooSaleRow,
} from '../odoo-sales-api'

/**
 * #2561/#2562 — « VENTES DANS ODOO » sur /missions (retour CLIENT de François
 * Thomas, call bêta du 17/09/2026, démo du 08/10).
 *
 * Pour un client dont l'outil de gestion est Odoo, une vente confirmée EST une
 * mission ou un contrat. Cette section les montre — lues en direct, en lecture
 * seule — et dit pour chacune : « déjà une mission » ou « Reprendre en
 * mission ». On NOMME l'outil que l'espace a branché (permis par la doctrine),
 * via `clientToolName`, jamais un littéral.
 *
 * Rien sans outil branché, rien pendant le chargement : on n'affiche pas ce
 * qu'on n'a pas. Un délai dépassé se DIT (« on ne sait pas »), une erreur
 * aussi, avec le message de l'outil — jamais une liste vide à leur place.
 *
 * La reprise : le clic demande une PRÉVISUALISATION FIGÉE (exactement ce qui
 * sera créé) ; seul le bouton de cette prévisualisation crée, avec son
 * empreinte — l'API refuse si la vente a changé entre-temps.
 */
const TOOL = clientToolName('odoo') ?? 'ton outil de gestion'

export function OdooSalesSection() {
  const { t } = useTranslation('missions')
  const sales = useOdooSales()
  const preview = useOdooSalesPreview()
  const importer = useOdooSalesImport()
  const [frozen, setFrozen] = useState<Extract<OdooReprisePreview, { status: 'ok' }> | null>(null)

  const data = sales.data
  if (sales.isLoading || !data || data.status === 'not_connected') return null

  const askPreview = (saleIds: number[]) =>
    preview.mutate(saleIds, {
      onSuccess: result => {
        if (result.status === 'ok') setFrozen(result)
        else toast.error(result.status === 'not_connected' ? t('odooSales.previewError') : result.message)
      },
      onError: error => toast.error(error.message || t('odooSales.previewError')),
    })

  const confirm = () => {
    if (!frozen) return
    importer.mutate(
      { saleIds: frozen.items.map(item => item.saleId), fingerprint: frozen.fingerprint },
      {
        onSuccess: result => {
          setFrozen(null)
          if (result.status !== 'ok') {
            toast.error(result.status === 'not_connected' ? t('odooSales.previewError') : result.message)
            return
          }
          if (result.created.length > 0) {
            toast.success(t('odooSales.created', { count: result.created.length, tool: TOOL }))
          }
          if (result.failed.length > 0) toast.error(t('odooSales.partial', { count: result.failed.length }))
        },
        onError: error => toast.error(error.message || t('odooSales.previewError')),
      },
    )
  }

  return (
    <Box
      as="section"
      className="space-y-3 rounded-lg border border-border bg-card p-4"
      aria-labelledby="odoo-sales-title"
    >
      <Box display="flex" className="flex-wrap items-start justify-between gap-2">
        <Box className="min-w-0 flex-1 space-y-1">
          <Text element="h2" id="odoo-sales-title" size="sm" weight="semibold">
            {t('odooSales.title', { tool: TOOL })}
          </Text>
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('odooSales.intro', { tool: TOOL })}
          </Text>
          {data.status === 'ok' && data.demo ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('odooSales.demoNote')}
            </Text>
          ) : null}
        </Box>
        {data.status === 'ok' ? (
          <ReprendreAll rows={data.sales} pending={preview.isPending} onAsk={askPreview} />
        ) : null}
      </Box>

      {data.status === 'unknown' ? (
        <Box display="flex" className="flex-wrap items-center gap-2">
          <Text element="p" size="sm">
            {t('odooSales.unknown', { tool: TOOL })}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            onClick={() => void sales.refetch()}
          >
            {t('odooSales.retry')}
          </Button>
        </Box>
      ) : data.status === 'error' ? (
        <Text element="p" size="sm" role="alert">
          {t('odooSales.error', { tool: TOOL, message: data.message })}
        </Text>
      ) : (
        <ul className="divide-y divide-border">
          {data.sales.map(sale => (
            <OdooSaleItem key={sale.saleId} sale={sale} pending={preview.isPending} onAsk={askPreview} />
          ))}
        </ul>
      )}

      <Dialog open={frozen !== null} onOpenChange={open => (open ? undefined : setFrozen(null))}>
        <DialogContent closeLabel={t('odooSales.close')}>
          <DialogHeader>
            <DialogTitle>{t('odooSales.previewTitle')}</DialogTitle>
            <DialogDescription>{t('odooSales.previewDescription', { tool: TOOL })}</DialogDescription>
          </DialogHeader>
          {frozen ? <FrozenPreview preview={frozen} /> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={() => setFrozen(null)}>
              {t('odooSales.cancel')}
            </Button>
            {frozen && frozen.items.length > 0 ? (
              <Button type="button" className="pointer-coarse:min-h-11" disabled={importer.isPending} onClick={confirm}>
                {t('odooSales.confirm', { count: frozen.items.length })}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Box>
  )
}

function ReprendreAll({
  rows,
  pending,
  onAsk,
}: {
  rows: OdooSaleRow[]
  pending: boolean
  onAsk: (saleIds: number[]) => void
}) {
  const { t } = useTranslation('missions')
  const ids = rows.filter(row => row.draft !== null).map(row => row.saleId)
  if (ids.length < 2) return null
  return (
    <Button type="button" size="sm" className="pointer-coarse:min-h-11" disabled={pending} onClick={() => onAsk(ids)}>
      {t('odooSales.reprendreAll', { count: ids.length })}
    </Button>
  )
}

function money(value: number, currency: string | null): string {
  return currency
    ? new Intl.NumberFormat(appLocale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
    : formatCount(value)
}

function OdooSaleItem({
  sale,
  pending,
  onAsk,
}: {
  sale: OdooSaleRow
  pending: boolean
  onAsk: (saleIds: number[]) => void
}) {
  const { t } = useTranslation('missions')
  const ordered = formatDate(sale.orderDate)
  const starts = formatDate(sale.commitmentDate)
  const invoiceKey = sale.invoiceStatus ? sale.invoiceStatus.replace(' ', '_') : null

  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
      <Box className="min-w-0 flex-1 space-y-1">
        <Box display="flex" className="flex-wrap items-baseline gap-x-2">
          <Text element="span" size="sm" weight="semibold">
            {sale.reference}
          </Text>
          <Text element="span" size="sm">
            {sale.clientName ?? t('odooSales.noClient', { tool: TOOL })}
          </Text>
          {sale.clientRef ? (
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {sale.clientRef}
            </Text>
          ) : null}
        </Box>
        {sale.lines.map((line, index) => (
          <Text key={index} element="p" size="xs">
            {line.label}
            {line.quantity !== null && line.unitPrice !== null
              ? ` — ${t('odooSales.lineQuantity', { quantity: formatCount(line.quantity), price: money(line.unitPrice, sale.currency) })}`
              : null}
          </Text>
        ))}
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {[
            ordered ? t('odooSales.orderedOn', { date: ordered }) : null,
            starts ? t('odooSales.startsOn', { date: starts }) : null,
            sale.amountUntaxed !== null ? money(sale.amountUntaxed, sale.currency) : null,
            invoiceKey ? t(`odooSales.invoice.${invoiceKey}`, { defaultValue: sale.invoiceStatus }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </Box>
      <Box className="min-w-0 max-w-full sm:max-w-[20rem]">
        {sale.mission ? (
          <Text element="p" size="xs">
            {t('odooSales.alreadyMission', { label: sale.mission.label })}{' '}
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              ({t(`odooSales.matchBy.${sale.mission.by}`)})
            </Text>
          </Text>
        ) : sale.accountIssue === 'ambiguous' ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('odooSales.accountAmbiguous')}
          </Text>
        ) : !sale.account ? (
          <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
            {t('odooSales.accountNotFound', { name: sale.clientName ?? '' })}
          </Text>
        ) : sale.draft ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="pointer-coarse:min-h-11"
            disabled={pending}
            onClick={() => onAsk([sale.saleId])}
          >
            {t('odooSales.reprendre')}
          </Button>
        ) : null}
      </Box>
    </li>
  )
}

function FrozenPreview({ preview }: { preview: Extract<OdooReprisePreview, { status: 'ok' }> }) {
  const { t } = useTranslation('missions')
  return (
    <Box className="max-h-[60dvh] space-y-3 overflow-y-auto">
      {preview.items.length === 0 ? (
        <Text element="p" size="sm">
          {t('odooSales.nothingToCreate')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {preview.items.map(item => {
            const start = formatDate(item.startedOn)
            return (
              <li key={item.saleId} className="rounded-md border border-border p-2">
                <Text element="p" size="sm" weight="medium">
                  {item.label}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {[
                    t('odooSales.previewAccount', { name: item.accountName }),
                    start ? t('odooSales.previewStart', { date: start }) : t('odooSales.previewNoStart'),
                    item.dailyRate !== null
                      ? t('odooSales.previewRate', { rate: money(item.dailyRate, 'EUR') })
                      : t('odooSales.previewNoRate'),
                  ].join(' · ')}
                </Text>
              </li>
            )
          })}
        </ul>
      )}
      {preview.skipped.length > 0 ? (
        <ul className="space-y-1">
          {preview.skipped.map(skip => (
            <li key={skip.saleId}>
              <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                {t(`odooSales.skipped.${skip.reason}`, { reference: skip.reference ?? `#${skip.saleId}` })}
              </Text>
            </li>
          ))}
        </ul>
      ) : null}
    </Box>
  )
}
