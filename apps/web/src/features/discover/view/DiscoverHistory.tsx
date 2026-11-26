import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock,
  ListChecks,
  ListPlus,
  MoreHorizontal,
  Pin,
  Plus,
  RotateCcw,
  Users2,
} from 'lucide-react'
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  TYPE_SCALE,
  cn,
} from '@bellum/ui'
import type { TargetList } from '@bellum/contracts'
import { useTargetLists } from '@/features/target-lists/api'
import { searchHistoryLabel } from '@/features/discover/lib/discover-search-history-label'
import { summarizeFilters } from '@/features/discover/lib/discover-filters-summary'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import { REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import type { UnifiedFilters } from '@/features/discover/lib/discover-filters'
import type { SearchHistoryEntry } from '@/features/discover/lib/discover-search-history'
import type { SavedSearch } from '@/features/discover/lib/discover-saved-searches'

type SavedSearchesStatus = 'loading' | 'error' | 'locked' | 'ready'

/* ------------------------------------------------------------------ */
/*  « Mes recherches » — la page de reprise de Découvrir (maquette      */
/*  Théo decouvrir-historique).                                         */
/*                                                                     */
/*  Trois blocs, deux colonnes : les recherches RÉCENTES (30 jours) puis */
/*  les ENREGISTRÉES à gauche, les LISTES DE TRAVAIL à droite. Aucune    */
/*  donnée nouvelle : l'historique local, les recherches du serveur et   */
/*  les listes de cibles existent déjà — ce composant ne fait que les    */
/*  poser au bon endroit. Une absence ne fait aucune ligne : un bloc     */
/*  sans élément dit son état vide, jamais « 0 ».                       */
/* ------------------------------------------------------------------ */

const CARD = 'overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'
const ICON_BOX =
  'flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]'

function useCriteriaLine(): (filters: UnifiedFilters) => string {
  const { t, i18n } = useTranslation('discover')
  return filters => {
    const { kept } = summarizeFilters(filters)
    return kept
      .flatMap(line =>
        line.values.length === 0
          ? [t(`rail.summary.line.${line.key}`)]
          : line.values.map(value => {
              if (line.key === 'zones') return REGISTRY_REGIONS.find(region => region.code === value)?.label ?? value
              if (line.key === 'sectors' || line.key === 'excludedSectors')
                return applicationSectorLabel(value, i18n.language)
              if (line.key === 'size') return t(`rail.sizeBand.${value.toLowerCase()}`)
              if (line.key === 'intermediaries') return t('rail.summary.esn')
              return value
            }),
      )
      .join(' · ')
  }
}

function formatWhen(iso: string | number, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string | number, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(language, { day: 'numeric', month: 'short' })
}

function SectionTitle({ id, title, aside }: { id: string; title: string; aside?: string | number | null }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-primary)]')}>
        {title}
      </h2>
      {aside != null && aside !== '' && <span className="text-xs text-[var(--bellum-text-muted)]">{aside}</span>}
    </div>
  )
}

interface RecentProps {
  history: readonly SearchHistoryEntry[]
  onReplay: (entry: SearchHistoryEntry) => void
}

