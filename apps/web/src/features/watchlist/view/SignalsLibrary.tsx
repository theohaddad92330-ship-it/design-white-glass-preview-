import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  Briefcase,
  ChevronDown,
  FileText,
  Filter,
  Landmark,
  MoreHorizontal,
  Newspaper,
  Plus,
  Trash2,
  TrendingUp,
  UserCog,
} from 'lucide-react'
import {
  TYPE_SCALE,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useAccountSignals } from '@/features/accounts/hooks/useAccountSignals'
import { useHiringDomainProfile } from '@/features/discover/hooks/useHiringDomainProfile'
import { useSession } from '@/lib/hooks/use-session'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { useCreateSignalAction } from '../actions/useSignalAction'
import { OutOfTradeTag } from '@/features/discover/view/OutOfTradeTag'
import { buildNeedLine, buildWatchlistItems, isOutOfTrade, itemNeedKind, type WatchlistItem } from '../model/watchlist'
import {
  buildLibraryView,
  EMPTY_LIBRARY_STATE,
  LIBRARY_DATE_WINDOWS,
  LIBRARY_NATURES,
  LIBRARY_PAGE_SIZE,
  LIBRARY_STEP,
  LIBRARY_TABS,
  natureOf,
  type LibraryDateWindow,
  type LibraryNature,
  type LibrarySort,
  type LibraryState,
  type LibraryTab,
} from '../model/signal-library'
import { EMPTY_MARKS, readMarks, withSaved, withTrashed, writeMarks } from '../model/signal-library-marks'
import { AddSignalDialog } from './AddSignalDialog'
import { SignalBrowserDialog } from '@/features/accounts/view/account-detail/tabs/opportunities/SignalBrowserDialog'

/* ------------------------------------------------------------------ */
/*  La bibliothèque de signaux (Théo signaux) : cartes, quatre onglets, */
/*  filtres multi-sélection, sélection en lot. Elle lit LE flux de      */
/*  signaux que lisait déjà le plateau (`useAccountSignals`) — aucune   */
/*  recherche supplémentaire, aucun crédit.                             */
/* ------------------------------------------------------------------ */

const NATURE_ICON: Record<LibraryNature, typeof Briefcase> = {
  hiring: Briefcase,
  mna: Landmark,
  exec: UserCog,
  funding: TrendingUp,
  tender: FileText,
  other: Newspaper,
}

const NATURE_TONE: Record<LibraryNature, 'info' | 'warning' | 'primary' | 'success' | 'default'> = {
  hiring: 'info',
  mna: 'warning',
  exec: 'primary',
  funding: 'success',
  tender: 'primary',
  other: 'default',
}

function formatDate(value: string, language: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' })
}

function toggled<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

interface CardProps {
  item: WatchlistItem
  /** #4403.1 — l'offre est hors du métier de l'ESN : la carte le dit. */
  outOfTrade: boolean
  tab: LibraryTab
  selected: boolean
  saved: boolean
  onSelect: (checked: boolean) => void
  onSave: () => void
  onTrash: () => void
  onRestore: () => void
  onOpen: () => void
}

