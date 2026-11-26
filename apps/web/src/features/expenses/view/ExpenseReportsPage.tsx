import type {
  ExpenseCategory,
  ExpenseReportStatus,
  ExpenseReportSummaryView,
  ExpenseReportVerification,
  ExpensePolicyBoard,
} from '@bellum/contracts'
import { DEFAULT_EXPENSE_PAGE_SIZE, EXPENSE_CATEGORIES, EXPENSE_PAGE_SIZES, capForCategory } from '@bellum/contracts'
import { Badge, Box, Button, Input, SearchEmptyState, SelectField, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CustomerPage } from '@/components/page/CustomerPage'
import { MeasuredValue } from '@/components/primitives/UnknownValue'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import {
  THEO_NUM_COLUMN,
  THEO_TABLE_FRAME,
  TheoCard,
  TheoDotRow,
  TheoScreenGuide,
  TheoScreenHead,
  TheoStat,
  TheoStats,
  TheoToolbar,
  TheoToolbarField,
} from '@/features/missions/view/TheoScreenBlocks'
import { toCsv } from '@/lib/csv'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { formatDate, formatMonth } from '@/lib/locale'
import { formatCents } from '@/lib/money'
import { useExpensePolicies, useExpenseReportDetail, useExpenseReports } from '../api'
import { ExpenseReportEditor } from './ExpenseReportEditor'
// ⚠️ Import à EFFET — voir `../i18n.ts`. `config.ts` et `resources.ts` étaient
// hors du périmètre de ce lot ; l'intégrateur y branche le namespace et
// supprime cette ligne.
import '../i18n'
import { STATUS_VARIANT } from '../presentation'
import { ExpenseReportDrawer } from './ExpenseReportDrawer'

/**
 * LES NOTES DE FRAIS — la file, et le dossier qui s'ouvre à côté.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES TUILES DISENT, ET CE QU'ELLES NE DISENT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Les COMPTES sortent toujours : « quinze notes attendent » n'est pas une
 * information financière, et c'est le seul chiffre qui dit quoi faire. Les
 * MONTANTS, eux, passent par `finance:read` — et quand ils ne passent pas,
 * l'écran écrit « montants réservés » plutôt que « 0,00 € ». Le serveur envoie
 * `canReadFinance` avec la réponse pour que cette phrase-là soit possible :
 * sans lui, « pas le droit » et « pas mesuré » seraient le même `null`.
 *
 * ⚠️ Les tuiles ignorent le filtre d'ÉTAT — elles le REMPLACENT. Sur une liste
 * filtrée « en attente », des tuiles filtrées afficheraient 15 / 0 / 0 et
 * feraient conclure qu'il n'y a jamais rien eu de validé.
 */
