import {
  hasPermission,
  MAX_REMINDERS,
  outstandingAmountCents,
  receivableKey,
  type InvoiceReadiness,
} from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useTeam } from '@/features/team/hooks/useTeam'
import { useFactoringView } from '../../factoring/api'
import { COLLECTIONS_WINDOW_MONTHS, collectionMonths, overdueDaysAt } from '../collections'
import { useCollectionsWindow } from '../api'
import {
  declaredIssuedCents,
  filterInvoiceDocuments,
  invoiceDocuments,
  invoiceDocumentState,
  invoiceDocumentTiles,
  type InvoiceDocumentFilter,
} from '../invoice-documents'
import { formatDay, formatEuros, formatMonth } from '../money-format'
import { useCollectionsExport } from './collectionsExport'
import { DueDateDialog } from './DueDateDialog'
import {
  FinanceCard,
  FinanceGuide,
  FinanceStat,
  FinanceStats,
  FinanceToolbar,
  MultiSelectFilter,
  ToolbarSearch,
} from './FinanceTheo'
import { InvoiceDocumentDialog } from './InvoiceDocumentDialog'
import { StateBadge } from './InvoiceStateBadge'
import { useInvoicingTools } from './useInvoicingTools'

// Les états de la liste, dans l'ordre de la maquette (`select` « État des factures »).
const STATE_FILTERS: readonly Exclude<InvoiceDocumentFilter, 'all'>[] = [
  'drafts',
  'issued',
  'declared',
  'with_balance',
  'overdue',
  'disputed',
  'settled',
]

/**
 * FACTURES — la liste des DOCUMENTS, de la préparation au solde (Théo V22, `c/missions-factures.html`).
 *
 * L'ordre de la maquette, bloc par bloc : en-tête (titre, phrase, Exporter · Préparer depuis
 * l'activité) → guide replié → quatre tuiles qui FILTRENT → barre Période · Compte · Responsable ·
 * Recherche → barre État + compte de la sélection → le tableau Document/client · Période · HT ·
 * Échéance · État/solde · Ouvrir → deux cartes (pièce figée, outil de facturation branché).
 *
 * ⚠️ #2564 — Bellum PRÉPARE, il n'émet ni ne comptabilise : une préparation n'a pas de numéro
 * (« Préparée »), le numéro légal et les avoirs viennent de l'outil branché par le client.
 * « Facturé » ne se lit que sur preuve du connecteur ; la déclaration reste nommée (c80).
 * Les filtres sont multiples (Louis 23/10).
 *
 * Bloqué : la colonne TTC et le filtre « Avoirs » de la maquette — le modèle ne porte ni TVA ni
 * avoir, et on n'affiche pas ce qu'on n'a pas.
 */
