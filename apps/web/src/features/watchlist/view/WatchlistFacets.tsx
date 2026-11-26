import { FilterChips } from '@bellum/ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Filter, X } from 'lucide-react'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import {
  WATCHLIST_FILTERS,
  WATCHLIST_TYPE_FACETS,
  type WatchlistFilterKey,
  type WatchlistTypeFacet,
} from '../model/watchlist'

/* ------------------------------------------------------------------ */
/*  Filtres de la Veille — trois, pas cinq (#4088.5).                  */
/*                                                                     */
/*  « À traiter » (le défaut) · « Mes comptes prioritaires » · « Selon */
/*  mes règles ». Combinables, et un filtre dont le compte vaut 0 ne   */
/*  s'affiche PAS : on n'affiche pas ce qu'on n'a pas. Le compte        */
/*  annoncé sur chaque puce est un nombre de COMPTES (une ligne = un    */
/*  compte). Plus de « N signaux affichés sur N » (#4088.6).            */
/* ------------------------------------------------------------------ */

const FACET_LABEL: Record<WatchlistFilterKey, string> = {
  todo: 'filters.todo',
  priority: 'filters.priority',
  rules: 'filters.rules',
}

interface WatchlistFacetsProps {
  active: ReadonlySet<WatchlistFilterKey>
  counts: Record<WatchlistFilterKey, number>
  onToggle: (facet: WatchlistFilterKey) => void
  onClear: () => void
  /** #4088.10 — les puces de TYPE de signal (OU entre elles, ET avec l'intention). */
  activeTypes: ReadonlySet<WatchlistTypeFacet>
  typeCounts: Record<WatchlistTypeFacet, number>
  onToggleType: (facet: WatchlistTypeFacet) => void
  /** La recherche de compte, posée sur la MÊME ligne que les filtres (maquette validée). */
  search?: ReactNode
}

export function WatchlistFacets({
  active,
  counts,
  onToggle,
  onClear,
  activeTypes,
  typeCounts,
  onToggleType,
  search,
}: WatchlistFacetsProps) {
  const { t } = useTranslation('watchlist')
  const [moreOpen, setMoreOpen] = useState(false)
  const facets = WATCHLIST_FILTERS.filter(facet => counts[facet] > 0)
  const types = WATCHLIST_TYPE_FACETS.filter(facet => typeCounts[facet] > 0)
  const shownActive = facets.filter(facet => active.has(facet))
  const shownTypes = types.filter(facet => activeTypes.has(facet))
  // Un filtre de rang posé reste VISIBLE même replié : un filtre actif qu'on ne voit pas ment sur la liste.
  const statusesShown = moreOpen ? facets : shownActive

  return (
    <div className={`flex flex-wrap items-center gap-2 ${PAGE_GUTTER_X}`} data-testid="watchlist-filters">
      {/* Refonte Théo (maquette validée) — le TYPE de fait d'abord, en segments comptés : c'est la
          question qu'on se pose en arrivant (« qu'est-ce qui bouge : des recrutements ? des projets ? »).
          Multi-sélection, et une famille vide ne fait aucune puce. */}
      {types.length > 0 ? (
        <FilterChips
          ariaLabel={t('filters.typesAria')}
          multiple
          className="max-w-full flex-nowrap overflow-x-auto md:flex-wrap md:overflow-visible"
          options={types.map(facet => ({
            value: facet,
            label: t(`filters.types.${facet}`),
            count: typeCounts[facet],
          }))}
          values={shownTypes}
          onToggle={onToggleType}
        />
      ) : null}

      {search}

      {/* #4088.5 — les filtres de rang (« À traiter », le défaut · « Mes comptes prioritaires » ·
          « Selon mes règles ») passent sous « Plus de filtres » : repliés, jamais supprimés. */}
      {facets.length > 0 ? (
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(open => !open)}
          className="flex min-h-11 items-center gap-1 rounded-control border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
        >
          <Filter className="size-3.5 shrink-0" aria-hidden />
          {t('filters.more')}
          <ChevronDown className={`size-3 transition-transform ${moreOpen ? '' : '-rotate-90'}`} aria-hidden />
        </button>
      ) : null}
      {/*
        ⚠️ La couleur du filtre ACTIF est celle du composant `FilterChips` : jamais une décision d'écran
        (l'ancien `#C4B5FD` en ligne tombait à 1,35:1 en clair). Le mode `multiple` reste indispensable —
        la Veille COMBINE ses filtres.
      */}
      {statusesShown.length > 0 ? (
        <FilterChips
          ariaLabel={t('filters.groupAria')}
          multiple
          options={statusesShown.map(facet => ({
            value: facet,
            label: t(FACET_LABEL[facet]),
            count: counts[facet],
          }))}
          values={shownActive}
          onToggle={onToggle}
        />
      ) : null}

      {/* #4088.10 — le bouton ramène à l'état par défaut : il n'a rien à faire quand on y est déjà. */}
      {shownTypes.length > 0 ||
      shownActive.some(facet => facet !== 'todo') ||
      (shownActive.length === 0 && facets.includes('todo')) ? (
        <button
          type="button"
          onClick={onClear}
          className="flex min-h-11 items-center gap-1 rounded-badge px-2 py-1 text-xs text-[var(--bellum-text-muted)] transition-colors hover:text-[var(--bellum-text-primary)]"
        >
          <X className="size-3" aria-hidden />
          {t('filters.clear')}
        </button>
      ) : null}
    </div>
  )
}
