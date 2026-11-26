import { Button, EmptyState, ModeTabs, type ModeTabItem } from '@bellum/ui'
import type { AnalysisHistoryRow, AnalysisHistoryScope, AnalysisBatch } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { useAnalysisBatches } from '@/features/analysis-batches/api'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { formatDateTime } from '@/lib/locale'
import { useAnalysisHistory, useHideAnalysisRun } from '../api'
import { resumeSearchParams, rowActions } from '../lib/history-view'

/**
 * Théo B r2-mes-analyses — « Mes analyses » : l'historique des analyses de l'ESPACE, filtrable « Moi » (par défaut).
 * Chaque ligne dit qui l'a lancée ; on ne reprend, ne réessaie ni ne retire que les siennes.
 */
export function AnalysisHistoryPage() {
  const { t } = useTranslation('search')
  return (
    <CustomerPage anchorId="mes-analyses" titleInScreen pageTitle={t('history.title')} contentClassName="px-0 py-4">
      <AnalysisHistoryContent />
    </CustomerPage>
  )
}

export function AnalysisHistoryContent() {
  const { t } = useTranslation('search')
  useLauraContext({ kind: 'screen', label: t('history.title'), entityId: null, facets: [], state: 'ready' })
  // Théo B r2-mes-analyses.A5 — l'historique est celui de l'espace ; « Moi » le réduit en un clic, et c'est le défaut.
  const [scope, setScope] = useState<AnalysisHistoryScope>('me')
  const history = useAnalysisHistory(scope)
  const tabs: ModeTabItem<AnalysisHistoryScope>[] = [
    { key: 'space', label: t('history.scopeSpace') },
    { key: 'me', label: t('history.scopeMe') },
  ]
  const counts = history.data?.counts

  return (
    <div className={`${PAGE_GUTTER_X} flex min-w-0 flex-col gap-4`}>
      <ScreenIntro
        title={t('history.title')}
        titleWithoutName={t('history.title')}
        subtitle={t('history.subtitle')}
        action={
          <Button asChild size="sm" variant="black">
            <Link to="/search">
              <Plus className="size-4 shrink-0" aria-hidden />
              {t('history.newAnalysis')}
            </Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <ModeTabs items={tabs} value={scope} onChange={setScope} />
        {counts ? (
          <p className="text-sm text-[var(--bellum-text-secondary)]">
            {scope === 'space'
              ? t('history.countsSpace', { space: counts.space, mine: counts.mine })
              : t('history.countsMine', { count: counts.mine })}
          </p>
        ) : null}
      </div>

      {history.isError ? (
        <p role="alert" className="text-sm text-[var(--bellum-text-secondary)]">
          {t('history.loadError')}
        </p>
      ) : history.data === undefined ? (
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('history.loading')}</p>
      ) : history.data.runs.length === 0 ? (
        <EmptyState
          align="start"
          title={t(scope === 'me' ? 'history.emptyMineTitle' : 'history.emptySpaceTitle')}
          description={t('history.emptyDescription')}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bellum-border)] rounded-xl border border-[var(--bellum-border)]">
          {history.data.runs.map(run => (
            <HistoryRow key={run.id} run={run} />
          ))}
        </ul>
      )}
      <p className="text-xs text-[var(--bellum-text-secondary)]">{t('history.removeHint')}</p>

      <BatchesSection />
    </div>
  )
}

function HistoryRow({ run }: { run: AnalysisHistoryRow }) {
  const { t } = useTranslation('search')
  const hide = useHideAnalysisRun()
  const actions = rowActions(run)
  const name = run.companyName ?? t('history.unnamed')
  const when = formatDateTime(run.startedAt)
  const meta = [
    when,
    run.headquarters,
    run.depth ? t(`history.depth.${run.depth}`) : null,
    // Un collègue est NOMMÉ : on ne touche pas à son cadrage.
    run.mine ? null : t('history.startedBy', { name: run.startedBy.name ?? t('history.colleague') }),
  ].filter((part): part is string => Boolean(part))

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/accounts/$id"
            params={{ id: run.accountId }}
            className="font-medium text-[var(--bellum-text-accent)] underline"
          >
            {name}
          </Link>
          {run.status !== 'completed' ? (
            <span className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
              {t(`history.status.${run.status}`)}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-[var(--bellum-text-secondary)]">{meta.join(' · ')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions.resume || actions.retry ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/search" search={resumeSearchParams(run)}>
              {t(actions.retry ? 'history.retry' : 'history.resume')}
            </Link>
          </Button>
        ) : null}
        {actions.viewDossier ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/accounts/$id" params={{ id: run.accountId }}>
              {t('history.viewDossier')}
            </Link>
          </Button>
        ) : null}
        {actions.remove ? (
          <button
            type="button"
            aria-label={t('history.remove', { name })}
            disabled={hide.isPending}
            onClick={() => hide.mutate(run.id, { onError: () => toast.error(t('history.removeError')) })}
            className="inline-flex size-11 items-center justify-center rounded-md text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)]"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Théo B r2-mes-analyses.A6 — les lots d'analyses ont une place ici, pas un écran : l'avancement se lit en
 * une ligne, le détail reste dans Découvrir › Lots, où le lot est lancé.
 */
function BatchesSection() {
  const { t } = useTranslation('search')
  const batches = useAnalysisBatches()
  const recent = (batches.data ?? []).slice(0, 3)
  return (
    <section aria-labelledby="analysis-history-batches" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="analysis-history-batches" className="text-base font-semibold text-[var(--bellum-text-primary)]">
          {t('history.batches.title')}
        </h2>
        <Button asChild size="sm" variant="outline">
          <Link to="/discover/lots">{t('history.batches.launch')}</Link>
        </Button>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('history.batches.none')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bellum-border)] rounded-xl border border-[var(--bellum-border)]">
          {recent.map(batch => (
            <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium text-[var(--bellum-text-primary)]">
                  {t('history.batches.accounts', { count: batch.total })}
                </p>
                <p className="text-sm text-[var(--bellum-text-secondary)]">{batchProgress(batch, t)}</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/discover/lots/$batchId" params={{ batchId: batch.id }}>
                  {t('history.batches.view')}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function batchProgress(batch: AnalysisBatch, t: ReturnType<typeof useTranslation<'search'>>['t']): string {
  const parts: string[] = []
  const done = batch.counts.done + batch.counts.partial
  if (done > 0) parts.push(t('history.batches.done', { count: done }))
  const running = batch.counts.running + batch.counts.queued + batch.counts.resolved
  if (running > 0) parts.push(t('history.batches.running', { count: running }))
  if (batch.counts.failed > 0) parts.push(t('history.batches.failed', { count: batch.counts.failed }))
  return parts.join(' · ')
}