export function InvoicesPage({ now }: { now?: Date } = {}) {
  const { t, i18n } = useTranslation('missions')
  const reference = useMemo(() => now ?? new Date(), [now])
  const months = useMemo(() => collectionMonths(reference), [reference])
  const { items, canReadFinance, isLoading, failedMonths } = useCollectionsWindow(months)
  const { data: factoring } = useFactoringView()
  const demo = useIsDemo()
  const { team } = useTeam()
  const tools = useInvoicingTools()
  const collectionsExport = useCollectionsExport(t)
  const canWriteFinance = team ? hasPermission(team.workspace.role, 'finance:write') : false
  const [states, setStates] = useState<Exclude<InvoiceDocumentFilter, 'all'>[]>([])
  const [periods, setPeriods] = useState<string[]>([])
  const [accounts, setAccounts] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<InvoiceReadiness | null>(null)
  const [dating, setDating] = useState<InvoiceReadiness | null>(null)

  // Théo C missions-factures.R1 — badge « cédée » : la créance est cédée (affacturage),
  // jointe par mission × mois avec la même clé que les paiements.
  const cededKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const assignment of factoring?.assignments ?? []) {
      if (assignment.status === 'assigned' || assignment.status === 'settled') keys.add(receivableKey(assignment))
    }
    return keys
  }, [factoring])

  const documents = useMemo(() => invoiceDocuments(items), [items])
  const tiles = useMemo(() => invoiceDocumentTiles(items), [items])
  const declaredCents = useMemo(() => declaredIssuedCents(items), [items])

  // Les options ne viennent que de ce que la fenêtre contient : une option sans ligne n'existe pas.
  const periodOptions = useMemo(
    () => [...new Set(documents.map(row => row.periodMonth.slice(0, 10)))].sort().reverse(),
    [documents],
  )
  const accountOptions = useMemo(
    () => [...new Set(documents.flatMap(row => (row.accountName ? [row.accountName] : [])))].sort(),
    [documents],
  )
  const ownerOptions = useMemo(
    () => [...new Set(documents.flatMap(row => (row.ownerName ? [row.ownerName] : [])))].sort(),
    [documents],
  )

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return filterInvoiceDocuments(items, states, reference).filter(row => {
      if (periods.length > 0 && !periods.includes(row.periodMonth.slice(0, 10))) return false
      if (accounts.length > 0 && !(row.accountName && accounts.includes(row.accountName))) return false
      if (owners.length > 0 && !(row.ownerName && owners.includes(row.ownerName))) return false
      if (!needle) return true
      return [row.accountName, row.missionLabel, row.invoiceReference].some(value =>
        value?.toLowerCase().includes(needle),
      )
    })
  }, [items, states, periods, accounts, owners, query, reference])

  const euros = (cents: number | null) =>
    !canReadFinance ? (
      <UnknownValue reason={t('readiness.financeHidden')} />
    ) : cents === null ? (
      <UnknownValue reason={t('invoices.tiles.unknown')} />
    ) : (
      formatEuros(cents, i18n.language)
    )

  // Une tuile FILTRE : un clic resserre la liste sur ce qu'elle compte, un second la relâche.
  const filterByState = (next: Exclude<InvoiceDocumentFilter, 'all'>) =>
    setStates(current => (current.length === 1 && current[0] === next ? [] : [next]))
  const tileOn = (key: Exclude<InvoiceDocumentFilter, 'all'>) => states.length === 1 && states[0] === key

  return (
    <CustomerPage
      pageTitle={t('invoices.headline')}
      pageSubtitle={t('invoices.lede')}
      breadcrumbs={[{ label: t('financeCrumb'), to: '/missions' }, { label: t('invoices.title') }]}
      screenGuide={<FinanceGuide guideKey="invoices.guide" />}
      headerActions={
        <>
          {collectionsExport.canExport && canReadFinance ? (
            <Button variant="outline" onClick={() => collectionsExport.run(months)}>
              <Download className="mr-2 size-4" aria-hidden="true" />
              {t('invoices.export')}
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/missions/facturation">{t('invoices.prepareFromActivity')}</Link>
          </Button>
        </>
      }
    >
      <Box className="space-y-4 py-4" data-screen="missions-factures">
        {isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : (
          <>
            <FinanceStats label={t('invoices.tiles.label')}>
              <FinanceStat
                label={t('invoices.tiles.drafts')}
                value={String(tiles.drafts)}
                note={t('invoices.tiles.draftsNote')}
                selected={tileOn('drafts')}
                onClick={() => filterByState('drafts')}
              />
              <FinanceStat
                accent
                label={t('invoices.tiles.issued')}
                value={euros(tiles.issuedCents)}
                note={
                  declaredCents !== null && canReadFinance
                    ? t('invoices.tiles.issuedNoteDeclared', { value: formatEuros(declaredCents, i18n.language) })
                    : t('invoices.tiles.issuedNote')
                }
                selected={tileOn('issued')}
                onClick={() => filterByState('issued')}
              />
              <FinanceStat
                label={t('invoices.tiles.outstanding')}
                value={euros(tiles.outstandingCents)}
                note={t('invoices.tiles.outstandingNote')}
                selected={tileOn('with_balance')}
                onClick={() => filterByState('with_balance')}
              />
              <FinanceStat
                label={t('invoices.tiles.disputed')}
                value={String(tiles.disputed)}
                note={t('invoices.tiles.disputedNote')}
                selected={tileOn('disputed')}
                onClick={() => filterByState('disputed')}
              />
            </FinanceStats>

            <FinanceToolbar label={t('invoices.filters.toolbar')}>
              <MultiSelectFilter
                label={t('invoices.filters.periodLabel')}
                allLabel={t('invoices.filters.allPeriods')}
                options={periodOptions.map(month => ({ value: month, label: formatMonth(month, i18n.language) }))}
                values={periods}
                onChange={setPeriods}
              />
              <MultiSelectFilter
                label={t('invoices.filters.accountLabel')}
                allLabel={t('invoices.filters.allAccounts')}
                options={accountOptions.map(name => ({ value: name, label: name }))}
                values={accounts}
                onChange={setAccounts}
              />
              <MultiSelectFilter
                label={t('invoices.filters.ownerLabel')}
                allLabel={t('invoices.filters.allOwners')}
                options={ownerOptions.map(name => ({ value: name, label: name }))}
                values={owners}
                onChange={setOwners}
              />
              <ToolbarSearch
                label={t('invoices.filters.searchLabel')}
                placeholder={t('invoices.search')}
                value={query}
                onChange={setQuery}
              />
            </FinanceToolbar>

            <FinanceToolbar>
              <MultiSelectFilter
                label={t('invoices.filters.label')}
                allLabel={t('invoices.filters.allStates')}
                options={STATE_FILTERS.map(key => ({ value: key, label: t(`invoices.filters.${key}`) }))}
                values={states}
                onChange={next => setStates(next as Exclude<InvoiceDocumentFilter, 'all'>[])}
              />
              <span className="flex-1" />
              <Box className="flex flex-col items-end gap-0.5">
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('invoices.selectionCount', { count: visible.length })}
                </Text>
                {/* Gardé hors maquette : l'assiette de la fenêtre, et ce qui n'a pas pu être lu. */}
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('collections.window', { count: COLLECTIONS_WINDOW_MONTHS })}
                </Text>
                {failedMonths > 0 ? (
                  <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
                    {t('collections.partialWindow', { count: failedMonths })}
                  </Text>
                ) : null}
              </Box>
            </FinanceToolbar>

            <ResponsiveTable
              rows={visible}
              rowKey={row => `${row.missionId}-${row.periodMonth}`}
              empty={
                <Box className="rounded-card border border-dashed border-[var(--bellum-border)] p-4">
                  <Text size="sm" color="text-muted-foreground">
                    {documents.length > 0 ? t('invoices.filteredEmpty') : t('invoices.empty')}
                  </Text>
                </Box>
              }
              columns={[
                {
                  key: 'document',
                  header: t('invoices.columns.document'),
                  mobile: 'title',
                  className: 'max-w-[16rem] break-words',
                  render: row => <DocumentCell row={row} cede={cededKeys.has(receivableKey(row))} onOpen={setOpened} />,
                },
                {
                  key: 'period',
                  header: t('invoices.columns.period'),
                  mobile: 'meta',
                  render: row => (
                    <Box className="min-w-0">
                      <Text element="span" size="sm" className="block first-letter:uppercase">
                        {formatMonth(row.periodMonth, i18n.language)}
                      </Text>
                      <Text element="span" size="xs" color="text-muted-foreground" className="block">
                        {row.state === 'ready'
                          ? t('invoices.preparedNotCreated')
                          : row.invoicedAt
                            ? t('invoices.createdOn', { date: formatDay(row.invoicedAt, i18n.language) })
                            : t('invoices.issued')}
                      </Text>
                    </Box>
                  ),
                },
                {
                  key: 'amount',
                  header: t('invoices.columns.amount'),
                  className: 'text-right tabular-nums',
                  render: row => (
                    <AmountCell
                      row={row}
                      canReadFinance={canReadFinance}
                      locale={i18n.language}
                      unknown={t('collections.noAmount')}
                    />
                  ),
                },
                {
                  key: 'dueOn',
                  header: t('collections.columns.dueOn'),
                  render: row => <DueCell row={row} now={reference} locale={i18n.language} onEnter={setDating} />,
                },
                {
                  key: 'state',
                  header: t('invoices.columns.state'),
                  render: row => (
                    <StateCell row={row} now={reference} canReadFinance={canReadFinance} locale={i18n.language} />
                  ),
                },
                {
                  key: 'open',
                  header: t('invoices.columns.actions'),
                  className: 'w-24',
                  render: row => (
                    <Button size="sm" variant="outline" onClick={() => setOpened(row)}>
                      {t('invoices.open')}
                    </Button>
                  ),
                },
              ]}
            />

            <Box className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <FinanceCard title={t('invoices.frozen.title')} titleId="invoices-frozen">
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('invoices.frozen.body')}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-2">
                  {t('invoices.frozen.correction')}
                </Text>
              </FinanceCard>
              <FinanceCard title={t('invoices.accounting.title')} titleId="invoices-tool">
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {tools.length > 0
                    ? tools.map((tool, index) => (
                        <span key={tool.provider}>
                          {index > 0 ? ' · ' : null}
                          <strong className="font-semibold text-[var(--bellum-text-primary)]">{tool.name}</strong>
                          {tool.needsReconnect
                            ? ` ${t('invoices.accounting.reconnect')}`
                            : tool.lastSync
                              ? ` ${t('invoices.accounting.lastRead', { date: formatDay(tool.lastSync, i18n.language) })}`
                              : ''}
                        </span>
                      ))
                    : t('invoices.accounting.none')}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-2">
                  {t('invoices.accounting.body')}
                </Text>
                <Box className="mt-3 flex flex-wrap gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/settings/workspace-rules">{t('invoices.settings')}</Link>
                  </Button>
                  {/* Gardé hors maquette : le passage direct vers Encaissements. */}
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/missions/encaissements">{t('invoices.toCollections')}</Link>
                  </Button>
                </Box>
              </FinanceCard>
            </Box>
          </>
        )}

        {opened ? (
          <InvoiceDocumentDialog
            row={opened}
            badge={<StateBadge row={opened} now={reference} />}
            canReadFinance={canReadFinance}
            canWriteFinance={canWriteFinance}
            demo={demo}
            locale={i18n.language}
            onClose={() => setOpened(null)}
          />
        ) : null}
        {dating ? <DueDateDialog row={dating} onClose={() => setDating(null)} /> : null}
      </Box>
    </CustomerPage>
  )
}

