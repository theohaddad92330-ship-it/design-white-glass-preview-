import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { History, Play, Search } from 'lucide-react'
import { Box, Button, CountBadge, EmptyState, Input, Text, TYPE_SCALE } from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { OverflowPriorities } from '@/features/action-history/view/OverflowPriorities'
import { useAllBriefingActions, useDailyBriefing } from '@/features/briefing/api'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { CrmWriteQueueState } from '@/features/crm/view/CrmWriteQueueState'
import { AwaitingOutcomeQueue } from '@/features/actions/components/AwaitingOutcomeQueue'
import { SendTimingLine } from '@/features/actions/components/SendTimingLine'
import { BurstPanel } from './BurstPanel'
import { HistoryDrawer, type HistoryTab } from './HistoryDrawer'
import { TodayBatchCard } from './TodayBatchCard'
import { TodayAddTaskButton } from '@/features/briefing/view/TodayAddTaskButton'
import { TodayTaskRow } from './TodayTaskRow'
import { TodayDraftsBanner } from './TodayDraftsBanner'
import { TodayStaleBanner } from './TodayStaleBanner'
import { staleActionIds } from './todayStale'
import { TodayFilterMenu } from './TodayFilterMenu'
import { TodayStatePills } from './TodayStatePills'
import { stateCounts, type TodayStateKey } from './todayStates'
import { buildTodayQueue, groupBatches, type TodayFilters, type TodayGroupKey, type TodayItem } from './todayQueue'
import { useTodayGestures } from './useTodayGestures'
import { useTodaySources, type TodaySourceName } from './useTodaySources'

/** L'horloge de la page : « aujourd'hui » change à minuit, et une échéance passe à « en retard ». */
function useNow(everyMs: number): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}

const MINUTE_MS = 60_000

/**
 * Lot L-A (#4164) — « AUJOURD'HUI » : UN seul endroit où l'on agit.
 *
 * Une file unique, par échéance (En retard · Aujourd'hui · Cette semaine · Plus
 * tard) puis par geste (À valider · E-mails · LinkedIn · Appels · Tâches). Chaque
 * groupe se traite d'un trait en mode rafale. Tout ce qui n'est PAS un geste à
 * faire — le journal, les runs, les routines planifiées, le catalogue
 * d'automatisations — est dans le tiroir « Historique ».
 *
 * Le sous-titre compte les gestes du jour (en retard + aujourd'hui) ; aucune
 * probabilité (doctrine) ; une absence ne fait aucune ligne.
 */