export function ExpenseReportsPage() {
  const { t } = useTranslation('expenses')
  const [month, setMonth] = useState('')
  const [status, setStatus] = useState<ExpenseReportStatus | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(DEFAULT_EXPENSE_PAGE_SIZE)
  /** `null` = fermé ; `'new'` = dépôt ; un identifiant = correction. */
  const [editing, setEditing] = useState<string | 'new' | null>(null)

  // ⚠️ Tout changement de FILTRE ramène à la page 1. Rester en page 3 sur un
  // filtre qui n'a qu'une page rendrait une liste vide, qu'on lirait « il n'y a
  // rien » — alors qu'il y a tout, une page plus tôt.
  useEffect(() => {
    setPage(1)
  }, [month, status, accountId, search, pageSize])

  const filters = useMemo(
    () => ({
      month: month || undefined,
      status: status ?? undefined,
      accountId: accountId ?? undefined,
      search: search.trim() || undefined,
      page,
      pageSize,
    }),
    [month, status, accountId, search, page, pageSize],
  )
  const { data, isLoading, isError } = useExpenseReports(filters)
  // Théo C missions-notes-de-frais.N5 — « Le barème appliqué » LIT le réglage ; il ne l'édite pas
  // (la porte d'écriture reste `/expenses/bareme`, le temps que Réglages › Espace la porte).
  const policies = useExpensePolicies()
  // La note qu'on corrige est relue en entier : la liste ne porte ni ses lignes
  // ni ses pièces, et un formulaire ouvert sur une note tronquée les EFFACERAIT
  // à l'enregistrement, puisqu'il envoie tout.
  const { data: editingReport } = useExpenseReportDetail(editing !== null && editing !== 'new' ? editing : null)

  const canReadFinance = data?.canReadFinance ?? false
  const tiles = data?.tiles
  // Le total de la PÉRIODE, tous états confondus : c'est lui qui permet de dire
  // « c'est le filtre qui a vidé la liste » plutôt que « le mois est vide ».
  // ⚠️ Les brouillons EN font partie depuis le 31/08/2026 : les oublier ferait
  // conclure « le mois est vide » sur une période qui ne porte que des
  // brouillons, c'est-à-dire au moment précis où l'on découvre l'écran.
  const periodTotal = tiles ? tiles.pending.count + tiles.validated.count + tiles.rejected.count + tiles.draft.count : 0
  // ⚠️ Pas de `?? 0` ici : un total qu'on n'a PAS lu n'est pas « zéro note ».
  // La barre de pagination ne se rend qu'une fois le total connu — écrire
  // « 0–0 sur 0 » pendant le chargement se lirait « il n'y a rien » (GA-19).
  const total = data?.total
  const overageCount = data?.verification.overages.length ?? null

  // Théo C missions-notes-de-frais.N2 — Laura sait sur quel écran on est, et ce qui attend.
  useLauraContext({
    kind: 'screen',
    label: t('page.title'),
    entityId: null,
    facets: tiles ? [{ label: t('laura.pending'), value: String(tiles.pending.count) }] : [],
    state: isLoading ? 'loading' : 'ready',
    purpose: t('laura.purpose'),
  })

  const accountOptions = [
    { value: ALL_ACCOUNTS, label: t('page.allAccounts') },
    ...(policies.data?.accounts ?? []).map(account => ({ value: account.id, label: account.name })),
  ]

  // Théo C missions-notes-de-frais.N4 — Porteur · mission | Référence | Lignes | Montant TTC | Barème | Statut | Ouvrir.
  const columns = [
    {
      key: 'bearer',
      header: t('table.bearerMission'),
      mobile: 'title' as const,
      render: (row: ExpenseReportSummaryView) => (
        <Box>
          <Text element="span" size="sm" weight="medium" className="block">
            {row.bearerName}
          </Text>
          {[row.missionLabel, row.accountName].filter(Boolean).length > 0 ? (
            <Text element="span" size="xs" color="text-muted-foreground" className="block">
              {[row.missionLabel, row.accountName].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'reference',
      header: t('table.reference'),
      mobile: 'meta' as const,
      render: (row: ExpenseReportSummaryView) => (
        <Box>
          <Text element="span" size="sm" className="block">
            {row.reference}
          </Text>
          <Text element="span" size="xs" color="text-muted-foreground" className="block">
            {formatMonth(row.periodMonth) ?? row.periodMonth}
          </Text>
        </Box>
      ),
    },
    {
      key: 'lines',
      header: t('table.lines'),
      className: THEO_NUM_COLUMN,
      render: (row: ExpenseReportSummaryView) => (
        // Un compte de lignes n'est pas une mesure absente : zéro ligne est
        // zéro ligne, et c'est vrai. On l'écrit tel quel.
        <Text element="span" size="sm">
          {row.lineCount}
        </Text>
      ),
    },
    {
      key: 'total',
      header: t('table.totalTtc'),
      className: THEO_NUM_COLUMN,
      render: (row: ExpenseReportSummaryView) => (
        <Text element="div" size="sm" weight="medium">
          {/* ⚠️ Jamais `?? 0` : « 0,00 € » se lirait « note vide ». */}
          <MeasuredValue value={row.totalAmountCents} format={value => formatCents(Number(value))} />
        </Text>
      ),
    },
    {
      key: 'policy',
      header: t('table.policy'),
      render: (row: ExpenseReportSummaryView) => <PolicyCell row={row} />,
    },
    {
      key: 'status',
      header: t('table.status'),
      render: (row: ExpenseReportSummaryView) => (
        <Box>
          <Badge variant={STATUS_VARIANT[row.status]}>{t(`status.${row.status}`)}</Badge>
          <Text element="span" size="xs" color="text-muted-foreground" className="mt-0.5 block">
            {statusNote(row, t)}
          </Text>
        </Box>
      ),
    },
    {
      key: 'open',
      header: t('table.openRow'),
      mobile: 'field' as const,
      render: (row: ExpenseReportSummaryView) => (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 md:min-h-8"
          aria-label={t('table.openNote', { name: row.bearerName })}
          onClick={() => setOpenId(row.id)}
        >
          {t('table.openRow')}
        </Button>
      ),
    },
  ]

  const toggleStatus = (value: ExpenseReportStatus) => setStatus(current => (current === value ? null : value))

  // « Exporter » (maquette) : le CSV des notes AFFICHÉES — le filtre et la page à l'écran —, par la
  // seule porte de sortie des données (`useDataExit`). Sans autorisation d'espace, le bouton n'existe
  // pas. Sans droit financier, la colonne Montant reste vide : un montant réservé ne sort pas en fichier.
  const dataExit = useDataExit()
  const visible = data?.items ?? []
  const exportVisible = () => {
    if (dataExit.grant === null || visible.length === 0) return
    const rows = visible.map(row => [
      row.reference,
      row.bearerName,
      row.missionLabel ?? '',
      row.accountName ?? '',
      row.periodMonth,
      String(row.lineCount),
      canReadFinance && row.totalAmountCents !== null ? (row.totalAmountCents / 100).toFixed(2) : '',
      row.policyCheck.verdict === 'breach'
        ? t('policyRow.breach', { count: row.policyCheck.overageCount })
        : row.policyCheck.verdict === 'compliant'
          ? t('policyRow.compliant')
          : t('policyRow.unknown'),
      t(`status.${row.status}`),
    ])
    const headers = (
      ['reference', 'bearer', 'mission', 'client', 'period', 'lines', 'amount', 'policy', 'status'] as const
    ).map(key => t(`csv.${key}`))
    downloadCSV(toCsv([headers, ...rows]), `notes-de-frais${month ? `-${month}` : ''}.csv`, dataExit.grant)
    toast.success(t('page.exportDone', { count: visible.length }))
  }

  const pendingSub = joinParts([
    tiles && tiles.pending.count > 0 ? amountLabel(tiles.pending.totalAmountCents, canReadFinance, t) : null,
    overageCount !== null && overageCount > 0 ? t('tiles.overages', { count: overageCount }) : null,
  ])

  return (
    <CustomerPage titleInScreen pageTitle={t('page.title')}>
      {/* Théo C missions-notes-de-frais — l'ordre de la maquette : en-tête, parcours replié, quatre
          tuiles, barre d'outils, tableau commun, puis deux cartes (vérification · barème). */}
      <Box data-screen="notes-de-frais" className="space-y-5 py-4">
        {/* #2456 — le h1 de l'écran : l'onglet « Notes de frais » nomme l'endroit, ce titre dit ce qu'on y fait. */}
        <TheoScreenHead
          title={t('page.heading')}
          lede={t('page.subtitle')}
          actions={
            <>
              {dataExit.allowed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11 gap-1.5 md:min-h-9"
                  title={t('page.exportHint')}
                  disabled={visible.length === 0}
                  onClick={exportVisible}
                >
                  <Download className="size-4" aria-hidden="true" />
                  {t('page.export')}
                </Button>
              ) : null}
              {/* « Déposer une note » et non « Nouvelle note » : un libellé promet
                  ce qui va se passer, et ce qui se passe est un dépôt. */}
              <Button type="button" size="sm" className="min-h-11 md:min-h-9" onClick={() => setEditing('new')}>
                {t('page.deposit')}
              </Button>
            </>
          }
        />

        {/* Théo C missions-notes-de-frais.N8 — le parcours utile, REPLIÉ (un clic, jamais caché). */}
        <TheoScreenGuide
          heading={t('guide.heading')}
          intro={t('guide.intro')}
          stepsTitle={t('guide.stepsTitle')}
          steps={[t('guide.step1'), t('guide.step2'), t('guide.step3')]}
          keepTitle={t('guide.keepTitle')}
          keep={t('guide.keep')}
        />

        {/* Théo C missions-notes-de-frais.N3 — les quatre tuiles SONT le filtre d'état (`.v18-stats`) ;
            « En attente » porte l'accent : c'est elle qui dit quoi faire. Un compteur vide se dit en
            mot (« Aucune »), jamais « 0 ». ⚠️ Les tuiles ignorent le filtre d'état — elles le REMPLACENT. */}
        <TheoStats label={t('page.statsLabel')}>
          <TheoStat
            id="pending"
            accent
            label={t('tiles.pending')}
            value={countLabel(tiles?.pending.count ?? null, t)}
            sub={pendingSub}
            pressed={status === 'pending'}
            onPress={() => toggleStatus('pending')}
          />
          <TheoStat
            id="validated"
            label={t('tiles.validated')}
            value={countLabel(tiles?.validated.count ?? null, t)}
            sub={
              tiles && tiles.validated.count > 0
                ? amountLabel(tiles.validated.totalAmountCents, canReadFinance, t)
                : null
            }
            pressed={status === 'validated'}
            onPress={() => toggleStatus('validated')}
          />
          <TheoStat
            id="rejected"
            label={t('tiles.rejected')}
            value={countLabel(tiles?.rejected.count ?? null, t)}
            sub={joinParts([
              tiles && tiles.rejected.count > 0
                ? amountLabel(tiles.rejected.totalAmountCents, canReadFinance, t)
                : null,
              t('tiles.rejectedHint'),
            ])}
            pressed={status === 'rejected'}
            onPress={() => toggleStatus('rejected')}
          />
          <TheoStat
            id="draft"
            label={t('tiles.draft')}
            value={countLabel(tiles?.draft.count ?? null, t)}
            sub={joinParts([
              tiles && tiles.draft.count > 0 ? amountLabel(tiles.draft.totalAmountCents, canReadFinance, t) : null,
              t('tiles.draftHint'),
            ])}
            pressed={status === 'draft'}
            onPress={() => toggleStatus('draft')}
          />
        </TheoStats>

        {/* `.v18-toolbar` — Mois · Compte · Recherche, le raccourci du barème à droite. */}
        <TheoToolbar
          trailing={
            // Le lien vers LA porte du barème — celle qui explique pourquoi une
            // note est « non vérifiée ». Un réglage vit à un seul endroit.
            <Link
              to="/expenses/bareme"
              className="inline-flex min-h-11 items-center rounded-control px-2 text-sm text-[var(--bellum-text-accent)] hover:underline md:min-h-9"
            >
              {t('page.policyLink')}
            </Link>
          }
        >
          <TheoToolbarField label={t('page.monthField')}>
            <Input
              type="month"
              value={month}
              onChange={event => setMonth(event.target.value)}
              aria-label={t('page.monthLabel')}
              className="md:w-44"
            />
          </TheoToolbarField>
          {/* Théo C missions-notes-de-frais.N7 — « Compte » : les clients de l'espace, lus du réglage du barème. */}
          <TheoToolbarField label={t('page.accountField')}>
            <SelectField
              ariaLabel={t('page.accountLabel')}
              value={accountId ?? ALL_ACCOUNTS}
              onChange={next => setAccountId(next === ALL_ACCOUNTS ? null : next)}
              options={accountOptions}
            />
          </TheoToolbarField>
          <TheoToolbarField label={t('page.searchField')} grow>
            <Input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t('page.searchPlaceholder')}
              aria-label={t('page.searchLabel')}
            />
          </TheoToolbarField>
        </TheoToolbar>

        {isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          // Un échec de lecture ne se rend JAMAIS comme « aucune note » : la
          // bonne nouvelle rendue comme une panne, et l'inverse, sont les deux
          // fautes que cette branche existe pour éviter.
          <SearchEmptyState title={t('empty.errorTitle')} description={t('empty.errorDescription')} />
        ) : // ⚠️ `data !== undefined && …` et non `(data?.items.length ?? 0) === 0` :
        // une charge qu'on n'a PAS lue ne compte pas zéro note, elle ne compte
        // rien. Le repli sur zéro ferait afficher « aucune note de frais » sur
        // une lecture qui n'a simplement pas encore abouti (GA-19).
        data !== undefined && data.items.length === 0 ? (
          // Deux causes sous une seule phrase, et la plus fréquente est la moins
          // grave : un filtre armé sur une période qui, elle, porte des notes.
          // Les tuiles tranchent, parce qu'elles portent sur TOUTE la période.
          (status !== null || accountId !== null || search.trim().length > 0) && periodTotal > 0 ? (
            <SearchEmptyState
              title={t('empty.filteredTitle')}
              description={t('empty.filteredDescription', { count: periodTotal })}
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatus(null)
                    setAccountId(null)
                    setSearch('')
                  }}
                >
                  {t('page.clearFilters')}
                </Button>
              }
            />
          ) : (
            <SearchEmptyState title={t('empty.title')} description={t('empty.description')} />
          )
        ) : (
          <Box className="space-y-3">
            <ResponsiveTable
              className={THEO_TABLE_FRAME}
              rows={data?.items ?? []}
              columns={columns}
              rowKey={row => row.id}
              onRowClick={row => setOpenId(row.id)}
              scrollLabel={t('page.title')}
            />
            {total === undefined ? null : (
              <Pager total={total} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
            )}
          </Box>
        )}

        {/* Théo C missions-notes-de-frais.N5 — `.v18-two` : deux cartes côte à côte, empilées sous 768 px
            (le contenu se replie SOUS le contenu, il ne se cache jamais). */}
        <Box className="grid gap-4 md:grid-cols-2">
          <VerificationCard verification={data?.verification} canReadFinance={canReadFinance} />
          <AppliedPolicyCard board={policies.data} isLoading={policies.isLoading} isError={policies.isError} />
        </Box>
      </Box>

      <ExpenseReportDrawer
        reportId={openId}
        onClose={() => setOpenId(null)}
        onEdit={id => {
          setOpenId(null)
          setEditing(id)
        }}
      />
      <ExpenseReportEditor
        open={editing !== null}
        // ⚠️ `null` tant que la note n'est PAS relue : passer la version tronquée
        // de la liste ferait ouvrir le formulaire sans ses lignes, et
        // l'enregistrement les effacerait.
        report={editing !== null && editing !== 'new' ? (editingReport ?? null) : null}
        onClose={() => setEditing(null)}
      />
    </CustomerPage>
  )
}

