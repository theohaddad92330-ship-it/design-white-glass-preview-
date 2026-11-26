import { Badge, Box, Button, LAYOUT_TRANSITION } from '@bellum/ui'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { WatchlistRule } from '@bellum/contracts'
import { SignalBrowserDialog } from '@/features/accounts/view/account-detail/tabs/opportunities/SignalBrowserDialog'
import { PAGE_GUTTER_MX, PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ScreenState } from '@/components/primitives/ScreenState'
import { useAccountSignals } from '@/features/accounts/hooks/useAccountSignals'
import { useHiringDomainProfile } from '@/features/discover/hooks/useHiringDomainProfile'
import { HiringDomainNoticeLine } from '@/features/discover/view/HiringDomainNoticeLine'
import { WideningBanner } from '@/features/discover/view/WideningNotice'
import { trackFilterApplied } from '@/lib/product-tracker'
import {
  buildWatchlistItems,
  WATCHLIST_DEFAULT_FILTERS,
  type WatchlistAccountGroup,
  type WatchlistFilterKey,
  type WatchlistItem,
  type WatchlistTypeFacet,
} from '../model/watchlist'
import { buildWatchlistView } from '../model/watchlist-view'
import { useWatchlistRules } from '../rules/useWatchlistRules'
import { WatchlistFacets } from './WatchlistFacets'
import { WatchlistTable } from './WatchlistTable'
import { WatchlistToolbar } from './WatchlistToolbar'

/** #4088.6 — 20 comptes au chargement, puis « Voir tout (N) ». */
const INITIAL_ACCOUNTS = 20

const easeOut = [0.23, 1, 0.32, 1] as const
const layoutTransition = LAYOUT_TRANSITION

/**
 * #2151.60 — LA VEILLE, DÉTACHÉE DE SON ÉCRAN.
 *
 * Tout ce que `/watchlist` PORTE vit ici : la fraîcheur et le périmètre, la
 * porte vers les règles de veille, la recherche, les facettes, les quatre
 * compteurs, le tableau des signaux par compte, et le détail au clic. La page
 * `/watchlist` ne garde que son entête.
 *
 * La raison est la décision de Louis du 16/09/2026 : la Veille doit finir par
 * rediriger vers « Mes cibles », **mais seulement après que son contenu y ait
 * été porté** — une redirection posée sur un portage incomplet détruirait le
 * flux de signaux quotidien. Monter le même composant aux deux endroits est la
 * seule façon d'y arriver sans recopier un tableau qui marche : une dérivation
 * (`countWatchlistFacets`) vit à UN endroit (GA-26), et
 * deux chemins qui la refont divergent — c'est exactement ce qui s'était passé
 * le 17/08 entre la puce « À analyser » à 27 et la carte à 92.
 */
type WatchlistBoardProps = {
  /**
   * #1687 — le MOTIF d'écran, jamais dérivé : d'OÙ part le geste de filtre.
   * L'analytique produit mesure l'ÉCRAN, jamais la personne — un plateau monté
   * ailleurs doit donc nommer l'endroit où le commercial l'a réellement
   * touché, sinon `/watchlist` se retrouve crédité de clics faits sur
   * `/mes-cibles`.
   */
  screen: string
  /**
   * La liste prend-elle la hauteur de la fenêtre et défile-t-elle chez elle ?
   *
   * `true` sur `/watchlist`, où le tableau EST la page. `false` partout où le
   * plateau n'est qu'une section d'un écran qui défile déjà : deux conteneurs
   * défilants imbriqués sont un interdit du dépôt, et sur `/mes-cibles` le
   * second aurait enfermé la liste des cibles sous un tableau haut de 30 lignes.
   */
  ownScroll?: boolean
}