function SignalCard({
  item,
  tab,
  selected,
  saved,
  outOfTrade,
  onSelect,
  onSave,
  onTrash,
  onRestore,
  onOpen,
}: CardProps) {
  const { t, i18n } = useTranslation('watchlist', { keyPrefix: 'library' })
  const { t: tTypes } = useTranslation('watchlist', { keyPrefix: 'filters.types' })
  const navigate = useNavigate()
  const [actionOpen, setActionOpen] = useState(false)
  const nature = natureOf(item)
  const Icon = NATURE_ICON[nature]
  const need = itemNeedKind(item) ? buildNeedLine(item) : null
  const title = item.displayLabel ?? item.signalLabel
  return (
    <article
      data-testid="signal-card"
      className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]"
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <Badge variant={NATURE_TONE[nature]} className="gap-1.5">
            <Icon className="size-3.5" aria-hidden="true" />
            {tTypes(nature)}
          </Badge>
          {outOfTrade ? <OutOfTradeTag testId="signal-card-out-of-trade" /> : null}
          <span className="ml-auto flex items-center gap-1">
            <Checkbox
              checked={selected}
              onCheckedChange={checked => onSelect(checked === true)}
              aria-label={t('selectOne', { title })}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="plain" size="icon" aria-label={t('moreFor', { title })}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onOpen}>{t('menu.detail')}</DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void navigate({ to: '/accounts/$id', params: { id: item.accountId } })}
                >
                  {t('menu.account')}
                </DropdownMenuItem>
                {tab !== 'trash' && (
                  <DropdownMenuItem onSelect={onSave}>{saved ? t('menu.unsave') : t('menu.save')}</DropdownMenuItem>
                )}
                {tab === 'trash' ? (
                  <DropdownMenuItem onSelect={onRestore}>{t('menu.restore')}</DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={onTrash}>{t('menu.trash')}</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
        <Link
          to="/accounts/$id"
          params={{ id: item.accountId }}
          className="flex min-w-0 items-center gap-2 text-sm text-[var(--bellum-text-secondary)] hover:underline"
        >
          <CompanyAvatar name={item.companyName} logoUrl={item.logoUrl} website={item.website} />
          <span className="truncate">{item.companyName}</span>
        </Link>
        <button
          type="button"
          onClick={onOpen}
          className="min-h-11 text-left text-lg font-semibold leading-snug text-[var(--bellum-text-primary)] hover:underline"
        >
          {title}
        </button>
        {item.impact && <p className="text-sm text-[var(--bellum-text-secondary)]">{item.impact}</p>}
        {nature === 'hiring' && <p className="text-xs text-[var(--warning-soft-text)]">{t('hiringIsNotMission')}</p>}
        {need && (
          <p className="text-sm text-[var(--bellum-text-secondary)]">
            <strong className="font-semibold text-[var(--bellum-text-primary)]">{t('probableNeed')}</strong> {need}
          </p>
        )}
        {tab !== 'trash' && (
          <Button
            variant="plain"
            size="sm"
            className="mt-auto self-start"
            aria-haspopup="dialog"
            onClick={() => setActionOpen(true)}
          >
            <Plus aria-hidden="true" />
            {t('makeAction')}
          </Button>
        )}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-4 py-2.5 text-xs text-[var(--bellum-text-muted)]">
        {/* Refonte Théo (23/10) — une source ne se NOMME pas sur la carte : le lien dit sa nature (« Voir
            l'offre », « Voir l'article »), le rendu unique `SignalSourceLink` ; sans URL vérifiable, rien. */}
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <SignalSourceLink
            url={item.sourceUrl}
            sourceKind={item.sourceKind}
            collectedBeforeLink={item.collectedBeforeLink}
          />
        </span>
        <time dateTime={item.signalDate} className="shrink-0">
          {formatDate(item.signalDate, i18n.language)}
        </time>
      </footer>
      {actionOpen && <SignalActionDialog item={item} title={title} onClose={() => setActionOpen(false)} />}
    </article>
  )
}

/**
 * Théo `dlg-action` — « En faire une action » s'ouvre DÉJÀ rédigé (le fait du signal), modifiable, puis
 * « Ajouter au plan ». L'action rejoint le plan du compte ; « Fait » ne prouve jamais un envoi (doctrine).
 * L'échéance de la maquette n'est pas posée : l'API des actions de signal n'en porte pas.
 */