/** Valeur sentinelle de « Tous les comptes » : un item de menu ne peut pas porter une valeur vide. */
const ALL_ACCOUNTS = 'all'

type Translate = ReturnType<typeof useTranslation>['t']

/**
 * La sous-ligne du statut : quand la note a été déposée, ou qui l'a décidée.
 *
 * ⚠️ Jamais la date de création à la place d'un dépôt : un brouillon dit « pas encore déposée ».
 * Un décideur dont le profil ne se lit pas n'est pas nommé — la date seule, rien de deviné.
 */
function statusNote(row: ExpenseReportSummaryView, t: Translate): string | null {
  if (row.status === 'draft') return t('statusNote.draft')
  const submitted = formatDate(row.submittedAt, { day: 'numeric', month: 'short' })
  if (row.status === 'pending') return submitted === null ? null : t('statusNote.submitted', { date: submitted })
  const decided = formatDate(row.decidedAt, { day: 'numeric', month: 'short' })
  if (decided === null) return null
  return row.decidedByName === null
    ? t('statusNote.decidedNoName', { date: decided })
    : t('statusNote.decided', { date: decided, name: row.decidedByName })
}

/**
 * La colonne « Barème » : le verdict, et ce qui le justifie.
 *
 * « Conforme » n'est dit que si toutes les lignes ont été comparées ; une ligne sans
 * plafond rend « Non vérifiée » — un silence du barème n'est pas une garantie.
 */