export function WatchlistBoard({ screen, ownScroll = false }: WatchlistBoardProps) {
  const { t, i18n } = useTranslation('watchlist')
  const shouldReduceMotion = useReducedMotion()
  const { data: signals = [], isError, isLoading } = useAccountSignals()
  const { rules } = useWatchlistRules()
  // Les fallbacks du modèle (secteur/source/type) sont résolus via i18n → recalcul au changement de langue.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- i18n.language force le recalcul des fallbacks résolus via i18n.t
  const items = useMemo(() => buildWatchlistItems(signals), [signals, i18n.language])
  // #4088.5 — « À traiter » est le filtre posé à l'arrivée.
  const [active, setActive] = useState<ReadonlySet<WatchlistFilterKey>>(() => new Set(WATCHLIST_DEFAULT_FILTERS))
  // #4088.10 — le TYPE de signal : état local comme les filtres d'intention (qui ne sont pas dans l'URL).
  const [activeTypes, setActiveTypes] = useState<ReadonlySet<WatchlistTypeFacet>>(() => new Set())
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [showAll, setShowAll] = useState(false)
  const [showDiscarded, setShowDiscarded] = useState(false)
  // #4433.9 — « revenir au strict » : la vue exacte, sans palier (le geste du bandeau commun).
  const [strict, setStrict] = useState(false)
  const hiringProfile = useHiringDomainProfile()
  // Un seul chemin pour la vue (GA-26) : #4088.5 filtres, #4088.6 compteurs de lignes affichables,
  // #3901.w profil, #4088.7 écartés, #4088.10 types, #4088.3 lignes sans signal exploitable — et #4433.9 les paliers.
  const view = useMemo(
    () => buildWatchlistView(items, { active, activeTypes, query, rules, profile: hiringProfile, strict }),
    [items, active, activeTypes, query, rules, hiringProfile, strict],
  )
  const { facetCounts, applied, typeCounts, appliedTypes, notice: hiringNotice, groups, discarded, widening } = view
  // Le détail se parcourt sur tout ce qui est listé, écartés compris.
  const browsable = useMemo(() => [...groups, ...discarded], [groups, discarded])
  /**
   * #1797 — LE RANG DANS LA LISTE COURANTE, et pas dans les signaux bruts.
   *
   * Les flèches parcourent ce que le commercial VOIT : `groups` est déjà la
   * liste filtrée et triée, une ligne par compte. Chercher dans `items`
   * ramènerait un compte que le filtre vient d'écarter.
   *
   * `-1` veut dire « l'élément choisi n'est plus dans la liste » — un filtre a
   * bougé, ou le flux s'est rafraîchi. La modale se referme alors d'elle-même
   * plutôt que de montrer un détail hors de la liste.
   */
  // #4182.5 — le signal choisi peut être un SOUS-signal (« +N autres ») : on cherche aussi dans `others`, sinon le clic
  // ne trouvait aucune ligne et rien ne s'ouvrait. Le détail porte alors CE signal, pas celui de tête.
  const selectedIndex = useMemo(
    () =>
      selectedId
        ? browsable.findIndex(
            group => group.latest.id === selectedId || group.others.some(other => other.id === selectedId),
          )
        : -1,
    [browsable, selectedId],
  )
  const selectedItem = useMemo(() => {
    const group = selectedIndex >= 0 ? browsable[selectedIndex] : undefined
    if (!group) return undefined
    return group.latest.id === selectedId
      ? group.latest
      : (group.others.find(other => other.id === selectedId) ?? group.latest)
  }, [browsable, selectedIndex, selectedId])

  const toggleFacet = useCallback(
    (facet: WatchlistFilterKey) => {
      // #1687 — le NOM de la facette, jamais son état (coché/décoché) ni sa valeur.
      trackFilterApplied(screen, facet)
      setActive(current => {
        const next = new Set(current)
        if (next.has(facet)) next.delete(facet)
        else next.add(facet)
        return next
      })
    },
    [screen],
  )

  const toggleType = useCallback(
    (facet: WatchlistTypeFacet) => {
      // #1687 — le NOM de la puce de type, jamais son état.
      trackFilterApplied(screen, `type_${facet}`)
      setActiveTypes(current => {
        const next = new Set(current)
        if (next.has(facet)) next.delete(facet)
        else next.add(facet)
        return next
      })
    },
    [screen],
  )

  /** L'état filtré à vide n'avait aucune sortie : la recherche compte aussi comme un filtre. */
  const clearFilters = useCallback(() => {
    setActive(new Set())
    setActiveTypes(new Set())
    setQuery('')
  }, [])
  // #4088.6 — « Voir tout (N) » : N = tous les comptes listés, jamais un compte de signaux.
  const visibleGroups = showAll ? groups : groups.slice(0, INITIAL_ACCOUNTS)

  return (
    <Box className="flex w-full min-w-0 flex-col space-y-4">
      {/* #4088.1 — plus de bandeau « Veille automatique… » ni « Sources publiques… » :
          la fraîcheur et le périmètre sont de la méthode, pas de la lecture. La porte
          vers les règles d'alerte (#1421) est le bouton-icône de l'en-tête de l'écran. */}

      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transform: 'translate3d(0,8px,0)' }}
        animate={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
        transition={{ duration: 0.22, ease: easeOut }}
      >
        <WatchlistFacets
          active={active}
          counts={facetCounts}
          onToggle={toggleFacet}
          onClear={() => {
            setActive(new Set(WATCHLIST_DEFAULT_FILTERS))
            setActiveTypes(new Set())
          }}
          activeTypes={activeTypes}
          typeCounts={typeCounts}
          onToggleType={toggleType}
          search={<WatchlistToolbar query={query} onQueryChange={setQuery} />}
        />
      </motion.div>

      {/* #1797 — LA LISTE SEULE À L'ARRIVÉE.
          Ici vivait une `motion.aside` montée d'office, qui prenait un quart
          de l'écran pour afficher le détail du PREMIER compte — un détail
          que personne n'avait demandé, et autant de largeur en moins pour la
          liste. Le détail s'ouvre désormais au clic, en modale. */}
      {/* #4088.7 — seule la ligne « profil muet » reste : le nombre d'offres hors domaine,
          lui, est dit par « Écartés (N) » (elles ne sont plus rangées en fin de liste). */}
      {hiringNotice?.kind === 'noRoles' ? (
        <div className={PAGE_GUTTER_X}>
          <HiringDomainNoticeLine notice={hiringNotice} />
        </div>
      ) : null}
      {/* #4433.9 — le MÊME bandeau « élargi » que Découvrir : le palier atteint se dit, jamais une question. */}
      <div className={PAGE_GUTTER_X}>
        <WideningBanner
          criteria={null}
          strict={false}
          onStrictChange={() => {}}
          zone={undefined}
          onZoneRevert={() => {}}
          surface={widening}
          surfaceStrict={strict}
          onSurfaceStrictChange={setStrict}
        />
      </div>
      <motion.div layout transition={{ layout: layoutTransition }} className="min-w-0 flex-1 space-y-4">
        <WatchlistContent
          error={isError}
          loading={isLoading}
          filtered={applied.size > 0 || appliedTypes.size > 0 || query.trim().length > 0}
          groups={visibleGroups}
          totalGroups={groups.length}
          onShowAll={() => setShowAll(true)}
          discarded={discarded}
          showDiscarded={showDiscarded}
          onToggleDiscarded={() => setShowDiscarded(value => !value)}
          rules={rules}
          ownScroll={ownScroll}
          selectedAccountId={selectedItem?.accountId}
          onClearFilters={clearFilters}
          onSelect={item => setSelectedId(item.id)}
        />
      </motion.div>

      {/* Le détail, au clic, avec ses flèches — et les MÊMES gestes qu'avant. */}
      {selectedItem ? (
        <SignalBrowserDialog
          entries={browsable.map((group, index) => ({ item: index === selectedIndex ? selectedItem : group.latest }))}
          openId={selectedItem.id}
          onOpenChange={setSelectedId}
          description={t('detail.dialogDescription')}
          labels={{ previous: t('detail.previousAccount'), next: t('detail.nextAccount') }}
          trailing={item => (
            <Badge variant={item.status === 'new' ? 'success' : 'outline'}>
              {item.status === 'new' ? t('status.new') : t('status.toQualify')}
            </Badge>
          )}
        />
      ) : null}
    </Box>
  )
}

