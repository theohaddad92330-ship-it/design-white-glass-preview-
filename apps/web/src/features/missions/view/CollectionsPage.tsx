import {
  hasPermission,
  isDisputeOpen,
  isPartiallyPaid,
  isSettled,
  outstandingAmountCents,
  type InvoiceReadiness,
} from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Text,
} from '@bellum/ui'
import { Download, MoreHorizontal } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useTeam } from '@/features/team/hooks/useTeam'
import {
  COLLECTIONS_WINDOW_MONTHS,
  collectionMonths,
  collectionStatus,
  isCollectible,
  lastCollectionAction,
  nextCollectionAction,
  overdueDaysAt,
  overdueSeverity,
  summarizeCollections,
  unmatchedPaymentsBucket,
  type CollectionAction,
  type CollectionStatus,
  type LastCollectionAction,
  type OverdueSeverity,
} from '../collections'
import {
  useCollectionsWindow,
  useInvoicePayments,
  useOpenDispute,
  useRecordPayment,
  useRecordReminder,
  useResolveDispute,
} from '../api'
import { formatDay, formatEuros, formatMonth } from '../money-format'
import { agingBuckets, receivablesKpis } from '../invoice-documents'
import { DisputeDialog } from './DisputeDialog'
import { useCollectionsExport } from './collectionsExport'
import { DueDateDialog, PromptModal } from './DueDateDialog'
import {
  ControlRow,
  DataWarning,
  FinanceBanner,
  FinanceCard,
  FinanceGuide,
  FinanceStat,
  FinanceStats,
  FinanceToolbar,
  LedgerLine,
  MultiSelectFilter,
  RowLine,
  ToolbarSearch,
} from './FinanceTheo'
import { FollowUpDialog } from './FollowUpDialog'
import { InvoiceDocumentDialog } from './InvoiceDocumentDialog'
import { StateBadge } from './InvoiceStateBadge'
import { PaymentDialog } from './PaymentDialog'
import { PaymentsToMatchCard, RecordPaymentDialog } from './PaymentsToMatchCard'

/**
 * ENCAISSEMENTS — la moitié « l'argent est-il rentré ? ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SECOND ÉCRAN, ET PAS UN ONGLET DE PLUS SUR LA FACTURATION
 * ─────────────────────────────────────────────────────────────────────────────
 * `/missions/facturation` s'arrête à « prêt à facturer » : il répare ce qui
 * EMPÊCHE d'émettre, mois par mois, bloqueur par bloqueur. Tout ce qui se passe
 * APRÈS l'émission — l'échéance, le retard, le litige, le règlement — vivait
 * déjà sur ses lignes, une par une, sans jamais être totalisé ni classé. La
 * donnée était intégralement en base et personne ne pouvait répondre à la seule
 * question qui compte pour la trésorerie : **combien nous doit-on, et depuis
 * quand ?**
 *
 * Les deux écrans ne montrent donc PAS la même population : celui-ci ne retient
 * que les mois FACTURÉS, l'autre tout le reste. Rien n'apparaît deux fois sous
 * la même forme avec le même contenu.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN N'A PAS, ET POURQUOI IL NE L'INVENTE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **la validation du relevé**. La source la veut en colonne.
 *    `validated_by_client_at` vit sur `mission_timesheets` et n'est jamais joint
 *    à la ligne de facturation : la colonne dirait « on ne sait pas » sur toutes
 *    les lignes, ce qui est du bruit et non une information. Elle arrivera quand
 *    la jointure existera.
 *  - **une échéance DÉRIVÉE des conditions de règlement**. Il n'y a pas de
 *    conditions de règlement dans le modèle ; `due_on` est saisie à la main.
 *    L'écran affiche donc ce qui a été saisi, et NOMME ce qui manque.
 *  - **le moindre envoi**. Doctrine `c31_relance_encaissement` : la relance se
 *    calcule et s'affiche, elle ne part jamais — et le brouillon est refusé au
 *    même titre tant qu'aucune capacité de messagerie n'atteint cet écran.
 */
