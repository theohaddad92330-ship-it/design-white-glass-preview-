import { type SignalNature, type SignalUserState } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  cn,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SelectField,
  Text,
} from '@bellum/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronDown, Plus, Radar, Search, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ACCOUNT_FOLLOW_CAP_REACHED } from '@bellum/contracts'
import { SignalBrowserDialog } from '@/features/accounts/view/account-detail/tabs/opportunities/SignalBrowserDialog'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useAccountFollows, useToggleAccountFollow } from '@/features/account-follows/api'
import { RefreshSignalsDialog } from '@/features/accounts/view/accounts-list/RefreshSignalsDialog'
import { useAccountSignals } from '@/features/accounts/hooks/useAccountSignals'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useCreateSignalAction } from '@/features/watchlist/actions/useSignalAction'
import { buildWatchlistItems, type WatchlistItem } from '@/features/watchlist/model/watchlist'
import { AddSignalDialog } from '@/features/watchlist/view/AddSignalDialog'
import { ApiError } from '@/lib/api-error'
import { useSetSignalStates, useSignalStates, useWorkspaceSignalHistory } from '../api'
import { historyContactsOf, historyItemsOf, watchlistItemToSignalLine } from '../model/account-history'
import {
  buildSignalLibrary,
  LIBRARY_SORTS,
  LIBRARY_TABS,
  stateKeyOf,
  type LibraryFilters,
} from '../model/signal-library'
import { useHiringDomainProfile } from '@/features/discover/hooks/useHiringDomainProfile'
import { SignalCard } from './SignalCard'
import { SignalFiltersDialog } from './SignalFiltersDialog'
import { SignalsByAccount } from './SignalsByAccount'
import { SignalsHistory } from './SignalsHistory'

/** Les 12 premiers signaux, puis « Afficher les 5 suivants » (Théo A signaux.N8). */
const PAGE_SIZE = 5
const INITIAL_VISIBLE = 12
const EMPTY_STATES: ReadonlyMap<string, SignalUserState> = new Map()

type SignalView = 'list' | 'byAccount'

/** #4755 — l'axe de premier niveau : ce qui tombe (« Signaux ») ou ce que mes comptes ont montré (« Historique »). */
const SECTIONS = ['signals', 'history'] as const
type Section = (typeof SECTIONS)[number]

const EMPTY_KEYS = {
  all: ['emptyAllTitle', 'emptyAllMessage'],
  saved: ['emptySavedTitle', 'emptySavedMessage'],
  discarded: ['emptyDiscardedTitle', 'emptyDiscardedMessage'],
  trashed: ['emptyTrashedTitle', 'emptyTrashedMessage'],
} as const

const TAB_LABEL = {
  all: 'tabs.all',
  saved: 'tabs.saved',
  discarded: 'tabs.discarded',
  trashed: 'tabs.trashed',
} as const

const SORT_LABEL = {
  relevance: 'toolbar.sortRelevance',
  recent: 'toolbar.sortRecent',
  oldest: 'toolbar.sortOldest',
} as const

/** Lot 768 — la frappe s'applique après ce délai : jamais un calcul (ni une écriture d'URL) par touche. */
const SEARCH_DEBOUNCE_MS = 200

/**
 * #4505 — LA PAGE SIGNAUX, au dessin de la maquette V22 (`_appliquees/a/signaux.html`).
 *
 * De haut en bas : l'en-tête (surtitre, titre, phrase · Mes veilles · Ajouter un signal) ; les onglets soulignés
 * (Tous · Enregistrés · Écartés, Corbeille à droite) ; la barre (recherche · « Tous les comptes » en liste déroulante
 * à cases · Filtres · Liste / Par compte · tri) ; « Sélectionner les N affichés » · « N signaux » ; la GRILLE de cartes
 * (3 colonnes au bureau, 1 en mobile). Le mur de puces de comptes et la phrase « Tu suis N comptes… » ont QUITTÉ
 * la page (Louis 23/10) : les comptes suivis se gèrent dans Mes veilles. Aucune recherche n'est lancée : tout vient
 * de résultats déjà disponibles, et c'est dit au pied de la liste. Rien n'est supprimé.
 */
