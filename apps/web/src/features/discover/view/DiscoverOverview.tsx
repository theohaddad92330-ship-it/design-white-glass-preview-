import { useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns2,
  Compass,
  History,
  Ellipsis,
  Info,
  List,
  Plus,
  Search,
} from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, TYPE_SCALE, cn } from '@bellum/ui'
import { readJson, writeJson } from '@/features/discover/lib/discover-storage'
import type { MarketBreakdown } from '@/features/discover/lib/discover-market-breakdown'

/* ------------------------------------------------------------------ */
/*  Les blocs d'accueil de Découvrir (Théo decouvrir) : l'en-tête, la   */
/*  barre « Quel marché veux-tu explorer ? », les pistes, les           */
/*  indicateurs et la répartition des comptes.                          */
/*                                                                     */
/*  Aucun chiffre n'est écrit ici : chacun vient de la liste que       */
/*  l'écran affiche (`visible`, `needsProjection`, `contactRows`…). Un  */
/*  indicateur non mesuré ne s'affiche pas — jamais « 0 ».              */
/* ------------------------------------------------------------------ */

const CARD = 'rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]'

export function DiscoverHeader({ onOpenHistory, onNewSearch }: { onOpenHistory: () => void; onNewSearch: () => void }) {
  const { t } = useTranslation('discover')
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-muted)]">
          {t('overview.eyebrow')}
        </p>
        {/* #4493 — « Découvrir. » (maquette V22) : le nom de l'écran, son point d'accent ; le `document.title`
            garde sa phrase (`routes:discover.title`). */}
        <h1 className={cn(TYPE_SCALE.pageTitle, 'mt-1 text-[var(--bellum-text-primary)]')}>
          {t('overview.title')}
          <span aria-hidden="true" className="text-[var(--bellum-text-accent)]">
            .
          </span>
        </h1>
        <p className="mt-2 text-sm text-[var(--bellum-text-muted)]">{t('subtitle')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onOpenHistory}>
          <History aria-hidden="true" />
          {t('mySearches.entry')}
        </Button>
        <Button variant="soft" onClick={onNewSearch}>
          <Plus aria-hidden="true" />
          {t('overview.newSearch')}
        </Button>
      </div>
    </header>
  )
}

/**
 * La carte « Quel marché veux-tu explorer ? » (Théo `.d3-search-card`) : le titre, l'étiquette du profil
 * appliqué, puis la barre (champ libre + « Explorer ») et la rangée des puces (`FilterRail`).
 *
 * #4493 (décision Louis 24/10) — le champ libre revient : il REVIENT SUR #3646. Il écrit `filters.freetext` et
 * ne lance rien seul (garde `architecture/decouvrir-saisie-libre-ne-lance-rien-seule.test.ts`).
 */