export function CollectionsPage({ now, client }: { now?: Date; client?: string } = {}) {
  const { t, i18n } = useTranslation('missions')
  const reference = useMemo(() => now ?? new Date(), [now])
  const months = useMemo(() => collectionMonths(reference), [reference])
  const { items, canReadFinance, isLoading, failedMonths } = useCollectionsWindow(months)
  // #2198.45 — l'export ; même droit que le reste de l'écran, gardé par la
  // règle d'espace (#2081.14, `DataExit`).
  const collectionsExport = useCollectionsExport(t)
  const { team } = useTeam()
  const demo = useIsDemo()
  const canWriteFinance = team ? hasPermission(team.workspace.role, 'finance:write') : false

  const recordPayment = useRecordPayment()
  const openDispute = useOpenDispute()
  const resolveDispute = useResolveDispute()
  const recordReminder = useRecordReminder()
  const [disputing, setDisputing] = useState<InvoiceReadiness | null>(null)
  // #2419.4 — la ligne dont on enregistre le règlement, le temps d'en saisir
  // le MONTANT. Sans cette étape, `paid_amount_cents` restait toujours `null`.
  const [settling, setSettling] = useState<InvoiceReadiness | null>(null)
  // #2408.48 — le statut choisi dans les quatre compteurs cliquables. Un
  // SEUL à la fois : les quatre seaux sont disjoints par construction (une
  // ligne ne porte jamais deux statuts), les cumuler en ET viderait toujours
  // la liste — même règle que les tuiles de `InvoiceReadinessPanel.tsx`.
  const [following, setFollowing] = useState<InvoiceReadiness | null>(null)
  const [opened, setOpened] = useState<InvoiceReadiness | null>(null)
  const [recording, setRecording] = useState(false)
  const [accounts, setAccounts] = useState<string[]>([])
  const [owners, setOwners] = useState<string[]>([])
  const [query, setQuery] = useState('')
  // « File de suivi » (Théo) : les quatre statuts + « sans échéance », en multi-sélection (Louis 23/10).
  const [queue, setQueue] = useState<QueueKey[]>([])
  const [treating, setTreating] = useState<InvoiceReadiness | null>(null)
  const [dating, setDating] = useState<InvoiceReadiness | null>(null)

  const rows = useMemo(() => sortByUrgency(items.filter(isCollectible), reference), [items, reference])
  const summary = useMemo(() => summarizeCollections(rows, reference), [rows, reference])
  // Le compte de chaque file, sur le PARC ENTIER : un filtre choisi ne fait pas tomber les autres à zéro.
  const queueCounts = useMemo(() => {
    const counts: Record<QueueKey, number> = { overdue: 0, disputed: 0, pending: 0, no_due: 0, paid: 0 }
    for (const row of rows) for (const key of queueKeysOf(row, reference)) counts[key] += 1
    return counts
  }, [rows, reference])
  // Théo C missions-encaissements.R1 — les quatre tuiles d'encours, dérivées UNE fois (invoice-documents.ts).
  const kpis = useMemo(() => receivablesKpis(rows, reference), [rows, reference])
  const aging = useMemo(() => agingBuckets(rows, reference), [rows, reference])
  const payments = useInvoicePayments()
  const unmatched = useMemo(
    () => (payments.data ? unmatchedPaymentsBucket(payments.data.unmatched) : null),
    [payments.data],
  )
  /**
   * ⚠️ Le FILTRE resserre `visibleRows`, jamais `rows` : les compteurs
   * (`summary`, calculé sur `rows` juste au-dessus) doivent rester ceux du
   * PARC ENTIER une fois un statut choisi, sinon les trois autres seaux
   * tomberaient à zéro dès qu'on clique le premier — une pastille à « 0 »
   * qu'un clic remplit se lit comme une panne.
   */
  const visibleRows = useMemo(() => {
    const byStatus =
      queue.length > 0 ? rows.filter(row => queueKeysOf(row, reference).some(key => queue.includes(key))) : rows
    // `?client=` : resserre la LISTE sur un client, les compteurs restent ceux du parc.
    const byClient = client ? byStatus.filter(row => row.accountName === client) : byStatus
    const needle = query.trim().toLowerCase()
    // Compte et responsable : multi-sélection (Louis 23/10), un OU dans chaque critère.
    return byClient.filter(row => {
      if (accounts.length > 0 && !(row.accountName && accounts.includes(row.accountName))) return false
      if (owners.length > 0 && !(row.ownerName && owners.includes(row.ownerName))) return false
      if (!needle) return true
      return [row.accountName, row.missionLabel, row.invoiceReference, row.billingContactName].some(value =>
        value?.toLowerCase().includes(needle),
      )
    })
  }, [rows, queue, reference, client, accounts, owners, query])

  // Les options ne viennent que de ce que la file contient : un choix sans ligne n'existe pas.
  const accountOptions = useMemo(
    () => [...new Set(rows.flatMap(row => (row.accountName ? [row.accountName] : [])))].sort(),
    [rows],
  )
  const ownerOptions = useMemo(
    () => [...new Set(rows.flatMap(row => (row.ownerName ? [row.ownerName] : [])))].sort(),
    [rows],
  )
  // Une facture émise, impayée, sans échéance : elle n'entre dans AUCUNE tranche échue (A6) — nommée, jamais « 0 € ».
  const withoutDueDate = useMemo(() => rows.filter(row => !row.dueOn && !isSettled(row)), [rows])
  // Le journal : les règlements constatés, du plus récent au plus ancien.
  const journal = useMemo(
    () => rows.filter(row => row.paidAt).sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '')),
    [rows],
  )

  // Les règlements à rapprocher : la carte ancre la tuile « À rapprocher ».
  const scrollToMatch = () => document.getElementById('payments-to-match')?.scrollIntoView({ block: 'start' })
  // Les rappels DUS (relance due, ou trois relances sans réponse) et l'échu de plus de trente jours :
  // les deux alertes en tête de la file (Théo A2), calculées sur ce que la file montre.
  const dueReminders = useMemo(
    () =>
      visibleRows.flatMap(row => {
        const action = nextCollectionAction(row, reference)
        return action && (action.kind === 'remind' || action.kind === 'escalate_to_human') ? [{ row, action }] : []
      }),
    [visibleRows, reference],
  )
  const longOverdue = useMemo(
    () =>
      visibleRows.filter(row => {
        const days = overdueDaysAt(row.dueOn, reference)
        return !isSettled(row) && days !== null && days > 30
      }),
    [visibleRows, reference],
  )
  const money = (cents: number | null) =>
    !canReadFinance ? (
      <UnknownValue reason={t('readiness.financeHidden')} />
    ) : cents === null ? (
      <UnknownValue reason={t('collections.noAmount')} />
    ) : (
      formatEuros(cents, i18n.language)
    )
  const queueOn = (key: QueueKey) => queue.length === 1 && queue[0] === key
  const focusQueue = (key: QueueKey) => setQueue(current => (current.length === 1 && current[0] === key ? [] : [key]))

  return (
    <CustomerPage
      pageTitle={t('collections.headline')}
      pageSubtitle={t('collections.lede')}
      breadcrumbs={[{ label: t('financeCrumb'), to: '/missions' }, { label: t('collections.title') }]}
      screenGuide={<FinanceGuide guideKey="collections.guide" />}
      headerActions={
        <>
          {collectionsExport.canExport ? (
            <Button variant="outline" onClick={() => collectionsExport.run(months)}>
              <Download className="mr-2 size-4" aria-hidden="true" />
              {t('collections.export')}
            </Button>
          ) : null}
          {canWriteFinance ? <Button onClick={() => setRecording(true)}>{t('collections.record.open')}</Button> : null}
        </>
      }
    >
      <Box className="space-y-4 py-4" data-screen="missions-encaissements">
        {client ? (
          // Arrivée depuis un compte (A5) : le bandeau le dit et rend la sortie.
          <FinanceBanner
            title={t('collections.fromAccount.title', { name: client })}
            body={t('collections.fromAccount.body', { name: client })}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to="/missions/encaissements">{t('collections.fromAccount.clear')}</Link>
              </Button>
            }
          />
        ) : null}

        {isLoading ? (
          // ⚠️ Aucun chiffre pendant le chargement. « 0 € en retard » le temps
          // de douze requêtes fait refermer l'onglet avant que la vérité
          // n'arrive — c'est le zéro de chargement, et il ment.
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : (
          <>
            <FinanceToolbar label={t('collections.toolbar')}>
              <Box className="flex min-w-0 flex-col gap-0.5 self-center">
                <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('collections.situation', { date: formatDay(reference.toISOString(), i18n.language) })}
                </Text>
                <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('collections.window', { count: COLLECTIONS_WINDOW_MONTHS })}
                </Text>
                {failedMonths > 0 ? (
                  // Un total dont on ignore l'assiette est un total faux.
                  <Text element="p" size="xs" color="text-[var(--warning-soft-text)]">
                    {t('collections.partialWindow', { count: failedMonths })}
                  </Text>
                ) : null}
                {!canReadFinance ? (
                  // Le NOMBRE de factures n'est pas une donnée financière ; le MONTANT en est une.
                  <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('readiness.financeHidden')}
                  </Text>
                ) : null}
              </Box>
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
                placeholder={t('collections.queue.search')}
                value={query}
                onChange={setQuery}
              />
            </FinanceToolbar>

            {/* Théo C missions-encaissements.R1/N7 — Reste à recevoir · Dont échus · À rapprocher · Montant litigieux. */}
            <FinanceStats label={t('collections.receivables.label')}>
              <FinanceStat
                accent
                label={t('collections.receivables.remaining')}
                value={money(kpis.remainingCents)}
                note={t('collections.receivables.remainingNote')}
              />
              <FinanceStat
                label={t('collections.receivables.overdue')}
                value={money(kpis.overdueCents)}
                note={t('collections.receivables.overdueNote', {
                  date: formatDay(reference.toISOString(), i18n.language),
                })}
                selected={queueOn('overdue')}
                onClick={() => focusQueue('overdue')}
              />
              <FinanceStat
                label={t('collections.receivables.toMatch')}
                value={canReadFinance && unmatched !== null ? money(unmatched.amountCents) : money(null)}
                note={
                  unmatched === null
                    ? undefined
                    : unmatched.count === 0
                      ? t('collections.receivables.nothingToMatch')
                      : t('collections.receivables.toMatchCount', { count: unmatched.count })
                }
                {...(unmatched && unmatched.count > 0 && canReadFinance ? { onClick: scrollToMatch } : {})}
              />
              <FinanceStat
                label={t('collections.receivables.disputed')}
                value={money(kpis.disputedCents)}
                note={t('collections.receivables.disputedNote')}
                selected={queueOn('disputed')}
                onClick={() => focusQueue('disputed')}
              />
            </FinanceStats>

            {withoutDueDate.length > 0 ? (
              // A6 — « Sans échéance » n'est jamais « 0 € » : la facture est nommée, avec le geste pour la saisir.
              <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('collections.noDueNotice', {
                  count: withoutDueDate.length,
                  accounts: [
                    ...new Set(withoutDueDate.flatMap(row => (row.accountName ? [row.accountName] : []))),
                  ].join(', '),
                })}
                {canReadFinance && !withoutDueDate.some(row => outstandingAmountCents(row) === null)
                  ? ` ${t('collections.noDueAmount', {
                      value: formatEuros(
                        withoutDueDate
                          .flatMap(row => {
                            const left = outstandingAmountCents(row)
                            return left === null ? [] : [left]
                          })
                          .reduce((total, left) => total + left, 0),
                        i18n.language,
                      ),
                    })}`
                  : ''}{' '}
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center text-[var(--bellum-text-accent)] underline md:min-h-8"
                  onClick={() =>
                    withoutDueDate.length === 1 && withoutDueDate[0]
                      ? setDating(withoutDueDate[0])
                      : focusQueue('no_due')
                  }
                >
                  {t('invoices.enterDueDate')}
                </button>
              </Text>
            ) : null}

            <Box className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19.5rem]">
              <Box className="flex min-w-0 flex-col gap-4">
                {canReadFinance ? <PaymentsToMatchCard canWrite={canWriteFinance} locale={i18n.language} /> : null}

                <FinanceCard title={t('collections.queue.title')} titleId="due-queue">
                  <Box className="mb-3">
                    <FinanceToolbar>
                      <MultiSelectFilter
                        label={t('collections.queue.filter')}
                        allLabel={t('collections.queue.all')}
                        options={QUEUE_KEYS.map(key => {
                          // Les quatre statuts (jamais un cinquième, c72) portent leur MONTANT quand il se lit.
                          const bucket = key === 'no_due' ? null : summary[key]
                          const label = t('collections.queue.option', {
                            label: t(`collections.queue.keys.${key}`),
                            count: queueCounts[key],
                          })
                          return {
                            value: key,
                            label:
                              canReadFinance && bucket && bucket.count > 0 && bucket.amountCents !== null
                                ? `${label} · ${formatEuros(bucket.amountCents, i18n.language)}`
                                : label,
                          }
                        })}
                        values={queue}
                        onChange={next => setQueue(next as QueueKey[])}
                      />
                    </FinanceToolbar>
                  </Box>
                  {dueReminders.length > 0 ? (
                    <Box className="mb-2">
                      <FinanceBanner
                        tone="warn"
                        title={t('collections.alerts.reminders', { count: dueReminders.length })}
                        body={dueReminders
                          .slice(0, 3)
                          .map(({ row, action }) =>
                            action.kind === 'remind'
                              ? t('collections.alerts.remindLine', {
                                  account: row.accountName ?? t('collections.toMatch.unknownPayer'),
                                  index: action.index,
                                })
                              : t('collections.alerts.escalateLine', {
                                  account: row.accountName ?? t('collections.toMatch.unknownPayer'),
                                }),
                          )
                          .join(' ')}
                      />
                    </Box>
                  ) : null}
                  {longOverdue[0] ? (
                    <Box className="mb-2">
                      <FinanceBanner
                        tone="bad"
                        title={t('collections.alerts.longOverdue', { count: longOverdue.length })}
                        body={[
                          longOverdue[0].accountName,
                          longOverdue[0].invoiceReference,
                          (() => {
                            const left = canReadFinance ? outstandingAmountCents(longOverdue[0]) : null
                            return left === null ? null : formatEuros(left, i18n.language)
                          })(),
                          isDisputeOpen(longOverdue[0]) && longOverdue[0].disputedAt
                            ? t('collections.alerts.disputedSince', {
                                date: formatDay(longOverdue[0].disputedAt, i18n.language),
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        action={
                          <Button size="sm" variant="ghost" onClick={() => setOpened(longOverdue[0] ?? null)}>
                            {t('invoices.open')}
                          </Button>
                        }
                      />
                    </Box>
                  ) : null}

                  {visibleRows.length === 0 ? (
                    <Box className="rounded-card border border-dashed border-[var(--bellum-border)] p-4">
                      {/* #2408.48 — un état vide QUI NOMME SON FILTRE. */}
                      <Text size="sm" color="text-muted-foreground">
                        {queue.length > 0 ? t('collections.filteredEmpty') : t('collections.empty')}
                      </Text>
                      {queue.length > 0 ? (
                        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setQueue([])}>
                          {t('collections.clearStatusFilter')}
                        </Button>
                      ) : (
                        <Text element="p" size="xs" color="text-muted-foreground" className="mt-1">
                          {t('collections.emptyWhy')}
                        </Text>
                      )}
                    </Box>
                  ) : (
                    <ul aria-label={t('collections.queue.title')}>
                      {visibleRows.map(row => (
                        <DueRow
                          key={`${row.missionId}-${row.periodMonth}`}
                          row={row}
                          now={reference}
                          canReadFinance={canReadFinance}
                          locale={i18n.language}
                          pending={
                            recordPayment.isPending ||
                            openDispute.isPending ||
                            resolveDispute.isPending ||
                            recordReminder.isPending
                          }
                          onOpen={() => setOpened(row)}
                          onFollow={() => setFollowing(row)}
                          onTreatDispute={() => setTreating(row)}
                          onEnterDue={() => setDating(row)}
                          onRecordPayment={() => setSettling(row)}
                          onOpenDispute={() => setDisputing(row)}
                          onResolveDispute={() =>
                            resolveDispute.mutate({ missionId: row.missionId, month: row.periodMonth.slice(0, 7) })
                          }
                          onRecordReminder={() =>
                            recordReminder.mutate({ missionId: row.missionId, month: row.periodMonth.slice(0, 7) })
                          }
                        />
                      ))}
                    </ul>
                  )}
                  {rows.length > 0 ? (
                    // La phrase qui tient la doctrine, RÉUTILISÉE : le même sujet ne porte pas deux formulations.
                    <DataWarning>{t('invoiceReadiness.reminders.nothingIsSent')}</DataWarning>
                  ) : null}
                </FinanceCard>

                {/* Journal des règlements (Théo V22) : une absence ne fait aucune ligne — sans règlement, pas de carte. */}
                {canReadFinance && journal.length > 0 ? (
                  <FinanceCard title={t('collections.journal.title')} titleId="payments-journal">
                    <ul aria-label={t('collections.journal.title')}>
                      {journal.map(row => (
                        <ControlRow
                          as="li"
                          key={`${row.missionId}-${row.periodMonth}`}
                          tone="ok"
                          title={`${
                            row.paidAmountCents === null
                              ? t('invoices.dialog.settledUnknown')
                              : formatEuros(row.paidAmountCents, i18n.language)
                          } · ${row.accountName ?? t('collections.unknownAccountReason')}`}
                          actions={
                            <Button size="sm" variant="ghost" onClick={() => setOpened(row)}>
                              {t('collections.journal.see')}
                            </Button>
                          }
                        >
                          <RowLine>
                            {[
                              row.paidAt ? formatDay(row.paidAt, i18n.language) : null,
                              row.invoiceReference ?? formatMonth(row.periodMonth, i18n.language),
                              isPartiallyPaid(row) ? t('collections.journal.partial') : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </RowLine>
                        </ControlRow>
                      ))}
                    </ul>
                  </FinanceCard>
                ) : null}
              </Box>

              <Box as="aside" className="flex min-w-0 flex-col gap-4">
                {/* Théo C missions-encaissements.N3 — l'ancienneté de l'encours : ce que le CLIENT doit, jamais la personne. */}
                <FinanceCard title={t('collections.aging.title')} titleId="collections-aging">
                  <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t('collections.aging.asOf', { date: formatDay(reference.toISOString(), i18n.language) })}
                  </Text>
                  <AgingBar buckets={aging} />
                  {aging.map(bucket => (
                    <LedgerLine
                      key={bucket.key}
                      label={t(`collections.aging.${bucket.key}`)}
                      note={
                        bucket.key === 'no_due_date' && bucket.count > 0
                          ? t('collections.aging.toEnter', { count: bucket.count })
                          : undefined
                      }
                      value={
                        !canReadFinance ? (
                          t('collections.aging.count', { count: bucket.count })
                        ) : bucket.amountCents === null ? (
                          <UnknownValue reason={t('collections.noAmount')} />
                        ) : (
                          formatEuros(bucket.amountCents, i18n.language)
                        )
                      }
                    />
                  ))}
                  <DataWarning>{t('collections.aging.hint')}</DataWarning>
                </FinanceCard>

                {/* Théo C missions-encaissements.N5 — les règles de suivi, texte permanent. */}
                <FinanceCard title={t('collections.rules.title')} titleId="collections-rules">
                  <Box className="space-y-2">
                    {(['sameClient', 'creditNote', 'overpayment', 'noAuto', 'dispute'] as const).map(rule => (
                      <Text key={rule} element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                        {t(`collections.rules.${rule}`)}
                      </Text>
                    ))}
                  </Box>
                </FinanceCard>

                {/* « Ce qui sort » (Théo V22, A4) : les paiements et les cessions vivent dans la vue financière — un lien, jamais une copie. */}
                <FinanceCard title={t('collections.outgoing.title')} titleId="collections-outgoing">
                  <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
                    {t('collections.outgoing.hint')}
                  </Text>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link to="/missions/finance" hash="sorties">
                      {t('collections.outgoing.open')}
                    </Link>
                  </Button>
                </FinanceCard>
              </Box>
            </Box>
          </>
        )}

        {disputing ? (
          <PromptModal title={t('readiness.disputeTitle')} onClose={() => setDisputing(null)}>
            <DisputeDialog
              pending={openDispute.isPending}
              onCancel={() => setDisputing(null)}
              onConfirm={reason => {
                openDispute.mutate({
                  missionId: disputing.missionId,
                  month: disputing.periodMonth.slice(0, 7),
                  reason,
                })
                setDisputing(null)
              }}
            />
          </PromptModal>
        ) : null}

        {treating ? (
          // « Traiter le litige » (Théo `dlg-dispute`) : le motif consigné, puis lever — ou ne rien changer.
          <PromptModal
            title={t('collections.treat.title', { reference: treating.invoiceReference ?? treating.accountName ?? '' })}
            onClose={() => setTreating(null)}
          >
            <Text element="p" size="sm">
              {treating.disputeReason ?? t('invoices.dialog.disputeNoReason')}
            </Text>
            {treating.disputedAt ? (
              <Text element="p" size="xs" color="text-muted-foreground">
                {t('collections.lastAction.disputed', { date: formatDay(treating.disputedAt, i18n.language) })}
              </Text>
            ) : null}
            <Box className="flex flex-wrap justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setTreating(null)}>
                {t('collections.treat.keep')}
              </Button>
              {canWriteFinance ? (
                <Button
                  disabled={resolveDispute.isPending}
                  onClick={() => {
                    resolveDispute.mutate({ missionId: treating.missionId, month: treating.periodMonth.slice(0, 7) })
                    setTreating(null)
                  }}
                >
                  {t('readiness.resolveDispute')}
                </Button>
              ) : null}
            </Box>
          </PromptModal>
        ) : null}

        {following ? (
          <FollowUpDialog
            row={following}
            now={reference}
            locale={i18n.language}
            canWrite={canWriteFinance}
            pending={recordReminder.isPending}
            onRecordReminder={() => {
              recordReminder.mutate({ missionId: following.missionId, month: following.periodMonth.slice(0, 7) })
              setFollowing(null)
            }}
            onClose={() => setFollowing(null)}
          />
        ) : null}

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

        {recording ? <RecordPaymentDialog onClose={() => setRecording(false)} /> : null}

        {settling ? (
          <PromptModal title={t('collections.paymentTitle')} onClose={() => setSettling(null)}>
            <PaymentDialog
              pending={recordPayment.isPending}
              onCancel={() => setSettling(null)}
              onConfirm={amountCents => {
                // Un montant absent ne s'envoie PAS à zéro : la propriété est
                // omise, et le serveur consigne un règlement non mesuré.
                recordPayment.mutate({
                  missionId: settling.missionId,
                  month: settling.periodMonth.slice(0, 7),
                  ...(amountCents === null ? {} : { amountCents }),
                })
                setSettling(null)
              }}
            />
          </PromptModal>
        ) : null}
      </Box>
    </CustomerPage>
  )
}

