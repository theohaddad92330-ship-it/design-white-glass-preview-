import { useState } from 'react'
import { SelectField, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@bellum/ui'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useTranslation } from 'react-i18next'
import { Download, Search, SlidersHorizontal, X } from 'lucide-react'
import { DISCOVER_SORTS, type DiscoverSort } from '@/features/discover/lib/discover-ranking'
import { ToggleChip } from './filter-controls'
import { HIGH_POTENTIAL_MIN_MEASURED } from '@/features/discover/lib/discover-ranking'
import { SCORE_BLOCKS } from '@/features/discover/lib/discover-score'
import type { HiddenBreakdown } from '@/features/discover/lib/discover-presentation'
import { SIGNAL_NATURES, type DiscoverSignal } from '@/features/discover/lib/discover-types'
import {
  ACCESS_CLASSES,
  BUYER_ROLE_FAMILY_KEYS,
  DISCOVER_FAMILIES,
  type AccessBarrierClass,
  type BuyerRoleFamilyKey,
  type DiscoverFamily,
} from '@bellum/contracts'

/* ------------------------------------------------------------------ */
/*  En-tête de résultats (maquette p.20, élément 15).                   */
/*                                                                     */
/*  « N comptes trouvés · dont X à fort potentiel · Trier par … ·       */
/*  Exporter ». Le sous-total est CLIQUABLE : annoncer « dont 12 à fort */
/*  potentiel » sans donner le moyen de les isoler, c'est un chiffre    */
/*  qu'on ne peut pas suivre. Et la règle qui le produit est écrite en  */
/*  toutes lettres à côté — un palier maison invérifiable ne vaut pas   */
/*  mieux qu'un score inventé.                                         */
/* ------------------------------------------------------------------ */

// #3597.4 — la bascule liste/cartes n'existe plus (décision Louis 04/10/2026) :
// /discover n'a qu'UNE liste, une ligne compacte par compte.

interface ResultsToolbarProps {
  shown: number
  /** #4631.4 — la tranche de la liste RENDUE sur cette page (« 1–12 ») ; absente quand tout tient en une page. */
  pageRange?: { from: number; to: number }
  hidden: number
  /** Répartition de `hidden` PAR MOTIF (§C) : « N masquées » seul ne dit pas
   *  pourquoi. Les deux motifs sont mutuellement exclusifs et déjà CONNUS côté
   *  écran (`hiddenCandidatesBreakdown` dans `discover-presentation.ts`) —
   *  aucun n'est deviné. */
  hiddenBreakdown: HiddenBreakdown
  /** Volume de comptes RÉELLEMENT détectés par la recherche (`coverage.candidatesFound`),
   *  ou `null` si le backend ne le renvoie pas. Sert de compteur d'impact : combien
   *  de comptes correspondent, au-delà des seuls affichés après filtres d'écran. */
  matched: number | null
  highPotential: number
  highPotentialOnly: boolean
  onToggleHighPotential: () => void
  sort: DiscoverSort
  onSortChange: (sort: DiscoverSort) => void
  /** Filtre de FAMILLE (§8.2). « Toutes » par défaut : l'écran ne décide pas à
   *  la place de l'utilisateur ce qu'il a le droit de voir. */
  family: DiscoverFamily | 'any'
  onFamilyChange: (family: DiscoverFamily | 'any') => void
  /** La CLASSE de barrière d'achat (tome 3). Un filtre, pas un second rangement. */
  accessClass: AccessBarrierClass | 'any'
  onAccessClassChange: (accessClass: AccessBarrierClass | 'any') => void
  hideOwned: boolean
  onHideOwnedChange: (value: boolean) => void
  /** #2165.26 — « Déjà travaillé » (client ou déjà analysé), un réglage à
   *  part de `hideOwned` : voir `isWorkedByRep`. */
  hideWorked: boolean
  onHideWorkedChange: (value: boolean) => void
  /** #2165.29 — Familles de rôles (`suggestedRoles`, croisé à l'écran). */
  roleFamily: BuyerRoleFamilyKey | 'any'
  onRoleFamilyChange: (family: BuyerRoleFamilyKey | 'any') => void
  /** #2165.45 — Nature du signal (`legal`/`tech` compris). */
  signalNature: DiscoverSignal['type'] | 'any'
  onSignalNatureChange: (nature: DiscoverSignal['type'] | 'any') => void
  /** #2165.46 — Niveau de preuve : signaux non intermédiés seulement. */
  directSignalsOnly: boolean
  onDirectSignalsOnlyChange: (value: boolean) => void
  dismissedCount: number
  onRestoreDismissed: () => void
  /** #2081.14 — absent quand la règle d'espace réserve l'export aux administrateurs : le bouton est MASQUÉ. */
  onExport?: () => void
  /** Raison du grisage, quand elle n'est pas « rien à exporter » (ex. l'offre
   *  n'inclut pas les exports). Affichée en info-bulle à la place du hint. */
  exportDisabledHint?: string
  /** Grise le bouton SANS le désactiver : l'offre n'inclut pas les exports, et
   *  le clic doit pouvoir ouvrir l'upsell. */
  exportDimmed?: boolean
  canExport: boolean
  /** Refonte Théo — « Filtrer les résultats affichés… » : un filtre d'ÉCRAN sur le nom, jamais une recherche. */
  textFilter?: string
  onTextFilterChange?: (value: string) => void
  /** Refonte Théo — « Cette page » : coche/décoche les comptes de la page affichée. `undefined` = pas de case. */
  pageSelection?: 'all' | 'some' | 'none'
  onTogglePageSelection?: () => void
}

export function ResultsToolbar({
  shown,
  pageRange,
  hidden,
  hiddenBreakdown,
  matched,
  highPotential,
  highPotentialOnly,
  onToggleHighPotential,
  sort,
  onSortChange,
  family,
  onFamilyChange,
  accessClass,
  onAccessClassChange,
  hideOwned,
  onHideOwnedChange,
  hideWorked,
  onHideWorkedChange,
  roleFamily,
  onRoleFamilyChange,
  signalNature,
  onSignalNatureChange,
  directSignalsOnly,
  onDirectSignalsOnlyChange,
  dismissedCount,
  onRestoreDismissed,
  onExport,
  exportDisabledHint,
  exportDimmed = false,
  canExport,
  textFilter,
  onTextFilterChange,
  pageSelection,
  onTogglePageSelection,
}: ResultsToolbarProps) {
  const { t } = useTranslation('discover')
  // Refonte Théo — les filtres pertinents d'abord (tri, fort potentiel, écartés), le reste sous « Plus de filtres ».
  const [moreOpen, setMoreOpen] = useState(false)
  const isMobile = useIsMobile()
  // Lot U — chaque filtre actif se lit en puce retirable sous la barre ; le bouton « Filtres » en porte le nombre.
  const activeFilters: { key: string; label: string; onRemove: () => void }[] = []
  if (family !== 'any')
    activeFilters.push({ key: 'family', label: t(`family.label.${family}`), onRemove: () => onFamilyChange('any') })
  if (accessClass !== 'any')
    activeFilters.push({
      key: 'accessClass',
      label: t(`barrier.class.${accessClass}`),
      onRemove: () => onAccessClassChange('any'),
    })
  if (hideOwned)
    activeFilters.push({ key: 'hideOwned', label: t('filters.hideOwned'), onRemove: () => onHideOwnedChange(false) })
  if (hideWorked)
    activeFilters.push({ key: 'hideWorked', label: t('filters.hideWorked'), onRemove: () => onHideWorkedChange(false) })
  if (roleFamily !== 'any')
    activeFilters.push({
      key: 'roleFamily',
      label: t(`filters.roleFamilies.${roleFamily}`),
      onRemove: () => onRoleFamilyChange('any'),
    })
  if (signalNature !== 'any')
    activeFilters.push({
      key: 'signalNature',
      label: t(`signalTypes.${signalNature}`),
      onRemove: () => onSignalNatureChange('any'),
    })
  if (directSignalsOnly)
    activeFilters.push({
      key: 'directSignalsOnly',
      label: t('filters.directSignalsOnly'),
      onRemove: () => onDirectSignalsOnlyChange(false),
    })
  const moreActive = activeFilters.length

  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {onTextFilterChange && (
          <label className="flex min-h-10 min-w-[14rem] flex-1 items-center gap-2 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 sm:max-w-xs">
            <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden="true" />
            <input
              type="search"
              value={textFilter ?? ''}
              onChange={event => onTextFilterChange(event.target.value)}
              aria-label={t('listControls.filterLabel')}
              placeholder={t('listControls.filterPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-sm text-[var(--bellum-text-primary)] outline-none placeholder:text-[var(--bellum-text-muted)]"
            />
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          {/* #2740 — sans `shrink-0 whitespace-nowrap`, ce libellé se
            compressait (« Trier par » sur 2 lignes à 30 px) au profit du
            `SelectField` voisin. */}
          <span className="shrink-0 whitespace-nowrap">{t('results.sortLabel')}</span>
          <SelectField
            ariaLabel={t('results.sortLabel')}
            value={sort}
            onChange={next => onSortChange(next as DiscoverSort)}
            options={DISCOVER_SORTS.map(option => ({ value: option, label: t(`results.sort.${option}`), wrap: true }))}
            className="min-w-[11rem] max-w-full md:pr-6"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[color:var(--text-primary)]">
            {t('filters.resultsCount', { count: shown })}
          </span>
          {/* #4631.4 — la tranche rendue de cette page ; absente quand tout tient en une page (jamais « 1–5 sur 5 »). */}
          {pageRange ? (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }} data-testid="results-range">
              {t('filters.resultsRange', { from: pageRange.from, to: pageRange.to })}
            </span>
          ) : null}

          {/* Compteur d'impact : le volume détecté fait foi, au-delà des seuls
            affichés (résolution bornée + filtres d'écran). Réel, jamais estimé —
            n'apparaît que quand le backend le renvoie et qu'il dépasse l'affiché. */}
          {matched !== null && matched > shown && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }} title={t('results.matchedVolumeHint')}>
              {/* Lot M (recette 01/11) : liste vide ⇒ « N avant filtres », jamais un « au total » qui contredit la liste. */}
              {shown === 0
                ? t('results.matchedBeforeFilters', { count: matched })
                : t('results.matchedVolume', { count: matched })}
            </span>
          )}

          {hidden > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-ghost)' }}>
              {t('filters.hiddenCount', { count: hidden })}
              {/* Le motif, nommé — modèle `CoverageNotice` : un total ne dit
                jamais pourquoi tout seul. Un motif à zéro ne s'affiche pas :
                « 0 écartées » ne serait pas un motif, ce serait un chiffre en
                trop. Chaque candidat compte sous un motif DIFFÉRENT, jamais
                deux fois le même compte. */}
              {(hiddenBreakdown.excluded > 0 ||
                hiddenBreakdown.owned > 0 ||
                hiddenBreakdown.worked > 0 ||
                hiddenBreakdown.dismissed > 0) &&
                ` (${[
                  // #2614.1 — masquer sans dire combien serait la même faute
                  // que « non mesuré » affiché « 0 » : ce motif est nommé comme
                  // les trois autres, jamais fondu dans « masquées ».
                  hiddenBreakdown.excluded > 0
                    ? t('filters.hiddenReasonExcluded', { count: hiddenBreakdown.excluded })
                    : null,
                  hiddenBreakdown.owned > 0 ? t('filters.hiddenReasonOwned', { count: hiddenBreakdown.owned }) : null,
                  // #2165.26 — un troisième motif, mutuellement exclusif des deux
                  // autres (voir `hiddenCandidatesBreakdown`).
                  hiddenBreakdown.worked > 0
                    ? t('filters.hiddenReasonWorked', { count: hiddenBreakdown.worked })
                    : null,
                  hiddenBreakdown.dismissed > 0
                    ? t('filters.hiddenReasonDismissed', { count: hiddenBreakdown.dismissed })
                    : null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')})`}
            </span>
          )}

          {highPotential > 0 && (
            <ToggleChip active={highPotentialOnly} onClick={onToggleHighPotential}>
              <span
                title={t('results.highPotentialRule', {
                  minMeasured: HIGH_POTENTIAL_MIN_MEASURED,
                  blocks: SCORE_BLOCKS.length,
                })}
              >
                {t('results.highPotential', { count: highPotential })}
              </span>
            </ToggleChip>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] px-3 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t('listControls.filters')}
          {moreActive > 0 && (
            <span className="rounded-full bg-[var(--bellum-surface-2)] px-1.5 font-semibold tabular-nums text-[var(--bellum-text-primary)]">
              {moreActive}
            </span>
          )}
        </button>
        {dismissedCount > 0 && (
          <button
            type="button"
            onClick={onRestoreDismissed}
            title={t('filters.restoreDismissed')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
          >
            {t('filters.restoreDismissed')}
            <span className="rounded-full bg-[var(--bellum-surface-2)] px-1.5 font-semibold tabular-nums text-[var(--bellum-text-primary)]">
              {dismissedCount}
            </span>
          </button>
        )}
        {onExport ? (
          <button
            type="button"
            onClick={onExport}
            disabled={!canExport}
            title={exportDisabledHint ?? t('results.exportHint')}
            className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors hover:bg-[color:var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40 pointer-coarse:min-h-11${
              exportDimmed ? ' opacity-50' : ''
            }`}
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <Download className="h-[12px] w-[12px]" />
            {t('results.export')}
          </button>
        ) : null}
      </div>
      {activeFilters.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2" aria-label={t('listControls.activeFilters')}>
          {activeFilters.map(filter => (
            <li key={filter.key}>
              <button
                type="button"
                onClick={filter.onRemove}
                aria-label={t('listControls.removeFilter', { label: filter.label })}
                className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2.5 text-xs text-[var(--bellum-text-primary)] pointer-coarse:min-h-11"
              >
                {filter.label}
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side={isMobile ? 'bottom' : 'right'}
          closeLabel={t('listControls.close')}
          className={isMobile ? 'max-h-[85dvh] overflow-y-auto' : undefined}
        >
          <SheetHeader className="px-5 pt-5">
            <SheetTitle>{t('listControls.filtersTitle')}</SheetTitle>
            <SheetDescription className="sr-only">{t('listControls.filtersDescription')}</SheetDescription>
          </SheetHeader>
          <div id="discover-more-list-filters" className="flex flex-col items-start gap-4 overflow-y-auto px-5 pb-5">
            {/* Filtre de FAMILLE (§8.2). « Toutes » est le défaut : les comptes hors
            de portée restent visibles tant que l'utilisateur ne demande pas
            l'inverse (D59). */}
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {/* #2740 (suite, 23/09) — même famille que « Trier par » : le
              libellé ne rétrécit pas (27 px pour 39,6 px nécessaires, resté
              hors de la liste corrigée le 23/09). */}
              <span className="shrink-0 whitespace-nowrap">{t('family.filter')}</span>
              <SelectField
                ariaLabel={t('family.filter')}
                value={family}
                onChange={next => onFamilyChange(next as DiscoverFamily | 'any')}
                options={[
                  // « Toutes » porte la valeur `any` et non la chaîne vide : c'est
                  // une valeur du contrat, pas une absence de filtre.
                  { value: 'any', label: t('family.filterAny') },
                  ...DISCOVER_FAMILIES.map(option => ({ value: option, label: t(`family.label.${option}`) })),
                ]}
                className="min-w-0 max-w-full md:pr-6"
              />
            </label>

            {/* Filtre de CLASSE (tome 3, T3-B). La classe n'est pas une cinquième
            famille : c'est l'estimation de la barrière d'achat, sur le même
            écran et à côté de la famille. « Toutes » reste le défaut — un
            compte n'est jamais masqué par le produit lui-même. */}
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {/* #2740 — même famille que « Trier par » : le libellé ne rétrécit pas. */}
              <span className="shrink-0 whitespace-nowrap">{t('barrier.filter')}</span>
              <SelectField
                ariaLabel={t('barrier.filter')}
                value={accessClass}
                onChange={next => onAccessClassChange(next as AccessBarrierClass | 'any')}
                options={[
                  { value: 'any', label: t('barrier.filterAny') },
                  ...ACCESS_CLASSES.map(option => ({ value: option, label: t(`barrier.class.${option}`) })),
                ]}
                className="min-w-0 max-w-full md:pr-6"
              />
            </label>

            <label className="flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={hideOwned} onChange={e => onHideOwnedChange(e.target.checked)} />
              {t('filters.hideOwned')}
            </label>

            {/* #2165.26 — « Déjà travaillé » : client ou déjà analysé, SÉPARÉ de
            « déjà à moi » ci-dessus (qui masque aussi un simple suivi). */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={hideWorked} onChange={e => onHideWorkedChange(e.target.checked)} />
              {t('filters.hideWorked')}
            </label>

            {/* #2165.29 — Familles de rôles : `suggestedRoles` est une SORTIE,
            jamais interrogeable en amont — croisé ici, sur le registre RÉEL
            des onze familles (`BUYER_ROLE_FAMILY_KEYS`), jamais un vocabulaire
            inventé pour ce seul filtre. */}
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {/* #2740 — même famille que « Trier par » : le libellé ne rétrécit pas. */}
              <span className="shrink-0 whitespace-nowrap">{t('filters.roleFamily')}</span>
              <SelectField
                ariaLabel={t('filters.roleFamily')}
                value={roleFamily}
                onChange={next => onRoleFamilyChange(next as BuyerRoleFamilyKey | 'any')}
                options={[
                  { value: 'any', label: t('filters.roleFamilyAny') },
                  ...BUYER_ROLE_FAMILY_KEYS.map(key => ({ value: key, label: t(`filters.roleFamilies.${key}`) })),
                ]}
                className="min-w-0 max-w-full md:pr-6"
              />
            </label>

            {/* #2165.45 — Nature du signal : `legal`/`tech` sont RENDUS mais
            jamais interrogeables à la source — croisé ici sur les signaux
            déjà reçus. */}
            <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              {/* #2740 — même famille que « Trier par » : le libellé ne rétrécit pas. */}
              <span className="shrink-0 whitespace-nowrap">{t('filters.signalNature')}</span>
              <SelectField
                ariaLabel={t('filters.signalNature')}
                value={signalNature}
                onChange={next => onSignalNatureChange(next as DiscoverSignal['type'] | 'any')}
                options={[
                  { value: 'any', label: t('filters.signalNatureAny') },
                  ...SIGNAL_NATURES.map(nature => ({ value: nature, label: t(`signalTypes.${nature}`) })),
                ]}
                className="min-w-0 max-w-full md:pr-6"
              />
            </label>

            {/* #2165.46 — Niveau de preuve : un signal publié par un cabinet POUR
            UN CLIENT ne prouve rien du besoin de l'employeur nommé (tome 2
            §13). Décoché par défaut — rien n'est écarté tant que personne ne
            le demande. */}
            <label className="flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={directSignalsOnly}
                onChange={e => onDirectSignalsOnlyChange(e.target.checked)}
              />
              {t('filters.directSignalsOnly')}
            </label>
            {onTogglePageSelection && pageSelection && (
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-xs text-[var(--bellum-text-secondary)] pointer-coarse:min-h-11">
                <input
                  type="checkbox"
                  checked={pageSelection === 'all'}
                  ref={node => {
                    if (node) node.indeterminate = pageSelection === 'some'
                  }}
                  onChange={onTogglePageSelection}
                />
                {t('listControls.selectPage')}
              </label>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