function WatchlistContent({
  discarded,
  error,
  filtered,
  groups,
  loading,
  onClearFilters,
  onSelect,
  onShowAll,
  onToggleDiscarded,
  ownScroll,
  rules,
  selectedAccountId,
  showDiscarded,
  totalGroups,
}: {
  discarded: WatchlistAccountGroup[]
  error: boolean
  filtered: boolean
  groups: WatchlistAccountGroup[]
  loading: boolean
  onClearFilters: () => void
  onSelect: (item: WatchlistItem) => void
  onShowAll: () => void
  onToggleDiscarded: () => void
  ownScroll: boolean
  rules: WatchlistRule[]
  selectedAccountId?: string
  showDiscarded: boolean
  totalGroups: number
}) {
  const { t } = useTranslation('watchlist')
  // `loading` garde son squelette : il DIT l'état mieux qu'une phrase, en
  // montrant la forme de ce qui arrive. Les trois autres passent par
  // `<ScreenState>`, qui les NOMME (PDF 1 §2).
  if (loading) return <WatchlistTableSkeleton />
  if (error) {
    // Volontairement SANS destination : un échec de chargement n'en a pas, et
    // « réessaie » n'est pas un endroit où aller.
    return <ScreenState state="error" title={t('emptyState.errorTitle')} message={t('emptyState.errorDescription')} />
  }
  if (groups.length === 0 && discarded.length === 0 && filtered) {
    return (
      <ScreenState
        state="empty_true"
        title={t('emptyState.filteredTitle')}
        message={t('emptyState.filteredDescription')}
        action={{ label: t('emptyState.clearFilters'), onClick: onClearFilters }}
      />
    )
  }
  if (groups.length === 0 && discarded.length === 0) {
    /**
     * Vide POUR DE BON — aucun signal, aucun filtre.
     *
     * Les signaux ne s'inventent pas, ils naissent des comptes analysés — le
     * chemin qui alimente la Veille commence à Découvrir. Le geste est un
     * `<Link>` (via `<ScreenState>`) et non un `onClick` de navigation : ça se
     * tabule, ça s'ouvre dans un onglet, ça s'annonce (GA-35).
     */
    return (
      <ScreenState
        state="empty_never"
        title={t('emptyState.noAccountsTitle')}
        message={t('emptyState.noAccountsDescription')}
        action={{ label: t('emptyState.discoverAction'), to: '/discover' }}
      />
    )
  }
  return (
    <div className={`${PAGE_GUTTER_MX} ${ownScroll ? 'max-h-[calc(100dvh-16rem)] overflow-y-auto' : ''}`}>
      {groups.length > 0 ? (
        <WatchlistTable groups={groups} rules={rules} selectedAccountId={selectedAccountId} onSelect={onSelect} />
      ) : null}
      {/* #4088.6 — 20 comptes au chargement + « Voir tout (N) ». */}
      {totalGroups > groups.length ? (
        <div className="flex justify-center py-3">
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onShowAll}>
            {t('list.showAll', { count: totalGroups })}
          </Button>
        </div>
      ) : null}
      {/* #4088.7 — « Écartés (N) » : en bas, replié, jamais supprimé. Rien tant qu'il n'y en a aucun. */}
      {discarded.length > 0 ? (
        <section className="mt-4" aria-label={t('discard.heading', { count: discarded.length })}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={showDiscarded}
            onClick={onToggleDiscarded}
            className="min-h-11 gap-1 text-sm text-[var(--bellum-text-secondary)]"
          >
            <ChevronDown className={`size-4 transition-transform ${showDiscarded ? '' : '-rotate-90'}`} aria-hidden />
            {t('discard.heading', { count: discarded.length })}
          </Button>
          {showDiscarded ? (
            <WatchlistTable
              groups={discarded}
              rules={rules}
              selectedAccountId={selectedAccountId}
              onSelect={onSelect}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function WatchlistTableSkeleton() {
  return (
    <div className={`${PAGE_GUTTER_MX} space-y-1`}>
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="h-[76px] animate-pulse rounded-lg bg-[var(--bellum-surface-2)] motion-reduce:animate-none"
        />
      ))}
    </div>
  )
}