export function TodayPage({
  overdueOnly = false,
  initialFilters = {},
  historyOpen = false,
  historyTab,
  onClearOverdue,
}: {
  /** Arrivée depuis la tuile « En retard » du tableau de bord : seule cette section est montrée. */
  overdueOnly?: boolean
  initialFilters?: TodayFilters
  historyOpen?: boolean
  historyTab?: HistoryTab
  onClearOverdue?: () => void
}) {
  const { t } = useTranslation('actions')
  const now = useNow(MINUTE_MS)
  const sources = useTodaySources(now)
  const gestures = useTodayGestures(now)
  const members = useWorkspaceMembers().data ?? []
  // #2397.6 / #2107 — les priorités du brief qui débordent du top d'« Aujourd'hui » (page d'accueil)
  // se retrouvent ici, jamais en notification : même lecture non plafonnée qu'avant la file unique.
  const briefingActions = useAllBriefingActions().data ?? []
  const conflicts = useDailyBriefing().data?.agenda.conflicts ?? []

  const [filters, setFilters] = useState<TodayFilters>(initialFilters)
  const [stateFilter, setStateFilter] = useState<TodayStateKey | null>(null)
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set())
  const [laterOpen, setLaterOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(historyOpen)
  const [burst, setBurst] = useState<{ group: TodayGroupKey; deck: TodayItem[] } | null>(null)
  // Refonte Théo (`.a14-search`) — « Une tâche ou un compte… » : un filtre de LECTURE, local,
  // sur l'intitulé, le compte et le contact. Il ne réordonne rien et n'écrit rien.
  const [search, setSearch] = useState('')
  // Refonte Théo — la tâche ouverte dans sa fenêtre (une à la fois).
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const skip = useCallback((item: TodayItem) => setSkipped(previous => new Set(previous).add(item.id)), [])
  const liveItems = useMemo(() => sources.items.filter(item => !skipped.has(item.id)), [sources.items, skipped])
  const items = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return liveItems
    return liveItems.filter(item =>
      [item.title, item.accountName, item.contactName].some(text => text?.toLocaleLowerCase().includes(needle)),
    )
  }, [liveItems, search])
  // Théo C actions-aujourdhui.R2 — la pastille d'état est un filtre de plus : il change ce qu'on VOIT, jamais ce qui est dû.
  const queue = useMemo(
    () => buildTodayQueue(items, stateFilter ? { ...filters, state: stateFilter } : filters, now),
    [items, filters, stateFilter, now],
  )
  const states = useMemo(() => stateCounts(items), [items])
  const staleIds = useMemo(() => staleActionIds(liveItems, now), [liveItems, now])
  const sections = overdueOnly ? queue.sections.filter(section => section.key === 'overdue') : queue.sections

  const filtered = Object.values(filters).some(Boolean) || stateFilter !== null || search.trim() !== ''
  // Refonte Théo — « Traiter (N) » de la barre : la file entière, dans l'ordre où elle se lit.
  const wholeDeck = useMemo(() => sections.flatMap(section => section.groups.flatMap(group => group.items)), [sections])
  const closeBurst = useCallback(() => setBurst(null), [])

  return (
    <Box className="flex min-h-full w-full flex-1 flex-col gap-5 pb-8">
      {/* Refonte Théo (`.a14-head`) — le titre, la phrase, puis Historique et le geste principal. */}
      <header className={`flex flex-wrap items-start justify-between gap-4 pt-2 ${PAGE_GUTTER_X}`}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Text element="h1" className={TYPE_SCALE.pageTitle}>
            {t('today.title')}
          </Text>
          {/* Théo C actions-aujourdhui.R1 — la phrase fixe remplace le sous-titre chiffré : le compte vit sur la pastille « Toutes ». */}
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('today.intro')}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => setDrawerOpen(true)}
          >
            <History className="size-3.5" aria-hidden="true" />
            {t('today.history')}
          </Button>
          <TodayAddTaskButton />
        </div>
      </header>

      <div className={`flex flex-col gap-5 ${PAGE_GUTTER_X}`}>
        {/* Théo C (`.t-banner.danger`) — une source illisible est un BANDEAU : la file n'est pas
            présentée comme complète. */}
        {sources.unavailable.length > 0 ? (
          <Box
            role="status"
            className="rounded-card border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] px-4 py-3"
          >
            <Text size="sm" weight="medium" className="text-[var(--danger-soft-text)]">
              {t('today.unavailable', {
                sources: sources.unavailable.map((name: TodaySourceName) => t(`today.sources.${name}`)).join(', '),
              })}
            </Text>
          </Box>
        ) : null}
        {/* Théo C actions-aujourdhui.N3 / R7 — les brouillons de la messagerie, à part des tâches. */}
        <TodayDraftsBanner />
        {/* #4485 — « Proposer de les clore » : les relances en retard de plus de 30 jours, au clic seulement. */}
        <TodayStaleBanner ids={staleIds} />

        {/* Refonte Théo (`.a14-filterbar`) — chercher, l'état, les filtres, le compte, « Traiter ». */}
        <Box className="flex flex-wrap items-center gap-2">
          <label className="relative flex min-w-[14rem] flex-1 items-center">
            <Search
              className="pointer-events-none absolute left-3 size-4 text-[var(--bellum-text-muted)]"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder={t('today.row.search')}
              aria-label={t('today.row.searchLabel')}
              className="min-h-11 pl-9"
            />
          </label>
          <TodayFilterMenu options={queue.options} filters={filters} onChange={setFilters} />
          {wholeDeck.length > 0 ? (
            <>
              <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="px-1">
                {t('today.row.count', { count: wholeDeck.length })}
              </Text>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setBurst({ group: wholeDeck[0]!.group, deck: wholeDeck })}
              >
                <Play className="size-3.5" aria-hidden="true" />
                {t('today.row.processAll', { count: wholeDeck.length })}
              </Button>
            </>
          ) : null}
        </Box>
        {items.length > 0 || stateFilter !== null ? (
          <TodayStatePills
            counts={states}
            total={items.length}
            value={stateFilter}
            onChange={setStateFilter}
            onOpenDone={() => setDrawerOpen(true)}
          />
        ) : null}
        {/* Théo C actions-aujourdhui.N5 — la doctrine, dite : ouvrir et préparer ne traitent rien. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('today.doctrine')}
        </Text>
        {overdueOnly ? (
          <div className="flex flex-wrap items-center gap-2">
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('today.overdueOnly')}
            </Text>
            {onClearOverdue ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={onClearOverdue}
              >
                {t('today.overdueOnlyClear')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {sources.loading && items.length === 0 ? (
          <Text size="sm" color="text-[var(--bellum-text-muted)]" role="status">
            {t('today.loading')}
          </Text>
        ) : sections.length === 0 ? (
          // Une recherche sans correspondance n'est pas une file vide : la file existe, rien n'y répond.
          filtered && (queue.unfilteredTotal > 0 || liveItems.length > 0) ? (
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('today.filters.empty')}
            </Text>
          ) : sources.unavailable.length > 0 ? null : (
            <EmptyState
              size="sm"
              title={t('today.empty.title')}
              description={t('today.empty.description')}
              action={
                <Link to="/actions/sequences" className="text-sm underline">
                  {t('today.empty.sequences')}
                </Link>
              }
            />
          )
        ) : (
          sections.map(section => {
            const collapsed = section.key === 'later' && !laterOpen
            return (
              <section key={section.key} aria-labelledby={`today-${section.key}`} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Text
                    element="h2"
                    id={`today-${section.key}`}
                    size="base"
                    weight="semibold"
                    color={section.key === 'overdue' ? 'text-[var(--danger-soft-text)]' : undefined}
                  >
                    {t(`today.sections.${section.key}`)}
                  </Text>
                  {section.key === 'later' ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="pointer-coarse:min-h-11"
                      aria-expanded={!collapsed}
                      onClick={() => setLaterOpen(open => !open)}
                    >
                      {collapsed ? t('today.laterShow', { count: section.count }) : t('today.laterHide')}
                    </Button>
                  ) : null}
                </div>
                {collapsed
                  ? null
                  : section.groups.map(group => (
                      <div
                        key={group.key}
                        className="space-y-2"
                        role="group"
                        aria-label={t(`today.groups.${group.key}`)}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Text element="h3" size="sm" weight="medium" className="flex items-center gap-2">
                            {t(`today.groups.${group.key}`)}
                            <CountBadge count={group.count} />
                          </Text>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="pointer-coarse:min-h-11"
                            aria-label={t('today.processAria', {
                              group: t(`today.groups.${group.key}`),
                              count: group.count,
                            })}
                            onClick={() => setBurst({ group: group.key, deck: group.items })}
                          >
                            <Play className="size-3.5" aria-hidden="true" />
                            {t('today.process', { count: group.count })}
                          </Button>
                        </div>
                        {/* Refonte Théo (`.a14-task-list`) — UNE liste dense, dans un seul cadre. */}
                        <ul className="divide-y divide-[var(--bellum-border)] overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card">
                          {groupBatches(group.items).map(entry =>
                            entry.kind === 'batch' ? (
                              <li key={`batch:${entry.batchId}`} className="p-2">
                                <TodayBatchCard
                                  items={entry.items}
                                  now={now}
                                  gestures={gestures}
                                  members={members}
                                  hasMandate={sources.hasMandate}
                                  onSkip={skip}
                                />
                              </li>
                            ) : (
                              <li key={entry.item.id}>
                                <TodayTaskRow
                                  item={entry.item}
                                  now={now}
                                  gestures={gestures}
                                  members={members}
                                  hasMandate={sources.hasMandate}
                                  onSkip={skip}
                                  open={openTaskId === entry.item.id}
                                  onOpenChange={open => setOpenTaskId(open ? entry.item.id : null)}
                                />
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    ))}
              </section>
            )
          })
        )}
        {/* L'état du connecteur CRM n'est pas un contenu qu'un filtre doit pouvoir cacher :
            « aucun CRM branché » n'est pas « rien n'attend ». */}
        <CrmWriteQueueState status={sources.crmStatus} unread={sources.crmUnread} />

        {overdueOnly ? null : <OverflowPriorities actions={briefingActions} conflicts={conflicts} />}

        {overdueOnly ? null : (
          <div className="space-y-2">
            <AwaitingOutcomeQueue />
            <SendTimingLine />
          </div>
        )}
      </div>

      {burst ? (
        <BurstPanel
          deck={burst.deck}
          live={items}
          group={burst.group}
          now={now}
          gestures={gestures}
          members={members}
          hasMandate={sources.hasMandate}
          onSkip={skip}
          onClose={closeBurst}
        />
      ) : null}

      <HistoryDrawer open={drawerOpen} onOpenChange={setDrawerOpen} initialTab={historyTab} />
    </Box>
  )
}