/**
 * L'ordre de la file : ce qui appelle un geste d'abord.
 *
 * Un litige en tête (il suspend la cadence et se règle à la main), puis les
 * retards du plus ancien au plus récent, puis ce qui n'est pas encore dû, puis
 * ce qui est réglé. Trier par mois mettrait en haut la facture qui vient de
 * partir — c'est-à-dire la seule sur laquelle il n'y a rien à faire.
 */
function sortByUrgency(items: readonly InvoiceReadiness[], now: Date): InvoiceReadiness[] {
  const rank: Record<CollectionStatus, number> = { disputed: 0, overdue: 1, pending: 2, paid: 3 }
  return [...items].sort((left, right) => {
    const byStatus = rank[collectionStatus(left, now)] - rank[collectionStatus(right, now)]
    if (byStatus !== 0) return byStatus
    return (
      (overdueDaysAt(right.dueOn, now) ?? Number.NEGATIVE_INFINITY) -
      (overdueDaysAt(left.dueOn, now) ?? Number.NEGATIVE_INFINITY)
    )
  })
}

const STATUS_VARIANT: Readonly<Record<CollectionStatus, 'success' | 'default' | 'danger' | 'primary'>> = {
  paid: 'success',
  pending: 'primary',
  overdue: 'danger',
  disputed: 'danger',
}