function PolicyCell({ row }: { row: ExpenseReportSummaryView }) {
  const { t } = useTranslation('expenses')
  const check = row.policyCheck
  if (check.verdict === 'breach') {
    const worst = check.worstOverage
    const category = worst === null ? null : t(`category.${worst.category}`)
    return (
      <Box>
        <Badge variant="warning">{t('policyRow.breach', { count: check.overageCount })}</Badge>
        {worst === null || category === null ? null : (
          <Text element="span" size="xs" color="text-muted-foreground" className="mt-0.5 block">
            {worst.overageCents === null
              ? category
              : t('policyRow.worst', { category, amount: formatCents(worst.overageCents) })}
          </Text>
        )}
      </Box>
    )
  }
  if (check.verdict === 'compliant') return <Badge variant="success">{t('policyRow.compliant')}</Badge>
  return (
    <Box>
      <Badge variant="outline">{t('policyRow.unknown')}</Badge>
      <Text element="span" size="xs" color="text-muted-foreground" className="mt-0.5 block">
        {row.lineCount === 0 && check.unmeasuredLineCount === 0
          ? t('policyRow.noLine')
          : t('policyRow.unmeasured', { count: check.unmeasuredLineCount })}
      </Text>
    </Box>
  )
}

/** « Ce que la vérification relève » — sur les notes qu'il reste à regarder, pas sur la page rendue. */
function VerificationCard({
  verification,
  canReadFinance,
}: {
  verification: ExpenseReportVerification | undefined
  canReadFinance: boolean
}) {
  const { t } = useTranslation('expenses')
  return (
    <TheoCard id="expense-verification-title" title={t('verification.title')}>
      {verification === undefined ? null : (
        <VerificationRows verification={verification} canReadFinance={canReadFinance} />
      )}
    </TheoCard>
  )
}