/** Document / client : la pièce (son numéro, ou « Préparée »), le client, la mission, et la SOURCE du « facturé » (c80). */
function DocumentCell({
  row,
  cede,
  onOpen,
}: {
  row: InvoiceReadiness
  cede: boolean
  onOpen: (row: InvoiceReadiness) => void
}) {
  const { t } = useTranslation('missions')
  // Une préparation n'a PAS de numéro : jamais inventé avant sa création (#2564).
  const draft = row.state === 'ready'
  const declared = row.state === 'invoiced_declared'
  return (
    <Box className="min-w-0 space-y-0.5">
      <Box className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => onOpen(row)}
          className="inline-flex min-h-11 items-center text-sm font-medium underline md:min-h-8"
        >
          {draft ? t('invoices.prepared') : (row.invoiceReference ?? t('invoices.noReference'))}
        </button>
        {cede ? <Badge variant="info">{t('invoices.ceded')}</Badge> : null}
      </Box>
      <Text element="span" size="xs" color="text-muted-foreground" className="block">
        {row.accountName ?? <UnknownValue reason={t('collections.unknownAccountReason')} />}
      </Text>
      {row.missionLabel ? (
        <Text element="span" size="xs" className="block" title={row.missionLabel}>
          <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
        </Text>
      ) : (
        <UnknownValue reason={t('collections.unknownMissionReason')} />
      )}
      {draft ? null : (
        <Text
          element="span"
          size="xs"
          color={declared ? 'text-[var(--warning-soft-text)]' : 'text-muted-foreground'}
          className="block"
        >
          {declared ? t('invoices.sourceDeclared') : t('invoices.sourceRead')}
        </Text>
      )}
    </Box>
  )
}