// Les files de la « File de suivi », dans l'ordre de la maquette (échus, litiges, à échoir, sans échéance) + réglées.
const QUEUE_KEYS = ['overdue', 'disputed', 'pending', 'no_due', 'paid'] as const
type QueueKey = (typeof QUEUE_KEYS)[number]

/** Les files d'une ligne : son statut (un seul, c72), et « sans échéance » en plus quand elle n'en a pas. */
function queueKeysOf(row: InvoiceReadiness, now: Date): QueueKey[] {
  const status = collectionStatus(row, now)
  return !row.dueOn && !isSettled(row) ? [status, 'no_due'] : [status]
}

/** La gravité porte sa couleur par une VARIANTE de badge : une classe de la
 *  palette Tailwind ne suivrait pas le thème, et aucune nuance fixe ne passe AA
 *  des deux côtés. */
const SEVERITY_VARIANT: Readonly<Record<OverdueSeverity, 'secondary' | 'warning' | 'danger'>> = {
  fresh: 'secondary',
  late: 'warning',
  critical: 'danger',
}

/**
 * #2198.7 — la dernière action CONSIGNÉE, avec sa date. `null` = rien encore :
 * une ligne qui vient d'entrer dans la fenêtre n'a appelé aucun geste, ce n'est
 * pas une absence de mesure (`UnknownValue`), c'est un fait vrai — la cellule
 * reste donc vide plutôt que de porter une phrase qui ne dirait rien de plus.
 */