function RecentSearches({ history, onReplay }: RecentProps) {
  const { t, i18n } = useTranslation('discover')
  const criteria = useCriteriaLine()
  return (
    <section aria-labelledby="history-recent">
      <SectionTitle id="history-recent" title={t('mySearches.recentTitle')} aside={t('mySearches.recentWindow')} />
      {history.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4 text-sm text-[var(--bellum-text-secondary)]">
          {t('mySearches.recentEmpty')}
        </p>
      ) : (
        <ul className={cn(CARD, 'divide-y divide-[var(--bellum-border)]')} data-testid="discover-search-history">
          {history.map(entry => {
            const title =
              searchHistoryLabel(entry.filters, {
                preset: id => t(`presets.${id}.label`, { defaultValue: '' }),
                headcount: range => t(`headcount.${range}`, { defaultValue: '' }),
                sector: code => applicationSectorLabel(code, i18n.language),
              }) || t('sidebar.historyUntitled')
            const line = criteria(entry.filters)
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <span className={ICON_BOX} aria-hidden="true">
                  <Clock className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--bellum-text-primary)]">{title}</p>
                  {line && <p className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">{line}</p>}
                  <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">
                    {formatWhen(entry.at, i18n.language)}
                    {typeof entry.count === 'number' && entry.count > 0 && (
                      <> · {t('mySearches.savedCount', { count: entry.count })}</>
                    )}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onReplay(entry)}>
                  <RotateCcw aria-hidden="true" />
                  {t('mySearches.resume')}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface SavedProps {
  searches: readonly SavedSearch[]
  onApply: (search: SavedSearch) => void
  onDelete: (id: string) => void
  onCreateTarget: (search: SavedSearch) => void
  status: SavedSearchesStatus
}

function SavedSearchRow({
  search,
  onApply,
  onDelete,
  onCreateTarget,
}: { search: SavedSearch } & Omit<SavedProps, 'searches' | 'status'>) {
  const { t, i18n } = useTranslation('discover')
  const criteria = useCriteriaLine()
  const line = criteria(search.filters)
  const lastRun = search.lastRunAt ? formatDay(search.lastRunAt, i18n.language) : ''
  const fromColleague = search.shared && search.ownerName
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 p-4" data-testid="saved-search-row">
      <span className={ICON_BOX} aria-hidden="true">
        <Pin className="size-4" />
      </span>
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--bellum-text-primary)]">
          {search.label}
          {search.shared && (
            <Badge variant="primary" data-testid="saved-search-shared">
              <Users2 className="size-3" aria-hidden="true" />
              {fromColleague ? (
                <span data-testid="saved-search-owner">{t('mySearches.sharedBy', { name: search.ownerName })}</span>
              ) : (
                t('mySearches.sharedWithSpace')
              )}
            </Badge>
          )}
        </div>
        {line && <p className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">{line}</p>}
        {search.objective && (
          <p data-testid="saved-search-objective" className="mt-2 text-sm text-[var(--bellum-text-primary)]">
            {search.objective}
          </p>
        )}
        {/* Théo — « Enregistrée le 21 oct. · <dernière reprise> » : la date d'enregistrement, puis l'exécution. */}
        <p data-testid="saved-search-lastrun" className="mt-2 text-xs text-[var(--bellum-text-muted)]">
          {t(fromColleague ? 'mySearches.sharedOn' : 'mySearches.savedOn', {
            name: search.ownerName ?? '',
            date: formatDay(search.savedAt, i18n.language),
          })}
          {' · '}
          {lastRun ? t('sidebar.savedLastRun', { date: lastRun }) : t('sidebar.savedNeverRun')}
        </p>
        <p
          data-testid={search.alertFrequency === 'manual' ? undefined : 'saved-search-alert'}
          className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--bellum-text-secondary)]"
        >
          <Bell className="size-3 shrink-0" aria-hidden="true" />
          {search.alertFrequency === 'manual' ? (
            <>
              {t('mySearches.manualRun')} ·{' '}
              <Link to="/signals/watches" className="text-[var(--bellum-text-accent)] underline underline-offset-2">
                {t('mySearches.makeWatch')}
              </Link>
            </>
          ) : (
            <>
              {t(`sidebar.frequency.${search.alertFrequency}`)}
              {search.alertChannel && ` · ${t(`sidebar.channel.${search.alertChannel}`)}`} ·{' '}
              <Link to="/signals/watches" className="text-[var(--bellum-text-accent)] underline underline-offset-2">
                {t('mySearches.tuneWatch')}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="outline" size="sm" onClick={() => onApply(search)} title={t('sidebar.savedApply')}>
          <RotateCcw aria-hidden="true" />
          {t('mySearches.resume')}
        </Button>
        <Button
          variant="plain"
          size="sm"
          onClick={() => onCreateTarget(search)}
          aria-label={t('sidebar.savedCreateTargetNamed', { name: search.label })}
        >
          <ListPlus aria-hidden="true" />
          {t('mySearches.createList')}
        </Button>
        {!fromColleague && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="plain" size="icon" aria-label={t('mySearches.moreFor', { name: search.label })}>
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onApply(search)}>{t('mySearches.resume')}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => onDelete(search.id)}
                aria-label={t('sidebar.savedDeleteNamed', { name: search.label })}
              >
                {t('mySearches.deleteSearch')}
                <span className="ml-2 text-xs text-[var(--bellum-text-muted)]">{t('mySearches.deleteKeeps')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  )
}

function SavedSearchesBlock({ searches, onApply, onDelete, onCreateTarget, status }: SavedProps) {
  const { t } = useTranslation('discover')
  return (
    <section aria-labelledby="history-saved" className="mt-8">
      <SectionTitle
        id="history-saved"
        title={t('mySearches.savedTitle')}
        aside={searches.length > 0 ? searches.length : null}
      />
      {status === 'error' || status === 'loading' ? (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4 text-sm text-[var(--bellum-text-secondary)]"
        >
          {t(status === 'error' ? 'sidebar.savedLoadError' : 'sidebar.savedLoading')}
        </p>
      ) : status === 'locked' ? (
        <div className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4">
          <h3 className="text-sm font-semibold text-[var(--bellum-text-primary)]">{t('mySearches.lockedTitle')}</h3>
          <p className="mt-1 text-sm text-[var(--bellum-text-secondary)]">{t('sidebar.savedLocked')}</p>
        </div>
      ) : searches.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4">
          <h3 className="text-sm font-semibold text-[var(--bellum-text-primary)]">{t('mySearches.savedEmptyTitle')}</h3>
          <p className="mt-1 text-sm text-[var(--bellum-text-secondary)]">{t('mySearches.savedEmptyBody')}</p>
        </div>
      ) : (
        <>
          <ul className={cn(CARD, 'divide-y divide-[var(--bellum-border)]')} data-testid="saved-searches">
            {searches.map(search => (
              <SavedSearchRow
                key={search.id}
                search={search}
                onApply={onApply}
                onDelete={onDelete}
                onCreateTarget={onCreateTarget}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--bellum-text-muted)]">{t('mySearches.savedHelper')}</p>
        </>
      )}
    </section>
  )
}

function WorkLists({ lists }: { lists: readonly TargetList[] }) {
  const { t, i18n } = useTranslation('discover')
  const { t: tTargets } = useTranslation('targets')
  return (
    <aside aria-labelledby="history-lists">
      <SectionTitle
        id="history-lists"
        title={t('mySearches.listsTitle')}
        aside={lists.length > 0 ? lists.length : null}
      />
      {lists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--bellum-border)] p-4">
          <p className="text-sm text-[var(--bellum-text-secondary)]">{t('mySearches.listsEmpty')}</p>
        </div>
      ) : (
        <ul className={cn(CARD, 'divide-y divide-[var(--bellum-border)]')} data-testid="work-lists">
          {lists.map(list => (
            <li key={list.id} className="flex items-center gap-3 p-4">
              <span className={ICON_BOX} aria-hidden="true">
                <ListChecks className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--bellum-text-primary)]">{list.name}</p>
                <p className="mt-0.5 text-sm text-[var(--bellum-text-secondary)]">
                  {list.counts.measured ? t('mySearches.listCount', { count: list.counts.total }) : null}
                </p>
                {/* Théo — « Créée depuis <origine> le <date> » ; l'équipe, quand la liste en porte une. */}
                <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">
                  {t('mySearches.listCreatedFrom', {
                    source: tTargets(`listSource.${list.source}`),
                    date: formatDay(list.created_at, i18n.language),
                  })}
                  {list.team ? ` · ${list.team}` : null}
                </p>
              </div>
              <Link
                to="/signals"
                className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-primary)] hover:underline"
              >
                {t('mySearches.open')}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-[var(--bellum-text-muted)]">{t('mySearches.listsHelper')}</p>
    </aside>
  )
}

