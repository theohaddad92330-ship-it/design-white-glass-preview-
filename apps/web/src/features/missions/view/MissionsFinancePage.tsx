import { craStatusOf, type InvoiceReadiness, type RevenueKind, type RevenueLine } from '@bellum/contracts'
import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useExpenseReports } from '@/features/expenses/api'
import { CessionsSection } from '@/features/factoring/view/CessionsSection'
import { PaymentsPage } from '@/features/payments/view/PaymentsPage'
import { useFinanceAccess } from '@/features/propagation/api'
import {
  useAggregateMargin,
  useCollectionsWindow,
  useInvoicePayments,
  useInvoiceReadiness,
  useMissions,
  useRevenue,
} from '../api'
import { collectionMonths } from '../collections'
import { expectedCollectionsByWeek, receivablesKpis } from '../invoice-documents'
import { formatDay, formatEuros, formatMonth } from '../money-format'
import {
  ControlRow,
  DataWarning,
  FinanceCard,
  FinanceGuide,
  FinanceStat,
  FinanceStats,
  FinanceToolbar,
  InlineTitle,
  MultiSelectFilter,
  RowLine,
  ToolbarField,
  ToolbarSearch,
} from './FinanceTheo'

const lineOf = (lines: readonly RevenueLine[] | undefined, kind: RevenueKind) => lines?.find(line => line.kind === kind)

// Les bloqueurs qui tiennent à l'ACTIVITÉ (le relevé), distincts du tarif et de la commande.
const ACTIVITY_BLOCKERS = new Set([
  'missing_timesheet',
  'timesheet_not_submitted',
  'timesheet_not_validated',
  'timesheet_disputed',
  'timesheet_anomalies',
])

/**
 * LA VUE FINANCIÈRE sous Missions — « Revenu, marge et trésorerie » (Théo V22, `c/missions-finance.html`).
 *
 * Le droit Finance décide de tout (A6) : sans lui, l'écran est REMPLACÉ par une demande d'accès — la
 * marge et les règlements sont confidentiels. Sans réponse (chargement, panne) on ne montre PAS les
 * chiffres : le repli sûr est le plus fermé.
 *
 * L'ordre de la maquette : période → quatre chiffres → marge et « ce qui mérite une décision » → la
 * rentabilité mission par mission → les quatre prochaines semaines (et l'ancienneté, en lien) → achats
 * fournisseurs → ce qui sort (paiements, cessions repliées) → frais de mission → la revue du mois →
 * réglages. Les montants viennent des lectures existantes, jamais recalculés ; un chiffre sans source
 * s'écrit « non mesuré » avec sa raison, jamais « 0 € ».
 *
 * Bloqué (données que l'API n'a pas) : le MONTANT de marge agrégé (seul le pourcentage existe), la liste
 * transverse des factures fournisseurs (lue mission par mission), la revue de fin de mois consignée et
 * son journal des modifications, la refacturation d'une note de frais. Les chiffres agrégés ne se
 * filtrent que par période : compte et responsable resserrent le tableau des missions.
 */
export function MissionsFinancePage({ now }: { now?: Date } = {}) {
  const { t } = useTranslation('missions')
  const { digest, denied, failed, canReadFinance } = useFinanceAccess()
  const pending = !denied && !failed && digest === undefined && !canReadFinance

  return (
    <CustomerPage
      pageTitle={t('financeView.title')}
      pageSubtitle={t('financeView.lede')}
      breadcrumbs={[{ label: t('financeCrumb'), to: '/missions' }, { label: t('financeView.crumb') }]}
      pageTitleBadge={canReadFinance ? <Badge variant="primary">{t('financeView.visible')}</Badge> : undefined}
      screenGuide={<FinanceGuide guideKey="financeView.guide" />}
      anchorId="finance"
    >
      <Box className="space-y-4 py-4" data-screen="missions-finance">
        {denied ? (
          <Box
            className="rounded-card border border-dashed border-[var(--bellum-border)] bg-card p-6 text-center"
            role="status"
          >
            <Text element="h2" size="base" weight="semibold">
              {t('financeView.denied.title')}
            </Text>
            <Text element="p" size="sm" color="text-muted-foreground" className="mx-auto mt-1">
              {t('financeView.denied.body')}
            </Text>
          </Box>
        ) : failed ? (
          <Text element="p" size="sm">
            {t('financeView.statusFailed')}
          </Text>
        ) : pending ? (
          <Text size="sm" color="text-muted-foreground">
            {t('financeView.statusPending')}
          </Text>
        ) : (
          <FinanceBody now={now} />
        )}
      </Box>
    </CustomerPage>
  )
}