function LastActionCell({ action, locale }: { action: LastCollectionAction | null; locale: string }) {
  const { t } = useTranslation('missions')
  if (action === null) return null
  return (
    <Text element="span" size="xs">
      {t(`collections.lastAction.${action.kind}`, { date: formatDay(action.at, locale) })}
    </Text>
  )
}

/** Ce qu'un HUMAIN va faire ensuite. Aucune de ces phrases ne promet un envoi. */
function NextActionCell({ action }: { action: CollectionAction | null }) {
  const { t } = useTranslation('missions')
  if (action === null) return null
  if (action.kind === 'remind') {
    return (
      <Text element="span" size="xs">
        {t('invoiceReadiness.reminders.rank', { index: action.index })}
      </Text>
    )
  }
  return (
    <Text element="span" size="xs">
      {t(`collections.actions.${action.kind}`)}
    </Text>
  )
}

/**
 * Les gestes de la ligne, dans un menu NOMMÉ.
 *
 * Un bouton qui ne montre qu'une icône porte un nom (GA-32) ; ce qui se clique
 * se tabule (GA-35) — `DropdownMenuTrigger` rend un vrai bouton.
 *
 * ⚠️ « Annuler le facturé » n'est PAS ici : c'est un geste de facturation, il
 * vit sur `/missions/facturation` avec son motif obligatoire. Le dupliquer ferait
 * deux portes vers la même écriture, et l'une des deux finirait par diverger.
 */