function AmountCell({
  row,
  canReadFinance,
  locale,
  unknown,
}: {
  row: InvoiceReadiness
  canReadFinance: boolean
  locale: string
  unknown: string
}) {
  const amount = row.state === 'ready' ? row.preparedAmountCents : row.invoicedAmountCents
  if (!canReadFinance) return null
  if (amount === null) return <UnknownValue reason={unknown} />
  return (
    <Text element="span" size="sm">
      {formatEuros(amount, locale)}
    </Text>
  )
}

function DueCell({
  row,
  now,
  locale,
  onEnter,
}: {
  row: InvoiceReadiness
  now: Date
  locale: string
  onEnter: (row: InvoiceReadiness) => void
}) {
  const { t } = useTranslation('missions')
  if (row.state === 'ready') {
    return (
      <Box className="min-w-0">
        <Text element="span" size="sm">
          {t('invoices.dueAtCreation')}
        </Text>
        <Text element="span" size="xs" color="text-muted-foreground" className="block">
          {t('invoices.dueSetByTool')}
        </Text>
      </Box>
    )
  }
  if (!row.dueOn) {
    return (
      <Box className="min-w-0">
        {/* Réparable en une saisie (`dlg-due`) : le geste, puis l'absence nommée — jamais « à jour ». */}
        <button
          type="button"
          onClick={() => onEnter(row)}
          className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline md:min-h-8"
        >
          {t('invoices.enterDueDate')}
        </button>
        <Text element="span" size="xs" color="text-muted-foreground" className="block">
          {t('invoices.noDue')}
        </Text>
      </Box>
    )
  }
  const days = overdueDaysAt(row.dueOn, now)
  const late = days !== null && days > 0 && invoiceDocumentState(row, now) !== 'settled'
  return (
    <Box className="min-w-0">
      <Text element="span" size="sm">
        {formatDay(row.dueOn, locale)}
      </Text>
      {late ? (
        <Text element="span" size="xs" color="text-[var(--warning-soft-text)]" className="block">
          {t('invoiceReadiness.reminders.overdue', { count: days })}
        </Text>
      ) : null}
    </Box>
  )
}