export function DiscoverSearchCard({ context, children }: { context: React.ReactNode; children: React.ReactNode }) {
  const { t } = useTranslation('discover')
  return (
    <section
      aria-labelledby="discover-explore"
      className={cn(
        CARD,
        'flex flex-col gap-4 bg-[linear-gradient(125deg,color-mix(in_srgb,var(--bellum-primary-500)_8%,transparent),transparent_52%)] p-4 sm:p-5',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="discover-explore"
          className={cn(TYPE_SCALE.sectionTitle, 'flex items-center gap-2 text-[var(--bellum-text-primary)]')}
        >
          <Search className="size-4 text-[var(--bellum-text-accent)]" aria-hidden="true" />
          {t('overview.exploreTitle')}
        </h2>
        {context}
      </div>
      {children}
    </section>
  )
}

export interface DiscoverTrack {
  id: string
  eyebrow: string
  title: string
  hint: string
  /** L'illustration : des initiales tirées du libellé (`monogram`), jamais un logo deviné. */
  art: string
  /** Une piste sans donnée déclarée dit POURQUOI elle ne part pas, et ce qu'il faut renseigner. */
  disabledReason?: string
  onSelect: () => void
}

/**
 * #4493 — TROIS pistes illustrées (un territoire · une expertise · un type de client), tirées de ce que
 * l'espace a DÉCLARÉ (offre, profil, références) : elles remplacent les quatre cartes de pistes d'avant.
 * Les onze pistes rapides restent atteignables par `more` (« Pistes rapides »).
 */
export function DiscoverTracks({ tracks, more }: { tracks: readonly DiscoverTrack[]; more?: React.ReactNode }) {
  const { t } = useTranslation('discover')
  return (
    <div className="flex flex-col gap-1">
      <ul aria-label={t('overview.tracksAria')} className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {tracks.map(track => {
          const disabled = Boolean(track.disabledReason)
          return (
            <li key={track.id}>
              <button
                type="button"
                data-testid={`discover-track-${track.id}`}
                onClick={track.onSelect}
                disabled={disabled}
                className={cn(
                  CARD,
                  'group flex h-full min-h-11 w-full items-center gap-4 p-4 text-left transition-colors disabled:cursor-not-allowed',
                  disabled ? 'opacity-70' : 'hover:border-[var(--bellum-text-muted)]',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-14 shrink-0 place-items-center rounded-xl border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-lg font-bold tracking-tight text-[var(--bellum-text-accent)]"
                >
                  {track.art || <Compass className="size-6" aria-hidden="true" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase tracking-widest text-[var(--bellum-text-muted)]">
                    {track.eyebrow}
                  </span>
                  <span className="break-words text-base font-semibold text-[var(--bellum-text-primary)]">
                    {track.title}
                  </span>
                  <span className="text-sm text-[var(--bellum-text-secondary)]">
                    {track.disabledReason ?? track.hint}
                  </span>
                </span>
                {!disabled && (
                  <ArrowRight
                    className="size-4 shrink-0 text-[var(--bellum-text-muted)] transition-colors group-hover:text-[var(--bellum-text-primary)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {more && <div className="flex justify-end">{more}</div>}
    </div>
  )
}

export interface DiscoverKpi {
  key: string
  label: string
  value: number
  hint?: string | null
  onOpen: () => void
}

export function DiscoverKpis({ items }: { items: readonly DiscoverKpi[] }) {
  const { t, i18n } = useTranslation('discover')
  if (items.length === 0) return null
  return (
    <ul
      aria-label={t('overview.kpisAria')}
      className="grid grid-cols-2 gap-x-4 gap-y-6 border-y border-[var(--bellum-border)] py-5 lg:grid-cols-4"
    >
      {items.map(item => (
        <li key={item.key} className="min-w-0">
          <button type="button" onClick={item.onOpen} className="flex min-h-11 w-full flex-col gap-1 text-left">
            <span className="text-sm text-[var(--bellum-text-secondary)]">{item.label}</span>
            <span className="text-4xl font-bold leading-none tabular-nums text-[var(--bellum-text-primary)]">
              {item.value.toLocaleString(i18n.language)}
            </span>
            {item.hint && (
              <span className="flex items-center gap-1 text-xs text-[var(--bellum-text-muted)]">
                {item.hint}
                <ArrowRight className="size-3" aria-hidden="true" />
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Les teintes des segments : l'accent, du plus dense au plus léger — jamais un code couleur écrit en dur. */
const SEGMENT_TINTS = [100, 78, 60, 46, 34, 24] as const

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

export function DiscoverBreakdown({
  breakdown,
  total,
  storageKey,
}: {
  breakdown: MarketBreakdown
  total: number
  /** Lot U — la clé où l'état déplié/replié est mémorisé (une préférence d'écran, par utilisateur). */
  storageKey?: string
}) {
  const { t, i18n } = useTranslation('discover')
  // Lot U — REPLIÉE par défaut sur une ligne ; l'état se retient comme les autres préférences d'écran.
  const [open, setOpen] = useState(() => (storageKey ? (readJson(storageKey, isBoolean) ?? false) : false))
  if (breakdown.sectors.length === 0 && breakdown.sizes.length === 0) return null
  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls="discover-breakdown-body"
        onClick={() => {
          setOpen(true)
          if (storageKey) writeJson(storageKey, true)
        }}
        className={cn(
          CARD,
          'flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm text-[var(--bellum-text-primary)]',
        )}
      >
        <span className="font-medium">{t('overview.breakdownCollapsed', { count: breakdown.sectors.length })}</span>
        <ChevronDown className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
      </button>
    )
  }
  return (
    <section
      id="discover-breakdown-body"
      aria-labelledby="discover-breakdown"
      className={cn(CARD, 'flex flex-col gap-4 p-4 sm:p-5')}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="discover-breakdown" className={cn(TYPE_SCALE.sectionTitle, 'text-[var(--bellum-text-primary)]')}>
            {t('overview.breakdownTitle')}
          </h2>
          <p className="mt-1 text-xs text-[var(--bellum-text-muted)]">{t('overview.breakdownNote')}</p>
        </div>
        <p className="flex items-center gap-3 text-xs text-[var(--bellum-text-secondary)]">
          {t('overview.breakdownTotal', { accounts: total, sectors: breakdown.sectors.length })}
          <button
            type="button"
            aria-expanded
            aria-controls="discover-breakdown-body"
            onClick={() => {
              setOpen(false)
              if (storageKey) writeJson(storageKey, false)
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-medium text-[var(--bellum-text-primary)]"
          >
            {t('overview.breakdownCollapse')}
            <ChevronDown className="size-4 rotate-180" aria-hidden="true" />
          </button>
        </p>
      </div>
      {breakdown.sectors.length > 0 && (
        <>
          <div
            role="img"
            aria-label={t('overview.breakdownTitle')}
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded"
          >
            {breakdown.sectors.map((share, index) => (
              <span
                key={share.sector ?? 'others'}
                style={{
                  flexGrow: share.count,
                  background: `color-mix(in srgb, var(--bellum-primary-500) ${SEGMENT_TINTS[index] ?? 24}%, var(--bellum-surface-2))`,
                }}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--bellum-text-secondary)]">
            {breakdown.sectors.map((share, index) => (
              <li key={share.sector ?? 'others'} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-sm"
                  style={{
                    background: `color-mix(in srgb, var(--bellum-primary-500) ${SEGMENT_TINTS[index] ?? 24}%, var(--bellum-surface-2))`,
                  }}
                />
                {share.sector ?? t('overview.otherSectors')}
                <strong className="font-semibold tabular-nums text-[var(--bellum-text-primary)]">
                  {share.count.toLocaleString(i18n.language)}
                </strong>
              </li>
            ))}
          </ul>
        </>
      )}
      {breakdown.sizes.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-[var(--bellum-border)] pt-3 text-xs">
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[var(--bellum-text-secondary)]">
            <strong className="font-semibold text-[var(--bellum-text-primary)]">{t('overview.bySize')}</strong>
            {breakdown.sizes.map(size => (
              <span key={size.code}>
                <strong className="font-semibold text-[var(--bellum-text-primary)]">{size.code}</strong>{' '}
                <span className="tabular-nums">{size.count.toLocaleString(i18n.language)}</span>
              </span>
            ))}
          </p>
          <p className="text-[var(--bellum-text-muted)]">{t('overview.sizeDefinition')}</p>
        </div>
      )}
    </section>
  )
}

/**
 * « Ton marché » (Théo decouvrir, `.d3-toolbar`) — le titre de la liste, sa phrase, et ce qu'on fait de
 * TOUTE la liste : enregistrer, exporter, les lectures (contexte marché, comptables, méthode), la vue.
 * #4495 — deux vues des MÊMES comptes (liste, colonnes) ; le radar par technologie est sa propre page.
 */
export type DiscoverListView = 'list' | 'columns'

export function DiscoverMarketToolbar({
  actions,
  menu,
  view = 'list',
  onViewChange,
}: {
  actions: React.ReactNode
  /** Lot U — le contenu du menu ⋯ (items de `DropdownMenu`) : les actions rares et le mode radar. */
  menu?: React.ReactNode
  /** #4495 — la bascule de la maquette : liste (ligne large) · colonnes (cartes empilées). Le radar vit dans le menu ⋯. */
  view?: DiscoverListView
  onViewChange?: (view: DiscoverListView) => void
}) {
  const { t } = useTranslation('discover')
  const viewButton = (value: DiscoverListView, label: string, Icon: typeof List) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-label={label}
      title={label}
      onClick={() => onViewChange?.(value)}
      className="grid size-11 place-items-center rounded-md text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)] aria-pressed:bg-[var(--bellum-surface-2)] aria-pressed:text-[var(--bellum-text-accent)]"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions}
      {menu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('market.moreActions')}
              title={t('market.moreActions')}
              className="grid size-11 place-items-center rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
            >
              <Ellipsis className="size-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
        </DropdownMenu>
      )}
      <div
        role="group"
        aria-label={t('market.viewAria')}
        className="flex items-center rounded-lg border border-[var(--bellum-border)] p-0.5"
      >
        {viewButton('list', t('market.viewList'), List)}
        {viewButton('columns', t('market.viewColumns'), Columns2)}
      </div>
    </div>
  )
}

/** Un bouton de l'en-tête « Ton marché » — même forme pour Enregistrer, Exporter et les lectures. */
export function MarketToolbarButton({
  icon,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: React.ReactNode }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 text-sm font-medium text-[var(--bellum-text-primary)] transition-colors hover:bg-[var(--bellum-surface-2)] aria-pressed:border-[var(--bellum-text-accent)] aria-pressed:text-[var(--bellum-text-accent)] disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11',
        props.className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}

/**
 * L'avis de qualité de la recherche (Théo decouvrir, `.t-quality`) — UN repli d'une ligne au-dessus de
 * la liste, jamais une pile de bandeaux. Il reçoit les avis tels quels (zone élargie, masqués, intermédiaires,
 * couverture, panne…) : chacun se tait quand il n'a rien à dire, et sans aucun avis le repli disparaît (une
 * absence ne fait pas de ligne). Une panne l'ouvre d'office (`open`).
 */
export function DiscoverQualityNotes({ children, open = false }: { children: React.ReactNode; open?: boolean }) {
  const { t } = useTranslation('discover')
  const body = useRef<HTMLDivElement>(null)
  // `null` tant que le repli n'a pas été mesuré : il ne se montre pas avant (jamais « 0 point »).
  const [count, setCount] = useState<number | null>(null)
  useLayoutEffect(() => {
    const node = body.current
    if (!node) return
    const measure = () => setCount(node.childElementCount)
    measure()
    const observer = new MutationObserver(measure)
    observer.observe(node, { childList: true })
    return () => observer.disconnect()
  }, [])
  return (
    <details
      data-testid="discover-quality"
      open={open || undefined}
      hidden={count === null || count === 0}
      className="group rounded-card border border-transparent open:border-[var(--bellum-border)] open:bg-[var(--bellum-surface-1)]"
    >
      {/* Lot U — une icône ⓘ NOMMÉE (GA-32), tabulable ; elle ouvre les mêmes points. */}
      <summary
        aria-label={count === null ? t('quality.iconLabel') : t('quality.summary', { count })}
        title={count === null ? t('quality.iconLabel') : t('quality.summary', { count })}
        className="grid size-11 cursor-pointer list-none place-items-center rounded-md text-[var(--bellum-text-accent)]"
      >
        <Info className="size-4 shrink-0" aria-hidden="true" />
      </summary>
      <div ref={body} className="flex flex-col gap-2 border-t border-[var(--bellum-border)] px-4 py-3 [&:empty]:hidden">
        {children}
      </div>
    </details>
  )
}

/** « 1–12 sur 97 comptes » + les pages (Théo decouvrir, `.d3-pager`). Une seule page : aucune pagination. */
export function DiscoverPager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  canLoadMore,
  onLoadMore,
  loadingMore,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  onPage: (page: number) => void
  /** La recherche peut rendre d'autres comptes au-delà de la dernière page chargée. */
  canLoadMore: boolean
  onLoadMore: () => void
  loadingMore: boolean
}) {
  const { t, i18n } = useTranslation('discover')
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  const pageButton =
    'grid min-h-10 min-w-10 place-items-center rounded-md px-2 text-sm tabular-nums transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11'
  return (
    <nav
      aria-label={t('pager.aria')}
      data-testid="discover-pager"
      className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-[var(--bellum-text-secondary)]"
    >
      <p>
        {t('pager.range', {
          from: from.toLocaleString(i18n.language),
          to: to.toLocaleString(i18n.language),
          count: total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {pageCount > 1 && (
          <>
            <button
              type="button"
              aria-label={t('pager.previous')}
              disabled={page <= 1}
              onClick={() => onPage(page - 1)}
              className={cn(pageButton, 'disabled:opacity-40')}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).map(number => (
              <button
                key={number}
                type="button"
                aria-current={number === page ? 'page' : undefined}
                aria-label={t('pager.page', { page: number })}
                onClick={() => onPage(number)}
                className={cn(
                  pageButton,
                  number === page
                    ? 'border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] font-semibold text-[var(--bellum-text-primary)]'
                    : 'hover:text-[var(--bellum-text-primary)]',
                )}
              >
                {number}
              </button>
            ))}
            <button
              type="button"
              aria-label={t('pager.next')}
              disabled={page >= pageCount}
              onClick={() => onPage(page + 1)}
              className={cn(pageButton, 'disabled:opacity-40')}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
        {canLoadMore && (
          <button
            type="button"
            data-testid="discover-show-more"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="ml-2 min-h-10 rounded-md border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:bg-[var(--bellum-surface-2)] disabled:opacity-60 pointer-coarse:min-h-11"
          >
            {loadingMore ? t('showMore.loading') : t('pager.loadMore')}
          </button>
        )}
      </div>
    </nav>
  )
}
