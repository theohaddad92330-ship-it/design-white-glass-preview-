import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AccountListItem } from '@bellum/contracts'
import {
  Badge,
  Button,
  cn,
  EntityAvatar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@bellum/ui'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Layers,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  UserRound,
  Users,
  Compass,
  type LucideIcon,
} from 'lucide-react'
import { useAnalysisBatches } from '@/features/analysis-batches/api'
import { formatDate } from '@/lib/locale'
import { AnalyzeHeader, CompanyLogo } from '../components/AnalyzeChrome'
import { useAnalysesHistory } from '../hooks/useRecentAnalyses'

type Scope = 'all' | 'mine'

const HEAD = 'text-xs font-semibold text-[var(--bellum-text-secondary)]'
const ACCENT_OUTLINE =
  'min-h-11 gap-2 border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] md:min-h-9'
const QUIET_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-[var(--bellum-text-secondary)] transition-colors duration-immediate hover:text-[var(--bellum-text-accent)]'

/** L'état d'une analyse, en mots et en teinte : jamais un code, jamais un chiffre. */
function statusOf(account: AccountListItem): { label: string; variant: 'info' | 'success' | 'danger' | 'default' } {
  switch (account.status) {
    case 'analyzing':
      return { label: 'running', variant: 'info' }
    case 'error':
      return { label: 'failed', variant: 'danger' }
    case 'canceled':
      return { label: 'canceled', variant: 'default' }
    default:
      return { label: 'done', variant: 'success' }
  }
}

/**
 * « Mes analyses » (refonte Théo R2) — l'historique d'analyses de l'ESPACE, filtrable « Toute
 * l'équipe » / « Moi », avec les lots lancés depuis Découvrir en dessous. Même route que
 * « Analyser un compte » (`?vue=historique`) : aucune route neuve, aucune donnée neuve — c'est la
 * liste des comptes lue comme un historique. Un compte retiré de l'historique reste intact.
 */