export function SignalsLibraryPage() {
  const { t } = useTranslation('signalsLibrary')
  return (
    <CustomerPage anchorId="signaux" titleInScreen pageTitle={t('page.title')} contentClassName="px-0 py-4">
      <SignalsLibraryContent />
    </CustomerPage>
  )
}

/** Le corps de l'écran, sans la coque : c'est lui que les tests montent. */
export function SignalsLibraryContent() {
  const { t } = useTranslation('signalsLibrary')
  const { t: tTargets } = useTranslation('targets')
  const navigate = useNavigate()
  const signals = useAccountSignals()
  const statesQuery = useSignalStates()
  const setStates = useSetSignalStates()
  const follows = useAccountFollows()
  const toggleFollow = useToggleAccountFollow()
  const createAction = useCreateSignalAction()
  const [addOpen, setAddOpen] = useState(false)
  useLauraContext({ kind: 'screen', label: t('page.title'), entityId: null, facets: [], state: 'ready' })

  const [section, setSection] = useState<Section>('signals')
  const [view, setView] = useState<SignalView>('list')
  // Lot 768 — UNE recherche pour les deux onglets, dans l'URL (`?q=`) : partageable, et elle survit au passage
  // Actuel ↔ Historique. `draft` suit la frappe, `query` s'applique après le délai (client, sur ce qui est chargé).
  const urlSearch = useSearch({ strict: false }) as { q?: unknown }
  const urlQuery = urlSearch.q === undefined || urlSearch.q === null ? '' : String(urlSearch.q)
  const [draft, setDraft] = useState(urlQuery)
  const [query, setQuery] = useState(urlQuery)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(draft), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft])
  useEffect(() => {
    if (query === urlQuery) return
    void navigate({
      to: '.',
      search: previous => ({ ...previous, q: query.trim() === '' ? undefined : query }),
      replace: true,
    })
    // L'URL suit la requête appliquée ; elle ne la pilote qu'au premier rendu (lien partagé).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])
  const clearSearch = () => {
    setDraft('')
    setQuery('')
  }
  const [filters, setFilters] = useState<LibraryFilters>({
    tab: 'all',
    accountIds: new Set(),
    natures: new Set(),
    sinceDays: null,
    // Pas de tri choisi : « Pertinence » dès qu'une requête est saisie, sinon « Plus récents ».
    sort: undefined,
  })
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [visible, setVisible] = useState(INITIAL_VISIBLE)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [detailId, setDetailId] = useState<string>()
  const [refreshAccount, setRefreshAccount] = useState<{ id: string; company_name: string }>()

  // #4403.1 — le MÊME profil que la veille lit : sans lui, /signals ne marquait ni ne rangeait rien.
  const profile = useHiringDomainProfile()
  const items = useMemo(() => buildWatchlistItems(signals.data ?? []), [signals.data])
  // Lot 764 — l'Historique lit la MÊME lecture que l'onglet de chaque compte, toutes familles (pas la Veille).
  const signalHistory = useWorkspaceSignalHistory(section === 'history', query)
  const { fetchNextPage } = signalHistory
  const loadMoreHistory = useCallback(() => void fetchNextPage(), [fetchNextPage])
  const historyItems = useMemo(
    () => (signalHistory.data ? historyItemsOf(signalHistory.data) : []),
    [signalHistory.data],
  )
  const states = statesQuery.data ?? EMPTY_STATES
  const historyContacts = useMemo(
    () => (signalHistory.data ? historyContactsOf(signalHistory.data) : new Map()),
    [signalHistory.data],
  )
  const libraryFilters = useMemo<LibraryFilters>(() => ({ ...filters, query }), [filters, query])
  const library = useMemo(
    () => buildSignalLibrary(items, states, libraryFilters, { now: Date.now(), visible, profile }),
    [items, states, libraryFilters, visible, profile],
  )
  const hasQuery = query.trim() !== ''
  // « Pertinence » n'existe qu'avec une requête ; sans elle le sélecteur retombe sur « Plus récents ».
  const shownSort =
    filters.sort === 'relevance' && !hasQuery ? 'recent' : (filters.sort ?? (hasQuery ? 'relevance' : 'recent'))
  const followedIds = useMemo(() => new Set((follows.data?.followed ?? []).map(f => f.account_id)), [follows.data])
  // Les natures qui ont au moins un signal : une nature sans signal ne se propose pas.
  const availableNatures = useMemo(() => {
    const natures = new Set<SignalNature>()
    for (const row of buildSignalLibrary(
      items,
      states,
      { ...filters, natures: new Set(), accountIds: new Set(), sinceDays: null, query: '' },
      { now: Date.now(), visible: items.length || 1 },
    ).rows) {
      if (row.nature) natures.add(row.nature)
    }
    return natures
  }, [items, states, filters])
  const activeFilterCount = filters.natures.size + (filters.sinceDays === null ? 0 : 1)
  const filtered = activeFilterCount > 0 || filters.accountIds.size > 0

  // Lot 787 — la MÊME structure que l'Historique : une ligne (celle de l'élément, sinon la ligne que l'élément dit).
  const detailEntries = useMemo(
    () => library.rows.map(row => ({ item: { ...row.item, signalLine: watchlistItemToSignalLine(row.item) } })),
    [library.rows],
  )

  const patch = (next: Partial<LibraryFilters>) => {
    setFilters(current => ({ ...current, ...next }))
    setVisible(INITIAL_VISIBLE)
    setSelected(new Set())
  }
  useEffect(() => {
    setVisible(INITIAL_VISIBLE)
    setSelected(new Set())
  }, [query])

  const applyState = (
    rowsToChange: Array<{ item: { accountId: string; signalLabel: string } }>,
    state: SignalUserState | null,
  ) => {
    setStates.mutate(
      {
        items: rowsToChange.map(row => ({ account_id: row.item.accountId, signal_key: stateKeyOf(row.item) })),
        state,
      },
      {
        onSuccess: () => setSelected(new Set()),
        onError: () => toast.error(t('batch.failed')),
      },
    )
  }

  const followAccount = (accountId: string, follow: boolean) => {
    toggleFollow.mutate(
      { accountId, follow },
      {
        onError: error => {
          if (error instanceof ApiError && error.code === ACCOUNT_FOLLOW_CAP_REACHED) {
            toast.error(tTargets('follows.capReached', { max: follows.data?.max ?? 3 }))
          }
        },
      },
    )
  }

  const selectedRows = library.rows.filter(row => selected.has(row.item.id))
  const allShownSelected = library.rows.length > 0 && selectedRows.length === library.rows.length
  const [emptyTitle, emptyMessage] = EMPTY_KEYS[filters.tab]
  const accountsLabel =
    filters.accountIds.size === 0
      ? t('accounts.all')
      : filters.accountIds.size === 1
        ? (library.accounts.find(account => filters.accountIds.has(account.accountId))?.companyName ??
          t('accounts.some', { count: 1 }))
        : t('accounts.some', { count: filters.accountIds.size })

  return (
    <>
      <div className="flex min-w-0 flex-col gap-4">
        <header data-testid="signals-header" className={PAGE_GUTTER_X}>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('page.eyebrow')}
          </p>
          <ScreenIntro
            title={t('page.title')}
            titleWithoutName={t('page.title')}
            subtitle={t('page.subtitle')}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <AskLaura question={t('page.askLaura')} label={t('page.askLauraLabel')} />
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 gap-1"
                  onClick={() => void navigate({ to: '/signals/watches' })}
                >
                  <Radar className="size-4" aria-hidden />
                  {t('page.watches')}
                </Button>
                <Button type="button" className="min-h-11 gap-1" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" aria-hidden />
                  {t('page.addSignal')}
                </Button>
              </div>
            }
          />
        </header>

        <div
          role="tablist"
          aria-label={t('tabs.sectionAria')}
          className={`${PAGE_GUTTER_X} flex items-center gap-6 overflow-x-auto border-b border-[var(--bellum-border)]`}
        >
          {SECTIONS.map(key => (
            <TabButton
              key={key}
              active={section === key}
              label={t(`tabs.${key}`)}
              count={0}
              end={false}
              onClick={() => setSection(key)}
            />
          ))}
        </div>

        {section === 'history' ? (
          <SignalsHistory
            items={historyItems}
            contactsByAccount={historyContacts}
            loading={signalHistory.isLoading}
            error={signalHistory.isError}
            total={signalHistory.total}
            hasMore={signalHistory.hasNextPage}
            loadingMore={signalHistory.isFetchingNextPage || signalHistory.isPlaceholderData}
            onLoadMore={loadMoreHistory}
            query={query}
            draft={draft}
            onDraftChange={setDraft}
          />
        ) : (
          <>
            <div
              role="tablist"
              aria-label={t('tabs.aria')}
              className={`${PAGE_GUTTER_X} flex items-center gap-6 overflow-x-auto border-b border-[var(--bellum-border)]`}
            >
              {LIBRARY_TABS.map(tab => (
                <TabButton
                  key={tab}
                  active={filters.tab === tab}
                  label={t(TAB_LABEL[tab])}
                  // Le compteur de « Tous » n'est pas dans la maquette ; un compteur nul ne s'écrit pas.
                  count={tab === 'all' ? 0 : library.counts[tab]}
                  end={tab === 'trashed'}
                  onClick={() => patch({ tab })}
                />
              ))}
            </div>

            <div
              role="search"
              aria-label={t('toolbar.aria')}
              className={`${PAGE_GUTTER_X} flex flex-wrap items-center gap-2`}
            >
              <label className="flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 md:basis-64">
                <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
                <Input
                  type="search"
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  placeholder={t('toolbar.searchPlaceholder')}
                  aria-label={t('toolbar.searchAria')}
                  className="min-h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                />
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 max-w-full gap-1"
                    aria-label={t('accounts.aria')}
                  >
                    <span className="truncate">{accountsLabel}</span>
                    <ChevronDown className="size-4 shrink-0" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                  <DropdownMenuCheckboxItem
                    className="min-h-11"
                    checked={filters.accountIds.size === 0}
                    onSelect={event => event.preventDefault()}
                    onCheckedChange={() => patch({ accountIds: new Set() })}
                  >
                    {t('accounts.all')}
                  </DropdownMenuCheckboxItem>
                  {library.accounts.length > 0 ? <DropdownMenuSeparator /> : null}
                  {library.accounts.map(account => (
                    <DropdownMenuCheckboxItem
                      key={account.accountId}
                      className="min-h-11 gap-2"
                      checked={filters.accountIds.has(account.accountId)}
                      onSelect={event => event.preventDefault()}
                      onCheckedChange={() => {
                        const next = new Set(filters.accountIds)
                        if (next.has(account.accountId)) next.delete(account.accountId)
                        else next.add(account.accountId)
                        patch({ accountIds: next })
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate">{account.companyName}</span>
                      <span className="text-xs tabular-nums text-[var(--bellum-text-muted)]">{account.count}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {view === 'list' ? (
                <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal className="size-4" aria-hidden />
                  {activeFilterCount > 0 ? t('page.filtersActive', { count: activeFilterCount }) : t('page.filters')}
                </Button>
              ) : null}
              <div
                role="group"
                aria-label={t('page.viewAria')}
                className="flex rounded-control border border-[var(--bellum-border)]"
              >
                <Button
                  type="button"
                  variant={view === 'list' ? 'secondary' : 'ghost'}
                  aria-pressed={view === 'list'}
                  className="min-h-11"
                  onClick={() => setView('list')}
                >
                  {t('page.viewList')}
                </Button>
                <Button
                  type="button"
                  variant={view === 'byAccount' ? 'secondary' : 'ghost'}
                  aria-pressed={view === 'byAccount'}
                  className="min-h-11"
                  onClick={() => setView('byAccount')}
                >
                  {t('page.viewByAccount')}
                </Button>
              </div>
              {view === 'list' ? (
                <div className="min-w-40">
                  <SelectField
                    ariaLabel={t('toolbar.sortAria')}
                    value={shownSort}
                    onChange={value => patch({ sort: value as (typeof LIBRARY_SORTS)[number] })}
                    options={LIBRARY_SORTS.filter(sort => sort !== 'relevance' || hasQuery).map(sort => ({
                      value: sort,
                      label: t(SORT_LABEL[sort]),
                    }))}
                  />
                </div>
              ) : null}
            </div>

            {view === 'byAccount' ? (
              <SignalsByAccount />
            ) : signals.isError ? (
              <div className={PAGE_GUTTER_X}>
                <ScreenState state="error" title={t('page.loadError')} message="" />
              </div>
            ) : (
              <>
                {library.total > 0 ? (
                  <div
                    data-testid="signals-meta"
                    className={`${PAGE_GUTTER_X} flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--bellum-text-muted)]`}
                  >
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={allShownSelected}
                        onChange={() =>
                          setSelected(allShownSelected ? new Set() : new Set(library.rows.map(row => row.item.id)))
                        }
                      />
                      {t('list.selectAll', { count: library.rows.length })}
                    </label>
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      <strong className="font-semibold text-[var(--bellum-text-primary)]">{library.total}</strong>{' '}
                      {t('list.countUnit', { count: library.total })}
                    </Text>
                  </div>
                ) : null}

                {selectedRows.length > 0 ? (
                  <div
                    role="toolbar"
                    aria-label={t('batch.aria')}
                    className={`${PAGE_GUTTER_X} flex flex-wrap items-center gap-2`}
                  >
                    <Badge variant="secondary">{t('batch.selected', { count: selectedRows.length })}</Badge>
                    {filters.tab === 'all' || filters.tab === 'saved' ? (
                      <>
                        {filters.tab === 'all' ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => applyState(selectedRows, 'saved')}
                          >
                            {t('actions.save')}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => applyState(selectedRows, 'discarded')}
                        >
                          {t('actions.discard')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => applyState(selectedRows, 'trashed')}
                        >
                          {t('actions.trash')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => applyState(selectedRows, null)}
                      >
                        {t('actions.restore')}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setSelected(new Set())}>
                      {t('batch.clear')}
                    </Button>
                  </div>
                ) : null}

                {signals.isLoading ? null : library.total === 0 ? (
                  <div className={PAGE_GUTTER_X}>
                    {hasQuery ? (
                      <ScreenState
                        state="empty_true"
                        title={t('list.emptySearchTitle', { query: query.trim() })}
                        message={t('list.emptySearchMessage')}
                        action={{ label: t('list.emptySearchAction'), onClick: clearSearch }}
                      />
                    ) : filtered ? (
                      <ScreenState
                        state="empty_true"
                        title={t('list.emptyFilteredTitle')}
                        message={t('list.emptyFilteredMessage')}
                        action={{
                          label: t('list.emptyFilteredAction'),
                          onClick: () => patch({ accountIds: new Set(), natures: new Set(), sinceDays: null }),
                        }}
                      />
                    ) : (
                      <ScreenState
                        state="empty_never"
                        title={t(`list.${emptyTitle}`)}
                        message={t(`list.${emptyMessage}`)}
                        action={
                          filters.tab === 'all' ? { label: t('list.emptyAllAction'), to: '/discover' } : undefined
                        }
                      />
                    )}
                  </div>
                ) : (
                  <ul
                    data-testid="signal-grid"
                    className={`${PAGE_GUTTER_X} grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3`}
                  >
                    {library.rows.map(row => (
                      <SignalCard
                        key={row.item.id}
                        row={row}
                        selected={selected.has(row.item.id)}
                        followed={followedIds.has(row.item.accountId)}
                        onToggleSelect={() =>
                          setSelected(current => {
                            const next = new Set(current)
                            if (next.has(row.item.id)) next.delete(row.item.id)
                            else next.add(row.item.id)
                            return next
                          })
                        }
                        onOpen={() => setDetailId(row.item.id)}
                        onSetState={state => applyState([row], state)}
                        onToggleFollow={() => followAccount(row.item.accountId, !followedIds.has(row.item.accountId))}
                        onMakeAction={() =>
                          createAction.mutate({
                            accountId: row.item.accountId,
                            label: row.item.displayLabel ?? row.item.signalLabel,
                          })
                        }
                        onRefresh={() =>
                          setRefreshAccount({ id: row.item.accountId, company_name: row.item.companyName })
                        }
                      />
                    ))}
                  </ul>
                )}

                {library.total > 0 ? (
                  <Box className={`${PAGE_GUTTER_X} flex flex-col items-center gap-2 pb-2`}>
                    {library.remaining > 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setVisible(current => current + PAGE_SIZE)}
                      >
                        {t('list.showMore', { count: Math.min(PAGE_SIZE, library.remaining) })}
                      </Button>
                    ) : null}
                    <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                      {t('list.footer', { shown: library.rows.length, total: library.total })}
                    </Text>
                  </Box>
                ) : null}
              </>
            )}
          </>
        )}

        {/* #4545 (Louis 25/10/2026, revient sur #4340) — la section « Pistes détectées » a QUITTÉ Signaux : un
            signal est un fait daté, une piste un besoin déduit, et la page était noyée sous 2 708 lignes. Les
            pistes vivent dans le panneau du Pipe (`/projects?pistes=1`). */}
      </div>

      <SignalFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        filters={filters}
        availableNatures={availableNatures}
        onChange={next => patch(next)}
      />

      {/* #5191 — LA modale d'un signal : « 1 sur N » sur la liste affichée, personnes à contacter comprises. */}
      <SignalBrowserDialog entries={detailEntries} openId={detailId} onOpenChange={setDetailId} />

      {addOpen ? <AddSignalToAnyAccount items={items} onClose={() => setAddOpen(false)} /> : null}

      <RefreshSignalsDialog
        open={Boolean(refreshAccount)}
        onOpenChange={open => {
          if (!open) setRefreshAccount(undefined)
        }}
        accounts={refreshAccount ? [refreshAccount] : []}
        onDone={() => setRefreshAccount(undefined)}
      />
    </>
  )
}

/**
 * « Ajouter un signal » se rattache à n'importe quel compte de l'espace, pas seulement à ceux qui ont déjà un signal.
 * Les comptes ne se lisent qu'à l'ouverture : la page n'en paie pas la lecture.
 */
function AddSignalToAnyAccount({ items, onClose }: { items: WatchlistItem[]; onClose: () => void }) {
  const workspaceAccounts = useAccounts({ limit: 100 })
  const accounts = useMemo(() => {
    const byId = new Map<string, string>()
    for (const page of workspaceAccounts.data?.pages ?? [])
      for (const account of page.data ?? []) byId.set(account.id, account.company_name)
    for (const item of items) if (!byId.has(item.accountId)) byId.set(item.accountId, item.companyName)
    return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [workspaceAccounts.data, items])
  return (
    <AddSignalDialog
      open
      onOpenChange={open => {
        if (!open) onClose()
      }}
      accounts={accounts}
    />
  )
}

function TabButton({
  active,
  label,
  count,
  end,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  end: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm',
        end && 'ml-auto',
        active
          ? 'border-[var(--bellum-primary)] font-semibold text-[var(--bellum-text-primary)]'
          : 'border-transparent text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
      )}
    >
      <span>{label}</span>
      {count > 0 ? (
        <span className="rounded-badge bg-[var(--bellum-surface-2)] px-1.5 text-xs tabular-nums text-[var(--bellum-text-secondary)]">
          {count}
        </span>
      ) : null}
    </button>
  )
}