/**
 * `.ht-rows` — une pastille par constat : ambre pour un dépassement (le plafond alerte), neutre pour
 * ce qui n'a pas pu être comparé et pour les justificatifs. Un constat absent ne fait AUCUNE ligne.
 */
function VerificationRows({
  verification,
  canReadFinance,
}: {
  verification: ExpenseReportVerification
  canReadFinance: boolean
}) {
  const { t } = useTranslation('expenses')
  const { overages, unmeasuredLineCount, lineCount, attachmentCount, reportsWithoutReceipt } = verification
  const clean = overages.length === 0 && unmeasuredLineCount === 0
  return (
    <Box>
      {clean ? <TheoDotRow tone="success" title={t('verification.clean')} /> : null}
      {overages.length > 0 ? (
        <TheoDotRow
          tone="warning"
          title={t('verification.overage', { count: overages.length })}
          sub={
            <>
              <ul className="space-y-0.5">
                {overages.map(overage => {
                  const category = t(`category.${overage.category}`).toLowerCase()
                  return (
                    <li key={`${overage.reportId}-${overage.category}`}>
                      {canReadFinance && overage.overageCents !== null
                        ? t('verification.overageLine', {
                            name: overage.bearerName,
                            category,
                            amount: formatCents(overage.overageCents),
                          })
                        : t('verification.overageLineNoAmount', { name: overage.bearerName, category })}
                    </li>
                  )
                })}
              </ul>
              <span className="mt-0.5 block">{t('verification.overageHint')}</span>
            </>
          }
        />
      ) : null}
      {unmeasuredLineCount > 0 ? (
        <TheoDotRow
          tone="neutral"
          title={t('verification.unmeasured', { count: unmeasuredLineCount })}
          sub={t('verification.unmeasuredHint')}
        />
      ) : null}
      {lineCount > 0 ? (
        <TheoDotRow
          tone="neutral"
          title={t('verification.receiptsTitle')}
          sub={
            t('verification.receipts', {
              attachments: t('verification.attachments', { count: attachmentCount }),
              lines: t('verification.lines', { count: lineCount }),
            }) +
            (reportsWithoutReceipt > 0
              ? ` ; ${t('verification.missingReceipt', { count: reportsWithoutReceipt })}`
              : '')
          }
        />
      ) : null}
    </Box>
  )
}