function SignalActionDialog({ item, title, onClose }: { item: WatchlistItem; title: string; onClose: () => void }) {
  const { t } = useTranslation('watchlist', { keyPrefix: 'library.actionDialog' })
  const createAction = useCreateSignalAction()
  const [label, setLabel] = useState(title)
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent closeLabel={t('cancel')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{item.companyName}</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1 text-xs font-medium text-[var(--bellum-text-secondary)]">
          {t('label')}
          <input
            type="text"
            value={label}
            onChange={event => setLabel(event.target.value)}
            className="h-11 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 text-sm text-[var(--bellum-text-primary)] focus:outline-none"
          />
        </label>
        <p className="text-xs text-[var(--bellum-text-muted)]">{t('helper')}</p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={label.trim() === '' || createAction.isPending}
            onClick={() =>
              createAction.mutate({ accountId: item.accountId, label: label.trim() }, { onSuccess: onClose })
            }
          >
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FiltersDialog({
  open,
  onOpenChange,
  natures,
  days,
  onNatures,
  onDays,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  natures: ReadonlySet<LibraryNature>
  days: LibraryDateWindow | null
  onNatures: (next: ReadonlySet<LibraryNature>) => void
  onDays: (next: LibraryDateWindow | null) => void
}) {
  const { t } = useTranslation('watchlist', { keyPrefix: 'library' })
  const { t: tTypes } = useTranslation('watchlist', { keyPrefix: 'filters.types' })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('close')}>
        <DialogHeader>
          <DialogTitle>{t('filters.title')}</DialogTitle>
          <DialogDescription>{t('filters.description')}</DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-[var(--bellum-text-primary)]">
            {t('filters.nature')}
          </legend>
          {LIBRARY_NATURES.map(nature => (
            <label key={nature} className="flex min-h-11 items-center gap-3 text-sm text-[var(--bellum-text-primary)]">
              <Checkbox checked={natures.has(nature)} onCheckedChange={() => onNatures(toggled(natures, nature))} />
              {tTypes(nature)}
            </label>
          ))}
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold text-[var(--bellum-text-primary)]">{t('filters.date')}</legend>
          <div className="flex flex-wrap gap-2">
            {LIBRARY_DATE_WINDOWS.map(window => (
              <Button
                key={window}
                type="button"
                size="sm"
                variant={days === window ? 'soft' : 'outline'}
                aria-pressed={days === window}
                onClick={() => onDays(days === window ? null : window)}
              >
                {t('filters.lastDays', { count: window })}
              </Button>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-between gap-2">
          <Button
            variant="plain"
            onClick={() => {
              onNatures(new Set())
              onDays(null)
            }}
          >
            {t('filters.reset')}
          </Button>
          <Button onClick={() => onOpenChange(false)}>{t('filters.apply')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function AccountFilter({
  accounts,
  value,
  onChange,
}: {
  accounts: { id: string; name: string }[]
  value: ReadonlySet<string>
  onChange: (next: ReadonlySet<string>) => void
}) {
  const { t } = useTranslation('watchlist', { keyPrefix: 'library' })
  const label =
    value.size === 0
      ? t('allAccounts')
      : value.size === 1
        ? (accounts.find(account => value.has(account.id))?.name ?? t('allAccounts'))
        : t('accountsCount', { count: value.size })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={t('accountFilter')} className="justify-between">
          {label}
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-80 w-72 overflow-y-auto p-2">
        {accounts.map(account => (
          <label
            key={account.id}
            className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]"
          >
            <Checkbox checked={value.has(account.id)} onCheckedChange={() => onChange(toggled(value, account.id))} />
            <CompanyAvatar name={account.name} />
            <span className="truncate">{account.name}</span>
          </label>
        ))}
        {value.size > 0 && (
          <Button variant="plain" size="sm" className="mt-1 w-full" onClick={() => onChange(new Set())}>
            {t('allAccounts')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface SignalsLibraryProps {
  /** Le mode d'affichage : cartes à plat, ou le plateau regroupé par compte. */
  view: 'list' | 'byAccount'
  onViewChange: (view: 'list' | 'byAccount') => void
  /** Le plateau regroupé par compte, rendu sous la barre quand `view === 'byAccount'`. */
  byAccount: React.ReactNode
  /** Un geste de plus dans l'en-tête (le raccourci vers Laura). */
  headerExtra?: React.ReactNode
}

export function SignalsLibrary({ view, onViewChange, byAccount, headerExtra }: SignalsLibraryProps) {
  const { t, i18n } = useTranslation('watchlist', { keyPrefix: 'library' })
  const { user } = useSession()
  const { data: signals = [], isLoading, isError } = useAccountSignals()
  const profile = useHiringDomainProfile()
  const items = useMemo(
    () => buildWatchlistItems(signals),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n.language recalcule les libellés de repli
    [signals, i18n.language],
  )

  const [marks, setMarks] = useState(EMPTY_MARKS)
  useEffect(() => setMarks(readMarks(user?.id)), [user?.id])
  const updateMarks = useCallback(
    (next: typeof marks) => {
      setMarks(next)
      writeMarks(user?.id, next)
    },
    [user?.id],
  )

  const [state, setState] = useState<LibraryState>(EMPTY_LIBRARY_STATE)
  const patch = (next: Partial<LibraryState>) => {
    setState(current => ({ ...current, ...next }))
    setShown(LIBRARY_PAGE_SIZE)
    setSelected(new Set())
  }
  const [shown, setShown] = useState(LIBRARY_PAGE_SIZE)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [openedId, setOpenedId] = useState<string | null>(null)

  const library = useMemo(
    () => buildLibraryView(items, state, marks, profile, Date.now()),
    [items, state, marks, profile],
  )
  const visible = library.items.slice(0, shown)
  const allVisibleSelected = visible.length > 0 && visible.every(item => selected.has(item.id))
  const filtered =
    state.accountIds.size > 0 || state.natures.size > 0 || state.days !== null || state.query.trim().length > 0

  const tabLabel = (tab: LibraryTab) => t(`tabs.${tab}`)
  const countOf = (tab: LibraryTab) => library.tabCounts[tab]
  const bulkIds = [...selected]

  const renderTab = (tab: LibraryTab) => (
    <TabsTrigger key={tab} value={tab} className={tab === 'trash' ? 'ml-auto' : undefined}>
      {tab === 'trash' && <Trash2 className="size-4" aria-hidden="true" />}
      {tabLabel(tab)}
      {countOf(tab) > 0 && (
        <span className="ml-2 text-xs font-normal text-[var(--bellum-text-muted)]">{countOf(tab)}</span>
      )}
    </TabsTrigger>
  )

  return (
    <div className={cn(PAGE_GUTTER_X, 'flex min-w-0 flex-col gap-4')} data-testid="signals-library">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-accent)]">
            {t('eyebrow')}
          </p>
          <h1 className={cn(TYPE_SCALE.pageTitle, 'mt-1 text-[var(--bellum-text-primary)]')}>{t('title')}</h1>
          <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {headerExtra}
          <Button asChild variant="outline">
            <Link to="/signals/watches">{t('myWatches')}</Link>
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus aria-hidden="true" />
            {t('addSignal')}
          </Button>
        </div>
      </header>

      <Tabs value={state.tab} onValueChange={value => patch({ tab: value as LibraryTab })}>
        <TabsList variant="underline" aria-label={t('tabsAria')} className="w-full max-w-full overflow-x-auto">
          {LIBRARY_TABS.map(renderTab)}
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <SearchInput
            size="md"
            value={state.query}
            onChange={query => patch({ query })}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        <AccountFilter
          accounts={library.accounts}
          value={state.accountIds}
          onChange={accountIds => patch({ accountIds })}
        />
        <Button variant="outline" onClick={() => setFiltersOpen(true)}>
          <Filter aria-hidden="true" />
          {t('filters.button')}
          {state.natures.size + (state.days === null ? 0 : 1) > 0 && (
            <Badge variant="primary">{state.natures.size + (state.days === null ? 0 : 1)}</Badge>
          )}
        </Button>
        <div
          role="group"
          aria-label={t('viewAria')}
          className="flex rounded-lg border border-[var(--bellum-border)] p-0.5"
        >
          {(['list', 'byAccount'] as const).map(mode => (
            <Button
              key={mode}
              size="sm"
              variant={view === mode ? 'soft' : 'plain'}
              aria-pressed={view === mode}
              onClick={() => onViewChange(mode)}
            >
              {t(`view.${mode}`)}
            </Button>
          ))}
        </div>
        <Select value={state.sort} onValueChange={value => patch({ sort: value as LibrarySort })}>
          <SelectTrigger aria-label={t('sortAria')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="trade">{t('sort.trade')}</SelectItem>
            <SelectItem value="recent">{t('sort.recent')}</SelectItem>
            <SelectItem value="oldest">{t('sort.oldest')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {view === 'byAccount' ? (
        byAccount
      ) : isLoading ? (
        <p className="text-sm text-[var(--bellum-text-secondary)]">{t('loading')}</p>
      ) : isError ? (
        <ScreenState state="error" title={t('errorTitle')} message={t('errorBody')} />
      ) : library.items.length === 0 ? (
        <ScreenState
          state={filtered ? 'empty_true' : 'empty_never'}
          title={t(filtered ? 'emptyFilteredTitle' : `empty.${state.tab}`)}
          message={filtered ? t('emptyFilteredBody') : undefined}
          action={
            filtered
              ? {
                  label: t('filters.reset'),
                  onClick: () => patch({ accountIds: new Set(), natures: new Set(), days: null, query: '' }),
                }
              : state.tab === 'all'
                ? { label: t('discoverAction'), to: '/discover' }
                : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--bellum-text-secondary)]">
              <Checkbox
                checked={allVisibleSelected}
                onCheckedChange={checked =>
                  setSelected(checked === true ? new Set(visible.map(item => item.id)) : new Set())
                }
              />
              {t('selectShown', { count: visible.length })}
            </label>
            {selected.size > 0 && (
              <span className="flex items-center gap-2" data-testid="signals-bulk">
                <span className="text-sm text-[var(--bellum-text-secondary)]">
                  {t('selectedCount', { count: selected.size })}
                </span>
                {state.tab === 'trash' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      updateMarks(withTrashed(marks, bulkIds, false))
                      setSelected(new Set())
                    }}
                  >
                    {t('bulk.restore')}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateMarks(withSaved(marks, bulkIds, true))
                        setSelected(new Set())
                      }}
                    >
                      {t('bulk.save')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateMarks(withTrashed(marks, bulkIds, true))
                        setSelected(new Set())
                      }}
                    >
                      {t('bulk.trash')}
                    </Button>
                  </>
                )}
              </span>
            )}
            <span className="ml-auto text-sm text-[var(--bellum-text-secondary)]">
              {t('total', { count: library.items.length })}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(item => (
              <SignalCard
                key={item.id}
                item={item}
                outOfTrade={isOutOfTrade(item, profile)}
                tab={state.tab}
                selected={selected.has(item.id)}
                saved={marks.saved.has(item.id)}
                onSelect={checked => setSelected(current => toggledTo(current, item.id, checked))}
                onSave={() => updateMarks(withSaved(marks, [item.id], !marks.saved.has(item.id)))}
                onTrash={() => updateMarks(withTrashed(marks, [item.id], true))}
                onRestore={() => updateMarks(withTrashed(marks, [item.id], false))}
                onOpen={() => setOpenedId(item.id)}
              />
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 py-2">
            {library.items.length > visible.length && (
              <Button variant="outline" onClick={() => setShown(current => current + LIBRARY_STEP)}>
                <ChevronDown aria-hidden="true" />
                {t('showNext', { count: Math.min(LIBRARY_STEP, library.items.length - visible.length) })}
              </Button>
            )}
            <p className="text-xs text-[var(--bellum-text-muted)]">
              {t('shownOf', { shown: visible.length, total: library.items.length })}
            </p>
          </div>
        </>
      )}

      <FiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        natures={state.natures}
        days={state.days}
        onNatures={natures => patch({ natures })}
        onDays={days => patch({ days })}
      />
      <AddSignalDialog open={addOpen} onOpenChange={setAddOpen} accounts={accountsOf(items)} />
      <SignalBrowserDialog
        entries={visible.map(item => ({ item }))}
        openId={openedId ?? undefined}
        onOpenChange={id => setOpenedId(id ?? null)}
        description={t('detailDescription')}
      />
    </div>
  )
}

function toggledTo(set: ReadonlySet<string>, id: string, on: boolean): Set<string> {
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

function accountsOf(items: readonly WatchlistItem[]): { id: string; name: string }[] {
  return [...new Map(items.map(item => [item.accountId, item.companyName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