/**
 * Le corps — monté SEULEMENT quand le droit Finance est établi : les lectures ne partent donc jamais
 * pour un lecteur qui n'a pas le droit (un 403 évitable se rejoue et fait du bruit).
 */
function FinanceBody({ now }: { now?: Date }) {
  const { t, i18n } = useTranslation(['missions', 'expenses'])
  const reference = useMemo(() => now ?? new Date(), [now])
  const [month, setMonth] = useState('')
  const [accounts, setAccounts] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const period = month || undefined
  const revenue = useRevenue(period)
  const margin = useAggregateMargin(period)
  const readiness = useInvoiceReadiness(period)
  const missions = useMissions()
  const payments = useInvoicePayments()
  const expenses = useExpenseReports(period ? { month: period } : {})
  const { items: collections, canReadFinance: canReadCollections } = useCollectionsWindow(
    useMemo(() => collectionMonths(reference), [reference]),
  )
  const kpis = useMemo(() => receivablesKpis(collections, reference), [collections, reference])
  const forecast = useMemo(() => expectedCollectionsByWeek(collections, reference), [collections, reference])
  const locale = i18n.language

  const lines = revenue.data?.lines
  const money = (line: RevenueLine | undefined) =>
    !line ? (
      <UnknownValue reason={t('financeView.stats.unread')} />
    ) : line.amountCents === null ? (
      <UnknownValue reason={line.unavailableReason ?? t('financeView.stats.noSource')} />
    ) : (
      formatEuros(line.amountCents, locale)
    )
  const floor = (line: RevenueLine | undefined) =>
    line && line.amountCents !== null && line.withoutAmount > 0
      ? t('financeView.stats.floor', { count: line.withoutAmount })
      : null

  // La rentabilité, mission par mission : l'activité du mois (relevé, production) et la marge documentée
  // de la mission (tarif et coût de ses conditions). Une marge inconnue reste inconnue, jamais 0.
  const marginById = useMemo(
    () => new Map((missions.data?.missions ?? []).map(mission => [mission.id, mission.marginPercent] as const)),
    [missions.data],
  )
  const activity = useMemo(() => readiness.data?.items ?? [], [readiness.data])
  const activityMonth = readiness.data?.month ?? period ?? null
  const accountOptions = useMemo(
    () => [...new Set(activity.flatMap(row => (row.accountName ? [row.accountName] : [])))].sort(),
    [activity],
  )
  const ownerOptions = useMemo(
    () => [...new Set(activity.flatMap(row => (row.ownerName ? [row.ownerName] : [])))].sort(),
    [activity],
  )
  const visibleActivity = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return activity.filter(row => {
      if (accounts.length > 0 && !(row.accountName && accounts.includes(row.accountName))) return false
      if (owners.length > 0 && !(row.ownerName && owners.includes(row.ownerName))) return false
      if (!needle) return true
      return [row.accountName, row.missionLabel, row.invoiceReference].some(value =>
        value?.toLowerCase().includes(needle),
      )
    })
  }, [activity, accounts, owners, query])

  const blockedCount = readiness.data?.summary.blocked ?? null
  const readyCount = readiness.data?.summary.ready ?? null
  const activityBlocked = activity.filter(row => row.blockers.some(blocker => ACTIVITY_BLOCKERS.has(blocker))).length
  const missingPo = activity.filter(row => row.blockers.includes('missing_po')).length
  const unmatchedCents = payments.data
    ? payments.data.unmatched.reduce((total, payment) => total + payment.amountCents, 0)
    : null
  const coverage =
    margin.data && margin.data.measured + margin.data.unmeasured > 0
      ? margin.data.measured / (margin.data.measured + margin.data.unmeasured)
      : null
  const weekMax = Math.max(1, ...forecast.weeks.flatMap(week => (week.cents === null ? [] : [week.cents])))

  return (
    <>
      <FinanceToolbar label={t('financeView.toolbar')}>
        <ToolbarField label={t('financeView.period')}>
          <Input
            type="month"
            aria-label={t('financeView.period')}
            className="min-h-11 w-full sm:w-48 md:min-h-9"
            value={month}
            onChange={event => setMonth(event.target.value)}
          />
        </ToolbarField>
        {month ? (
          <Button variant="ghost" size="sm" className="self-end" onClick={() => setMonth('')}>
            {t('financeView.periodReset')}
          </Button>
        ) : null}
      </FinanceToolbar>

      <FinanceStats label={t('financeView.stats.label')}>
        <FinanceStat
          accent
          label={t('financeView.stats.produced')}
          value={money(lineOf(lines, 'produced'))}
          note={floor(lineOf(lines, 'produced')) ?? t('financeView.stats.producedNote')}
        />
        <FinanceStat
          to="/missions/factures"
          label={t('financeView.stats.invoiced')}
          value={money(lineOf(lines, 'invoiced'))}
          note={floor(lineOf(lines, 'invoiced')) ?? t('financeView.stats.invoicedNote')}
        />
        <FinanceStat
          to="/missions/encaissements"
          label={t('financeView.stats.collected')}
          value={money(lineOf(lines, 'collected'))}
          note={floor(lineOf(lines, 'collected')) ?? t('financeView.stats.collectedNote')}
        />
        <FinanceStat
          to="/missions/encaissements"
          label={t('financeView.stats.outstanding')}
          value={
            !canReadCollections ? (
              <UnknownValue reason={t('readiness.financeHidden')} />
            ) : kpis.remainingCents === null ? (
              <UnknownValue reason={t('collections.noAmount')} />
            ) : (
              formatEuros(kpis.remainingCents, locale)
            )
          }
          note={t('financeView.stats.outstandingNote')}
        />
      </FinanceStats>

      {/* `.v18-finance-hero` — la marge mesurée (et ce qui n'a pas pu l'être), puis ce qui mérite une décision. */}
      <Box className="grid grid-cols-1 gap-7 rounded-card border border-[var(--bellum-border)] bg-card p-6 lg:grid-cols-[1.1fr_1fr]">
        <section aria-labelledby="finance-margin" className="min-w-0">
          <Text
            element="h2"
            id="finance-margin"
            size="xs"
            weight="semibold"
            color="text-[var(--bellum-text-muted)]"
            className="uppercase tracking-wider"
          >
            {t('financeView.margin.kicker')}
          </Text>
          <Text element="p" size="4xl" weight="semibold" className="my-2 tabular-nums tracking-tight">
            {margin.data?.marginPercent == null ? (
              <UnknownValue reason={t('financeView.margin.unmeasured')} />
            ) : (
              new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(margin.data.marginPercent) + ' %'
            )}
          </Text>
          {margin.data ? (
            <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('financeView.margin.coverage', {
                measured: margin.data.measured,
                unmeasured: margin.data.unmeasured,
              })}
            </Text>
          ) : null}
          {coverage !== null ? (
            <div
              role="img"
              aria-label={t('financeView.margin.coverageBar', {
                value: new Intl.NumberFormat(locale, { style: 'percent' }).format(coverage),
              })}
              className="my-3 h-2 overflow-hidden rounded-badge bg-[var(--bellum-surface-2)]"
            >
              <span
                className="block h-full rounded-badge bg-[var(--bellum-text-accent)]"
                style={{ width: `${coverage * 100}%` }}
              />
            </div>
          ) : null}
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('financeView.atCompletion')}
          </Text>
        </section>
        <section aria-labelledby="finance-decisions" className="min-w-0">
          <Text element="h2" id="finance-decisions" size="base" weight="semibold">
            {t('financeView.decisions.title')}
          </Text>
          <ul className="mt-2">
            <DecisionRow
              to="/missions/cra"
              title={t('financeView.decisions.activity')}
              body={
                blockedCount === null
                  ? t('financeView.decisions.activityBody')
                  : blockedCount === 0
                    ? t('financeView.decisions.noneBlocked')
                    : t('financeView.decisions.blocked', { count: blockedCount })
              }
              tone={blockedCount ? 'warn' : 'ok'}
            />
            <DecisionRow
              to="/missions/facturation"
              title={t('financeView.decisions.orders')}
              body={
                readiness.data === undefined
                  ? t('financeView.decisions.ordersBody')
                  : missingPo === 0
                    ? t('financeView.decisions.noneMissingPo')
                    : t('financeView.decisions.missingPo', { count: missingPo })
              }
              tone={missingPo > 0 ? 'warn' : 'ok'}
            />
            <DecisionRow
              to="/missions/encaissements"
              title={t('financeView.decisions.late')}
              body={
                kpis.overdueCents === null || !canReadCollections ? (
                  <UnknownValue reason={t('collections.noAmount')} />
                ) : kpis.overdueCents === 0 ? (
                  t('financeView.decisions.noneLate')
                ) : (
                  t('financeView.decisions.lateAmount', { value: formatEuros(kpis.overdueCents, locale) })
                )
              }
              tone={kpis.overdueCents ? 'bad' : 'ok'}
            />
          </ul>
          <DataWarning>{t('financeView.margin.warning')}</DataWarning>
        </section>
      </Box>

      <InlineTitle title={t('financeView.byMission.title')} titleId="finance-by-mission">
        {activityMonth ? <Badge variant="primary">{formatMonth(activityMonth, locale)}</Badge> : null}
      </InlineTitle>
      <FinanceToolbar label={t('financeView.byMission.filters')}>
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
      <ResponsiveTable
        rows={visibleActivity}
        rowKey={row => `${row.missionId}-${row.periodMonth}`}
        empty={
          <Box className="rounded-card border border-dashed border-[var(--bellum-border)] p-4">
            <Text size="sm" color="text-muted-foreground">
              {readiness.isLoading
                ? t('common:states.loading')
                : activity.length > 0
                  ? t('financeView.byMission.filteredEmpty')
                  : t('financeView.byMission.empty')}
            </Text>
          </Box>
        }
        columns={[
          {
            key: 'mission',
            header: t('financeView.byMission.columns.mission'),
            mobile: 'title',
            className: 'max-w-[18rem] break-words',
            render: row => (
              <Box className="min-w-0">
                {row.missionLabel ? (
                  <span title={row.missionLabel}>
                    <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
                  </span>
                ) : (
                  <UnknownValue reason={t('collections.unknownMissionReason')} />
                )}
                <Text element="span" size="xs" color="text-muted-foreground" className="block">
                  {[row.accountName, row.ownerName].filter(Boolean).join(' · ')}
                </Text>
              </Box>
            ),
          },
          {
            key: 'days',
            header: t('financeView.byMission.columns.days'),
            className: 'text-right tabular-nums',
            render: row =>
              row.days === null || !['validated', null].includes(craStatusOf(row)) ? (
                <Text element="span" size="sm" color="text-[var(--warning-soft-text)]">
                  {t('financeView.byMission.toValidate')}
                </Text>
              ) : (
                String(row.days)
              ),
          },
          {
            key: 'produced',
            header: t('financeView.byMission.columns.produced'),
            className: 'text-right tabular-nums',
            render: row =>
              row.preparedAmountCents === null ? (
                <Text element="span" size="sm" color="text-muted-foreground">
                  {t('financeView.byMission.toFill')}
                </Text>
              ) : (
                formatEuros(row.preparedAmountCents, locale)
              ),
          },
          {
            key: 'cost',
            header: t('financeView.byMission.columns.cost'),
            className: 'text-right tabular-nums',
            render: row => (
              <MissionCost row={row} marginPercent={marginById.get(row.missionId) ?? null} locale={locale} />
            ),
          },
          {
            key: 'margin',
            header: t('financeView.byMission.columns.margin'),
            className: 'text-right tabular-nums',
            render: row => (
              <MissionMarginCell row={row} marginPercent={marginById.get(row.missionId) ?? null} locale={locale} />
            ),
          },
          {
            key: 'todo',
            header: t('financeView.byMission.columns.todo'),
            render: row => (
              <Button asChild variant="ghost" size="sm">
                <Link to="/missions/$id" params={{ id: row.missionId }}>
                  {marginById.get(row.missionId) == null
                    ? t('financeView.byMission.fillCost')
                    : t('financeView.byMission.terms')}
                </Link>
              </Button>
            ),
          },
        ]}
      />

      <Box className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Les quatre prochaines semaines : une prévision d'ÉCHÉANCES, jamais un solde bancaire. */}
        <FinanceCard title={t('financeView.weeks.title')} titleId="finance-weeks">
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('financeView.weeks.hint')}
          </Text>
          <ul className="mt-3 space-y-3">
            {forecast.weeks.map(week => (
              <li key={week.startsOn}>
                <Box className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text element="span" size="sm" weight="semibold">
                    {formatDay(week.startsOn, locale)} → {formatDay(week.endsOn, locale)}
                  </Text>
                  <Text element="span" size="sm" weight="semibold" color="text-[var(--bellum-text-accent)]">
                    {week.count === 0 ? (
                      t('financeView.weeks.none')
                    ) : week.cents === null ? (
                      <UnknownValue reason={t('collections.noAmount')} />
                    ) : (
                      formatEuros(week.cents, locale)
                    )}
                  </Text>
                </Box>
                <div aria-hidden="true" className="mt-2 h-2 overflow-hidden rounded-badge bg-[var(--bellum-surface-2)]">
                  {week.cents !== null && week.cents > 0 ? (
                    <span
                      className="block h-full rounded-badge bg-[var(--bellum-text-accent)]"
                      style={{ width: `${(week.cents / weekMax) * 100}%` }}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {forecast.unplaced.count > 0 ? (
            <DataWarning>
              {forecast.unplaced.cents === null
                ? t('financeView.weeks.unplacedUnknown', { count: forecast.unplaced.count })
                : t('financeView.weeks.unplaced', {
                    count: forecast.unplaced.count,
                    value: formatEuros(forecast.unplaced.cents, locale),
                  })}
            </DataWarning>
          ) : null}
        </FinanceCard>
        {/* L'ancienneté vit dans Encaissements (une donnée, un endroit — Louis) : ici, la porte. */}
        <FinanceCard title={t('collections.aging.title')} titleId="finance-aging">
          <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('financeView.aging.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to="/missions/encaissements">{t('financeView.weeks.aging')}</Link>
          </Button>
          <DataWarning>{t('collections.aging.hint')}</DataWarning>
        </FinanceCard>
      </Box>

      <InlineTitle title={t('financeView.suppliers.title')} titleId="finance-suppliers" />
      <FinanceCard title={t('financeView.suppliers.where')} titleId="finance-suppliers-where">
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('financeView.suppliers.body')}
        </Text>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link to="/missions">{t('financeView.missions')}</Link>
        </Button>
      </FinanceCard>

      {/* Ce qui sort (Théo V22, A4) : les paiements aux consultants vivent ICI — Encaissements y renvoie. */}
      <section id="sorties" aria-labelledby="finance-outgoing" className="scroll-mt-4">
        <InlineTitle title={t('financeView.outgoing.title')} titleId="finance-outgoing" />
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('financeView.outgoing.body')}
        </Text>
        <PaymentsPage now={now} embedded />
        <details className="group mt-2 rounded-card border border-[var(--bellum-border)] bg-card">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold">
            {t('financeView.cessions')}
          </summary>
          <Box className="border-t border-[var(--bellum-border)] px-4">
            <CessionsSection />
          </Box>
        </details>
      </section>

      <section aria-labelledby="finance-expenses">
        <InlineTitle title={t('financeView.expenses.title')} titleId="finance-expenses">
          <Button asChild variant="ghost" size="sm">
            <Link to="/expenses/bareme">{t('financeView.expenses.scale')}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/expenses">{t('financeView.expenses.reports')}</Link>
          </Button>
        </InlineTitle>
        <ResponsiveTable
          rows={expenses.data?.items ?? []}
          rowKey={report => report.id}
          empty={
            <Box className="rounded-card border border-dashed border-[var(--bellum-border)] p-4">
              <Text size="sm" color="text-muted-foreground">
                {expenses.isLoading ? t('common:states.loading') : t('financeView.expenses.empty')}
              </Text>
            </Box>
          }
          columns={[
            {
              key: 'bearer',
              header: t('financeView.expenses.columns.bearer'),
              mobile: 'title',
              className: 'max-w-[16rem] break-words',
              render: report => (
                <Box className="min-w-0">
                  <Text element="span" size="sm" weight="semibold" className="block">
                    {report.bearerName}
                  </Text>
                  <Text element="span" size="xs" color="text-muted-foreground" className="block">
                    {[report.missionLabel, report.accountName].filter(Boolean).join(' · ')}
                  </Text>
                </Box>
              ),
            },
            {
              key: 'report',
              header: t('financeView.expenses.columns.report'),
              mobile: 'meta',
              render: report => (
                <Box className="min-w-0">
                  <Text element="span" size="sm" className="block">
                    {report.reference}
                  </Text>
                  <Text element="span" size="xs" color="text-muted-foreground" className="block">
                    {t('financeView.expenses.lines', { count: report.lineCount })}
                    {report.submittedAt ? ` · ${formatDay(report.submittedAt, locale)}` : ''}
                  </Text>
                </Box>
              ),
            },
            {
              key: 'amount',
              header: t('financeView.expenses.columns.amount'),
              className: 'text-right tabular-nums',
              render: report =>
                report.totalAmountCents === null ? (
                  <UnknownValue reason={t('collections.noAmount')} />
                ) : (
                  formatEuros(report.totalAmountCents, locale)
                ),
            },
            {
              key: 'status',
              header: t('financeView.expenses.columns.status'),
              render: report => (
                <Box className="min-w-0 space-y-1">
                  <Badge variant={EXPENSE_VARIANT[report.status]}>{t(`expenses:status.${report.status}`)}</Badge>
                  {report.policyCheck.overageCount > 0 ? (
                    <Text element="span" size="xs" color="text-[var(--warning-soft-text)]" className="block">
                      {t('financeView.expenses.overage', { count: report.policyCheck.overageCount })}
                    </Text>
                  ) : null}
                </Box>
              ),
            },
          ]}
        />
      </section>

      <InlineTitle title={t('financeView.review.title')} titleId="finance-review" />
      <Box className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ReviewItem
          title={t('financeView.review.activity')}
          body={t('financeView.review.activityBody', { count: activityBlocked })}
          to="/missions/cra"
        />
        <ReviewItem
          title={t('financeView.review.billing')}
          body={
            blockedCount === null || readyCount === null
              ? t('financeView.decisions.activityBody')
              : t('financeView.review.billingBody', { blocked: blockedCount, ready: readyCount })
          }
          to="/missions/factures"
        />
        <ReviewItem
          title={t('financeView.review.cash')}
          body={[
            margin.data ? t('financeView.review.costs', { count: margin.data.unmeasured }) : null,
            unmatchedCents === null
              ? null
              : unmatchedCents === 0
                ? t('collections.receivables.nothingToMatch')
                : t('financeView.review.toMatch', { value: formatEuros(unmatchedCents, locale) }),
          ]
            .filter(Boolean)
            .join(' · ')}
          to="/missions/encaissements"
        />
      </Box>

      <Box className="flex flex-wrap gap-2 pt-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings/finance">{t('financeView.settingsLink')}</Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to="/missions">{t('financeView.missions')}</Link>
        </Button>
      </Box>
    </>
  )
}

const EXPENSE_VARIANT = { pending: 'warning', validated: 'success', rejected: 'danger', draft: 'default' } as const

function DecisionRow({
  to,
  title,
  body,
  tone,
}: {
  to: '/missions/cra' | '/missions/facturation' | '/missions/encaissements'
  title: string
  body: React.ReactNode
  tone: 'ok' | 'warn' | 'bad'
}) {
  return (
    <ControlRow
      as="li"
      tone={tone}
      title={
        <Link to={to} className="inline-flex min-h-11 items-center hover:underline md:min-h-6">
          {title}
        </Link>
      }
    >
      <RowLine>{body}</RowLine>
    </ControlRow>
  )
}

function ReviewItem({
  title,
  body,
  to,
}: {
  title: string
  body: string
  to: '/missions/cra' | '/missions/factures' | '/missions/encaissements'
}) {
  const { t } = useTranslation('missions')
  return (
    <Box className="rounded-card border border-[var(--bellum-border)] bg-card p-4">
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1.5">
        {body}
      </Text>
      <Link
        to={to}
        className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline md:min-h-8"
      >
        {t('financeView.review.openQueue')}
      </Link>
    </Box>
  )
}

/** Le coût DOCUMENTÉ du mois : la production moins la marge documentée de la mission (ses conditions). */
function MissionCost({
  row,
  marginPercent,
  locale,
}: {
  row: InvoiceReadiness
  marginPercent: number | null
  locale: string
}) {
  const { t } = useTranslation('missions')
  if (row.preparedAmountCents === null) {
    return (
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('financeView.byMission.activityToValidate')}
      </Text>
    )
  }
  if (marginPercent === null) {
    return <UnknownValue reason={t('financeView.byMission.costUnknown')} />
  }
  return <>{formatEuros(Math.round(row.preparedAmountCents * (1 - marginPercent / 100)), locale)}</>
}

function MissionMarginCell({
  row,
  marginPercent,
  locale,
}: {
  row: InvoiceReadiness
  marginPercent: number | null
  locale: string
}) {
  const { t } = useTranslation('missions')
  if (row.preparedAmountCents === null || marginPercent === null) {
    return (
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('financeView.byMission.notComputed')}
      </Text>
    )
  }
  return (
    <Box className="min-w-0">
      <Text element="span" size="sm" className="block">
        {formatEuros(Math.round((row.preparedAmountCents * marginPercent) / 100), locale)}
      </Text>
      <Text element="span" size="xs" color="text-muted-foreground" className="block">
        {t('financeView.byMission.marginShare', {
          value: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(marginPercent),
        })}
      </Text>
    </Box>
  )
}