function StateCell({
  row,
  now,
  canReadFinance,
  locale,
}: {
  row: InvoiceReadiness
  now: Date
  canReadFinance: boolean
  locale: string
}) {
  const { t } = useTranslation('missions')
  const state = invoiceDocumentState(row, now)
  if (state === 'draft') {
    return (
      <Box className="min-w-0 space-y-1">
        <StateBadge row={row} now={now} />
        <Text element="span" size="xs" color="text-muted-foreground" className="block">
          {t('invoices.noReceivable')}
        </Text>
      </Box>
    )
  }
  const outstanding = canReadFinance ? outstandingAmountCents(row) : null
  const paid = canReadFinance && row.paidAt ? row.paidAmountCents : null
  // Le reste dû se NOMME (c72, quatre statuts) : « Réglé X · reste dû Y » sur un partiel,
  // « Solde Y » sinon — jamais « 0 » d'un montant inconnu.
  const balance =
    outstanding === null
      ? null
      : paid !== null && outstanding > 0
        ? t('invoices.balancePartial', { paid: formatEuros(paid, locale), left: formatEuros(outstanding, locale) })
        : t('invoices.balance', { value: formatEuros(outstanding, locale) })
  return (
    <Box className="min-w-0 space-y-1">
      <StateBadge row={row} now={now} />
      {balance ? (
        <Text element="span" size="xs" color="text-muted-foreground" className="block">
          {balance}
        </Text>
      ) : null}
      {row.remindersSent > 0 ? (
        <Text
          element="span"
          size="xs"
          color={row.remindersSent >= MAX_REMINDERS ? 'text-[var(--warning-soft-text)]' : 'text-muted-foreground'}
          className="block"
        >
          {row.remindersSent >= MAX_REMINDERS
            ? t('invoices.remindersEscalate', { count: row.remindersSent })
            : row.lastReminderAt
              ? t('invoices.remindersLast', { count: row.remindersSent, date: formatDay(row.lastReminderAt, locale) })
              : t('invoices.reminders', { count: row.remindersSent })}
        </Text>
      ) : null}
    </Box>
  )
}