/**
 * « Le barème appliqué » — LU du réglage, jamais recopié : un barème qui vivrait deux fois
 * divergerait au premier changement (un réglage, un endroit). Aucun plafond n'est inventé :
 * sans barème saisi, la carte le dit.
 */
function AppliedPolicyCard({
  board,
  isLoading,
  isError,
}: {
  board: ExpensePolicyBoard | undefined
  isLoading: boolean
  isError: boolean
}) {
  const { t } = useTranslation('expenses')
  const standard = board?.policies.find(policy => policy.accountId === null) ?? null
  const negotiated = (board?.policies ?? []).filter(policy => policy.accountId !== null)

  let body: React.ReactNode
  if (isLoading) {
    body = (
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('applied.loading')}
      </Text>
    )
  } else if (isError || board === undefined) {
    body = (
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('applied.unavailable')}
      </Text>
    )
  } else if (standard === null) {
    body = (
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('applied.none')}
      </Text>
    )
  } else {
    const dates = standard.caps.map(cap => cap.effectiveFrom).filter((date): date is string => date !== null)
    const since = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null
    const basis = t(`applied.${standard.reimbursementBasis === 'actual' ? 'actual' : 'scale'}`)
    const sinceLabel = since === null ? null : formatDate(since, { day: 'numeric', month: 'long', year: 'numeric' })
    const caps = EXPENSE_CATEGORIES.flatMap((category: ExpenseCategory) => {
      const cap = capForCategory(standard.caps, category)
      return cap?.capCents == null ? [] : [`${t(`category.${category}`)} ${formatCents(cap.capCents)}`]
    })
    body = (
      <>
        <Text element="p" size="sm" color="text-muted-foreground">
          {sinceLabel === null
            ? t('applied.defaultNoDate', { label: standard.label, basis })
            : t('applied.default', { label: standard.label, basis, date: sinceLabel })}
        </Text>
        {caps.length > 0 ? (
          <Text element="p" size="sm" color="text-muted-foreground" className="mt-2">
            {caps.join(' · ')}
          </Text>
        ) : null}
        {negotiated.length > 0 ? (
          <Text element="p" size="sm" color="text-muted-foreground" className="mt-2">
            {t('applied.negotiated', {
              clients: negotiated.map(policy => policy.accountName ?? policy.label).join(', '),
            })}
          </Text>
        ) : null}
      </>
    )
  }

  return (
    <TheoCard
      id="expense-applied-title"
      title={t('applied.title')}
      action={
        <Link
          to="/expenses/bareme"
          className="inline-flex min-h-11 items-center rounded-control px-2 text-sm text-[var(--bellum-text-accent)] hover:underline md:min-h-8"
        >
          {t('applied.open')}
        </Link>
      }
    >
      <Box className="text-xs">{body}</Box>
    </TheoCard>
  )
}