function RowMenu({
  row,
  pending,
  onRecordPayment,
  onOpenDispute,
  onResolveDispute,
  onRecordReminder,
}: {
  row: InvoiceReadiness
  pending: boolean
  onRecordPayment: () => void
  onOpenDispute: () => void
  onResolveDispute: () => void
  onRecordReminder: () => void
}) {
  const { t } = useTranslation('missions')
  const disputed = isDisputeOpen(row)
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t('collections.rowMenu')} disabled={pending}>
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t('collections.rowMenu')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {/* #2419.4 — un paiement partiel ne sort pas de la file : ce geste
            disparaissait dès que `paidAt` était posée, et il n'existait alors
            plus AUCUNE porte pour enregistrer le solde. Le partiel était
            irréversible côté écran. Le critère est le SOLDE. */}
        {!isSettled(row) ? (
          <DropdownMenuItem onSelect={() => onRecordPayment()}>{t('collections.markPaid')}</DropdownMenuItem>
        ) : null}
        {/* On ne conteste qu'une fois : sur une ligne déjà en litige, le seul
            geste qui reste est de le LEVER. */}
        {disputed ? (
          <DropdownMenuItem onSelect={() => onResolveDispute()}>{t('readiness.resolveDispute')}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onOpenDispute()}>{t('readiness.openDispute')}</DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => onRecordReminder()}>{t('readiness.recordReminder')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Une échéance de la file (`.v18-control-row`, Théo) : le client et ce qu'il doit, puis la pièce et
 * son échéance, puis le contexte (litige, partiel, relances, source), puis qui appeler et où on en
 * est. Les douze colonnes de l'ancien tableau y sont toutes, en lignes : rien n'a été retiré.
 */
function DueRow({
  row,
  now,
  canReadFinance,
  locale,
  pending,
  onOpen,
  onFollow,
  onTreatDispute,
  onEnterDue,
  onRecordPayment,
  onOpenDispute,
  onResolveDispute,
  onRecordReminder,
}: {
  row: InvoiceReadiness
  now: Date
  canReadFinance: boolean
  locale: string
  pending: boolean
  onOpen: () => void
  onFollow: () => void
  onTreatDispute: () => void
  onEnterDue: () => void
  onRecordPayment: () => void
  onOpenDispute: () => void
  onResolveDispute: () => void
  onRecordReminder: () => void
}) {
  const { t } = useTranslation('missions')
  const status = collectionStatus(row, now)
  const disputed = isDisputeOpen(row)
  const settled = isSettled(row)
  const days = overdueDaysAt(row.dueOn, now)
  const late = !(settled && !disputed) && days !== null && days > 0
  const outstanding = canReadFinance ? outstandingAmountCents(row) : null
  const partial = canReadFinance && isPartiallyPaid(row)
  const account = row.accountName ?? t('collections.unknownAccountReason')
  const amount = !canReadFinance
    ? null
    : row.invoicedAmountCents === null
      ? null
      : formatEuros(row.invoicedAmountCents, locale)
  const tone = disputed || (late && days !== null && days > 30) ? 'bad' : late ? 'warn' : settled ? 'ok' : 'neutral'
  const next = nextCollectionAction(row, now)
  const last = lastCollectionAction(row)
  return (
    <ControlRow
      as="li"
      tone={tone}
      title={amount ? `${account} · ${amount}` : account}
      actions={
        <>
          <Button size="sm" variant="outline" onClick={onOpen}>
            {t('invoices.open')}
          </Button>
          {disputed ? (
            <Button size="sm" variant="ghost" onClick={onTreatDispute}>
              {t('collections.treat.open')}
            </Button>
          ) : !row.dueOn && !settled ? (
            <Button size="sm" variant="ghost" onClick={onEnterDue}>
              {t('invoices.enterDueDate')}
            </Button>
          ) : !settled ? (
            <Button size="sm" variant="ghost" onClick={onFollow}>
              {t('collections.followUp.follow')}
            </Button>
          ) : null}
          <RowMenu
            row={row}
            pending={pending}
            onRecordPayment={onRecordPayment}
            onOpenDispute={onOpenDispute}
            onResolveDispute={onResolveDispute}
            onRecordReminder={onRecordReminder}
          />
        </>
      }
    >
      <Box className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* #2198.21 — le motif du litige en infobulle sur son badge. */}
        <Badge
          variant={STATUS_VARIANT[status]}
          title={status === 'disputed' ? (row.disputeReason ?? undefined) : undefined}
        >
          {t(`collections.status.${status}`)}
        </Badge>
        {late && days !== null ? (
          <Badge variant={SEVERITY_VARIANT[overdueSeverity(days)]}>
            {t('invoiceReadiness.reminders.overdue', { count: days })}
          </Badge>
        ) : null}
        <RowLine>
          {row.invoiceReference ?? t('invoices.noReference')} · {formatMonth(row.periodMonth, locale)} ·{' '}
          {row.dueOn ? (
            t('collections.row.due', { date: formatDay(row.dueOn, locale) })
          ) : (
            // ⚠️ Réparable en une saisie : le taire ferait passer la facture pour « sous contrôle ».
            <UnknownValue reason={t('collections.noDueDate')} />
          )}
        </RowLine>
      </Box>
      <RowLine>
        {row.missionLabel ? (
          // #2516 — le nom complet en infobulle quand la mention le tronque.
          <span title={row.missionLabel}>
            <ObjectMention kind="mission" id={row.missionId} name={row.missionLabel} />
          </span>
        ) : (
          <UnknownValue reason={t('collections.unknownMissionReason')} />
        )}
        {row.state === 'invoiced_declared' ? ` · ${t('collections.row.declared')}` : ''}
      </RowLine>
      {disputed ? <RowLine tone="bad">{row.disputeReason ?? t('invoices.dialog.disputeNoReason')}</RowLine> : null}
      {partial && outstanding !== null && row.paidAmountCents !== null ? (
        // #2419.4 — le reste dû se NOMME sur la ligne, la facture reste dans sa file (c72).
        <RowLine tone="warn">
          {t('invoices.balancePartial', {
            paid: formatEuros(row.paidAmountCents, locale),
            left: formatEuros(outstanding, locale),
          })}
        </RowLine>
      ) : null}
      <RowLine>
        {t('collections.row.contact')}{' '}
        {row.billingContactName ? (
          <strong className="font-medium text-[var(--bellum-text-primary)]">{row.billingContactName}</strong>
        ) : (
          <UnknownValue reason={t('collections.unknownContactReason')} />
        )}
        {' · '}
        {row.remindersSent === 0
          ? t('collections.row.noReminder')
          : t('collections.row.reminders', { count: row.remindersSent })}
      </RowLine>
      {last || next ? (
        <Box className="flex flex-wrap gap-x-2 text-xs text-[var(--bellum-text-secondary)]">
          <LastActionCell action={last} locale={locale} />
          {last && next ? <span aria-hidden="true">→</span> : null}
          <NextActionCell action={next} />
        </Box>
      ) : null}
    </ControlRow>
  )
}

// La barre de l'ancienneté (`.v18-aging-visual`) : décorative, les montants sont dans les lignes dessous.
const AGING_TONE: Readonly<Record<string, string>> = {
  not_due: 'bg-[var(--bellum-text-accent)]',
  d1_30: 'bg-[var(--warning-soft-text)]',
  d31_60: 'bg-[var(--danger-soft-text)]',
  d61_90: 'bg-[var(--danger-soft-border)]',
  d90_plus: 'bg-[var(--bellum-text-primary)]',
  no_due_date: 'bg-[var(--bellum-border-strong)]',
}

function AgingBar({ buckets }: { buckets: readonly { key: string; amountCents: number | null }[] }) {
  // Une tranche au montant inconnu rend la barre fausse : elle ne se dessine pas, les lignes disent l'absence.
  const known = buckets.flatMap(bucket =>
    bucket.amountCents === null ? [] : [{ key: bucket.key, cents: bucket.amountCents }],
  )
  const total = known.reduce((sum, bucket) => sum + bucket.cents, 0)
  if (total <= 0 || known.length !== buckets.length) return null
  return (
    <div aria-hidden="true" className="my-4 flex h-2 overflow-hidden rounded-badge bg-[var(--bellum-surface-2)]">
      {known.map(bucket =>
        bucket.cents > 0 ? (
          <span
            key={bucket.key}
            className={cn('h-full', AGING_TONE[bucket.key])}
            style={{ width: `${(bucket.cents / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  )
}