export function AnalysesHistory() {
  const { t } = useTranslation('search')
  const [scope, setScope] = useState<Scope>('all')
  const everyone = useAnalysesHistory('all', 50)
  const mine = useAnalysesHistory('mine', 50)
  const batches = useAnalysisBatches()
  const rows = (scope === 'all' ? everyone : mine) ?? []
  const loading = (scope === 'all' ? everyone : mine) === undefined

  const tabs: readonly { key: Scope; label: string; icon: LucideIcon }[] = [
    { key: 'all', label: t('analyze.history.everyone'), icon: Users },
    { key: 'mine', label: t('analyze.history.mine'), icon: UserRound },
  ]

  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pb-8 pt-3 md:px-8">
        <AnalyzeHeader
          title={t('analyze.history.title')}
          subtitle={t('analyze.history.subtitle')}
          guideBelowActions={false}
          actions={
            <>
              <Link to="/search" className={QUIET_LINK}>
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                {t('analyze.history.backToFraming')}
              </Link>
              <Button asChild variant="violet" className="min-h-11 gap-2">
                <Link to="/search">
                  <Plus className="size-4" aria-hidden="true" />
                  {t('analyze.history.newAnalysis')}
                </Link>
              </Button>
            </>
          }
        />
        <div data-history-section="filters" className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label={t('analyze.history.scopeLabel')}
            className="inline-flex items-center gap-1 rounded-xl border border-[var(--bellum-border)] bg-card p-1"
          >
            {tabs.map(tab => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={scope === tab.key}
                  onClick={() => setScope(tab.key)}
                  className={cn(
                    'inline-flex min-h-11 items-center gap-2 rounded-control px-3.5 text-sm font-semibold transition-colors duration-immediate md:min-h-10',
                    scope === tab.key
                      ? 'bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]'
                      : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {tab.label}
                </button>
              )
            })}
          </div>
          {everyone !== undefined && everyone.length > 0 ? (
            <span className="text-xs text-[var(--bellum-text-secondary)]">
              {mine !== undefined && mine.length > 0
                ? t('analyze.history.countWithMine', { total: everyone.length, mine: mine.length })
                : t('analyze.history.count', { total: everyone.length })}
            </span>
          ) : null}
        </div>

        {loading ? null : rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--bellum-border)] px-5 py-8 text-sm text-[var(--bellum-text-secondary)]">
            {scope === 'mine' ? t('analyze.history.emptyMine') : t('analyze.history.empty')}
          </p>
        ) : (
          // Le tableau commun (décision de Louis : toutes les listes) à la densité des lignes de la maquette :
          // le compte, son secteur, puis « qui · quand » sur une ligne ; l'état seulement s'il dit quelque chose.
          <div
            data-history-section="analyses"
            className="overflow-hidden rounded-2xl border border-[var(--bellum-border)] bg-card"
          >
            <Table scrollLabel={t('analyze.history.tableLabel')}>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD}>{t('analyze.history.columns.account')}</TableHead>
                  <TableHead className={HEAD}>{t('analyze.history.columns.state')}</TableHead>
                  <TableHead className={HEAD}>
                    <span className="sr-only">{t('analyze.history.columns.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(account => {
                  const state = statusOf(account)
                  const date = formatDate(account.last_analyzed_at ?? account.created_at, {
                    day: 'numeric',
                    month: 'short',
                  })
                  const mineRow = scope === 'mine' || (mine ?? []).some(row => row.id === account.id)
                  const by = account.owner?.name ? (mineRow ? null : account.owner.name) : null
                  return (
                    <TableRow key={account.id} data-history-row={state.label}>
                      <TableCell className="py-3.5">
                        <span className="flex min-w-0 items-center gap-3.5">
                          <CompanyLogo name={account.company_name} src={account.logo_url} className="size-9 shrink-0" />
                          <span className="min-w-0">
                            <strong className="block truncate text-sm font-semibold text-[var(--bellum-text-primary)]">
                              {account.company_name}
                            </strong>
                            {account.sector ? (
                              <small className="block truncate text-xs text-[var(--bellum-text-secondary)]">
                                {account.sector}
                              </small>
                            ) : null}
                            <small className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]">
                              {by ? (
                                <>
                                  <EntityAvatar name={by} size="xs" className="size-5 text-xs" />
                                  <b className="font-semibold text-[var(--bellum-text-primary)]">{by}</b>
                                  <span aria-hidden="true">·</span>
                                </>
                              ) : null}
                              <span>{date}</span>
                            </small>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {state.label === 'done' ? null : (
                          <Badge variant={state.variant}>{t(`analyze.history.state.${state.label}`)}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap justify-end gap-1.5">
                          {account.status === 'analyzing' ? (
                            <Button asChild size="sm" variant="outline" className={ACCENT_OUTLINE}>
                              <Link to="/accounts/$id" params={{ id: account.id }}>
                                <Eye className="size-4" aria-hidden="true" />
                                {t('analyze.history.follow')}
                              </Link>
                            </Button>
                          ) : (
                            <>
                              {/* Un collègue a lancé l'analyse : on ne reprend pas son cadrage, on ouvre le dossier. */}
                              {mineRow && account.status === 'error' ? (
                                <Button asChild size="sm" variant="violet" className="min-h-11 gap-2 md:min-h-9">
                                  <Link to="/search" search={{ accountId: account.id }}>
                                    <RotateCcw className="size-4" aria-hidden="true" />
                                    {t('analyze.history.retry')}
                                  </Link>
                                </Button>
                              ) : mineRow ? (
                                <Button asChild size="sm" variant="outline" className="min-h-11 gap-2 md:min-h-9">
                                  <Link to="/search" search={{ accountId: account.id }}>
                                    <Pencil className="size-3.5" aria-hidden="true" />
                                    {t('analyze.history.resume')}
                                  </Link>
                                </Button>
                              ) : null}
                              {mineRow && account.status === 'error' ? null : (
                                <Button asChild size="sm" variant="outline" className={ACCENT_OUTLINE}>
                                  <Link to="/accounts/$id" params={{ id: account.id }}>
                                    <ArrowRight className="size-4" aria-hidden="true" />
                                    {t('analyze.history.openAccount')}
                                  </Link>
                                </Button>
                              )}
                            </>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {(batches.data ?? []).length > 0 ? (
          <section aria-labelledby="analyze-batches-title" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2
                id="analyze-batches-title"
                className="text-lg font-semibold tracking-tight text-[var(--bellum-text-primary)]"
              >
                {t('analyze.history.batchesTitle')}
              </h2>
              <Link to="/discover/lots" className={QUIET_LINK}>
                <Compass className="size-3.5" aria-hidden="true" />
                {t('analyze.history.launchBatch')}
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--bellum-border)] bg-card">
              <Table scrollLabel={t('analyze.history.batchesTitle')}>
                <TableHeader>
                  <TableRow>
                    <TableHead className={HEAD}>{t('analyze.history.batchColumns.batch')}</TableHead>
                    <TableHead className={HEAD}>{t('analyze.history.batchColumns.progress')}</TableHead>
                    <TableHead className={HEAD}>
                      <span className="sr-only">{t('analyze.history.columns.actions')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(batches.data ?? []).map(batch => {
                    const done = batch.counts.done + batch.counts.partial
                    const running = batch.counts.resolved + batch.counts.queued + batch.counts.running
                    const failed = batch.counts.failed + batch.counts.needs_resolution
                    return (
                      <TableRow key={batch.id}>
                        <TableCell className="py-3.5 text-sm text-[var(--bellum-text-primary)]">
                          <span className="flex items-center gap-3.5">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)]">
                              <Layers className="size-4" aria-hidden="true" />
                            </span>
                            <span>
                              <strong className="block font-semibold">
                                {t('analyze.history.batchAccounts', { count: batch.total })}
                              </strong>
                              <small className="text-xs text-[var(--bellum-text-secondary)]">
                                {formatDate(batch.createdAt, { day: 'numeric', month: 'short' })}
                              </small>
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {/* L'avancement en une barre à trois teintes, puis les mêmes nombres en mots. */}
                          <span
                            aria-hidden="true"
                            className="mb-1.5 flex h-1.5 w-full max-w-60 gap-0.5 overflow-hidden rounded-full"
                          >
                            {done > 0 ? (
                              <span className="rounded-full bg-[var(--bellum-success)]" style={{ flex: done }} />
                            ) : null}
                            {running > 0 ? (
                              <span className="rounded-full bg-[var(--bellum-info)]" style={{ flex: running }} />
                            ) : null}
                            {failed > 0 ? (
                              <span className="rounded-full bg-[var(--bellum-danger)]" style={{ flex: failed }} />
                            ) : null}
                          </span>
                          <span className="flex flex-wrap gap-x-1.5 font-medium">
                            {done > 0 ? (
                              <span className="text-[var(--success-soft-text)]">
                                {t('analyze.history.batchDone', { count: done })}
                              </span>
                            ) : null}
                            {running > 0 ? (
                              <span className="text-[var(--info-soft-text)]">
                                {t('analyze.history.batchRunning', { count: running })}
                              </span>
                            ) : null}
                            {failed > 0 ? (
                              <span className="text-[var(--danger-soft-text)]">
                                {t('analyze.history.batchFailed', { count: failed })}
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex justify-end">
                            <Button asChild size="sm" variant="outline" className={ACCENT_OUTLINE}>
                              <Link to="/discover/lots/$batchId" params={{ batchId: batch.id }}>
                                <ArrowRight className="size-4" aria-hidden="true" />
                                {t('analyze.history.seeBatch')}
                              </Link>
                            </Button>
                          </span>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        ) : null}
        <p className="flex items-center gap-2 text-xs text-[var(--bellum-text-secondary)]">
          <Lock className="size-3.5" aria-hidden="true" />
          {t('analyze.history.footnote')}
        </p>
      </div>
    </div>
  )
}