interface DiscoverHistoryProps {
  history: readonly SearchHistoryEntry[]
  searches: readonly SavedSearch[]
  /** Lecture des recherches enregistrées : « je n'ai pas pu regarder » n'est pas « tu n'en as aucune ». */
  savedStatus: SavedSearchesStatus
  onBack: () => void
  onReplayHistory: (entry: SearchHistoryEntry) => void
  onApplySearch: (search: SavedSearch) => void
  onDeleteSearch: (id: string) => void
  onCreateTarget: (search: SavedSearch) => void
}

export function DiscoverHistory({
  history,
  searches,
  savedStatus,
  onBack,
  onReplayHistory,
  onApplySearch,
  onDeleteSearch,
  onCreateTarget,
}: DiscoverHistoryProps) {
  const { t } = useTranslation('discover')
  const { data: lists } = useTargetLists()
  return (
    <div className="space-y-6" data-testid="discover-history">
      <Button variant="plain" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft aria-hidden="true" />
        {t('mySearches.back')}
      </Button>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('mySearches.eyebrow')}
          </p>
          <h1 className={cn(TYPE_SCALE.pageTitle, 'mt-1 text-[var(--bellum-text-primary)]')}>
            {t('mySearches.title')}
          </h1>
          <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('mySearches.subtitle')}</p>
        </div>
        <Button onClick={onBack}>
          <Plus aria-hidden="true" />
          {t('mySearches.newSearch')}
        </Button>
      </header>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <RecentSearches history={history} onReplay={onReplayHistory} />
          <SavedSearchesBlock
            searches={searches}
            status={savedStatus}
            onApply={onApplySearch}
            onDelete={onDeleteSearch}
            onCreateTarget={onCreateTarget}
          />
        </div>
        <WorkLists lists={lists ?? []} />
      </div>
    </div>
  )
}