/**
 * « 1–10 sur 60 », les pages, et le nombre par page.
 *
 * ⚠️ Le compte est celui du SERVEUR, pas la longueur de la page rendue : une
 * pagination qui ne sait pas où elle s'arrête propose des pages vides. Et il
 * n'y a PAS de repli sur zéro pendant le chargement — la barre entière ne
 * s'affiche qu'une fois le total connu, plutôt que d'écrire « 0–0 sur 0 », qui
 * se lirait « il n'y a rien ».
 */
function Pager({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  /** Le compte du SERVEUR — jamais la longueur de la page rendue. */
  total: number
  page: number
  pageSize: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}) {
  const { t } = useTranslation('expenses')
  // Zéro note est ICI un zéro VRAI : le serveur a compté, et il a compté zéro.
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  return (
    <Box display="flex" className="flex-wrap items-center justify-between gap-2">
      <Text element="p" size="sm" color="text-muted-foreground">
        {t('page.range', { first, last, total })}
      </Text>
      <Box display="flex" className="flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={page <= 1}
          aria-label={t('page.previous')}
          onClick={() => onPage(page - 1)}
        >
          {t('page.previous')}
        </Button>
        <Text element="span" size="sm" color="text-muted-foreground">
          {t('page.pageOf', { page, pageCount })}
        </Text>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={page >= pageCount}
          aria-label={t('page.next')}
          onClick={() => onPage(page + 1)}
        >
          {t('page.next')}
        </Button>
        <SelectField
          ariaLabel={t('page.pageSizeLabel')}
          value={String(pageSize)}
          onChange={next => onPageSize(Number(next))}
          options={EXPENSE_PAGE_SIZES.map(size => ({ value: String(size), label: t('page.perPage', { count: size }) }))}
        />
      </Box>
    </Box>
  )
}

/**
 * La valeur d'une tuile : un COMPTE. `null` veut dire « pas encore lu », pas « zéro » — pendant le
 * chargement, une tuile à « 0 » se lit comme un vrai zéro et fait conclure que la file est vide. Un
 * compteur à zéro se dit en MOT (« Aucune »), jamais « 0 ».
 */
function countLabel(count: number | null, t: Translate): string | number {
  if (count === null) return t('common:states.loading')
  return count === 0 ? t('tiles.none') : count
}

/**
 * Le montant d'une tuile. Sans droit financier, l'écran DIT que le montant est réservé — il n'écrit
 * ni « 0,00 € », ni « non mesuré », qui laisseraient croire que personne ne l'a calculé.
 */
/** Les précisions d'une tuile, chacune dans son nœud (« Montants réservés » se lit seul), séparées par « · ». */
function joinParts(parts: readonly (string | null)[]): ReactNode {
  const kept = parts.filter((part): part is string => part !== null && part.length > 0)
  if (kept.length === 0) return null
  return kept.map((part, index) => (
    <span key={part}>
      {index > 0 ? ' · ' : ''}
      <span>{part}</span>
    </span>
  ))
}

function amountLabel(amountCents: number | null, canReadFinance: boolean, t: Translate): string | null {
  if (!canReadFinance) return t('tiles.amountHidden')
  return amountCents === null ? null : formatCents(amountCents)
}
