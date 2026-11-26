import { type ActiveFilter } from '@bellum/ui'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, ScanSearch } from 'lucide-react'
import { TargetListsSection } from '@/features/target-lists/view/TargetListsSection'
import { useCallback, useMemo, useState } from 'react'
import type { AccountListQuery, AnalysisStatus } from '@bellum/contracts'
import { SprintBoard } from '@/features/sprints/view/SprintBoard'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useTranslation } from 'react-i18next'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useTrackSearchPerformed } from '@/lib/useTrackSearchPerformed'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useAccounts } from '@/features/accounts/hooks/useAccounts'
import { useAccountsCache, useInfiniteScrollRef } from '@/features/accounts/hooks/useAccountsInfiniteScroll'
import { listNarrowing } from '@/features/accounts/lib/listNarrowing'
import {
  portfolioFiltersFromSearch,
  readFilterList,
  writeFilterList,
  searchForPortfolioFilters,
  type PortfolioFilterValues,
} from '@/features/accounts/lib/portfolioFilters'
import { favoriteFilterOf, mineFilterOf, ownerSearch, ownershipFilterOf } from './accounts-list/accountFavoriteFilters'
import { AccountsExportButton } from './accounts-list/AccountsExportButton'
import { AccountsLayoutToggle, AccountsOwnerSelect, AccountsSortSelect } from './accounts-list/AccountsToolbarControls'
import { crmChipSearch, crmFilterOf, importedChipSearch, importedFilterOf } from './accounts-list/AccountsCrmChip'
import { AccountsCrmFusionBanner } from './accounts-list/AccountsCrmFusionBanner'
import { AccountsListHead } from './accounts-list/AccountsListHead'
import { crmNameOf } from '@/features/crm/lib/crmName'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { portfolioTabOf, searchForPortfolioTab } from './accounts-list/AccountsPortfolioTabs'
import { AccountsResumeShelf, accountsToResume } from './accounts-list/AccountsResumeShelf'
import { FollowedAccountsSection } from '@/features/account-follows/view/FollowedAccountsSection'
import { ImportPortfolioButton } from '@/features/universal-import/view/ImportPortfolioButton'
import { Button } from '@bellum/ui'
import { useDebounce } from '@/hooks/useDebounce'
import { AccountContent } from './AccountContent'
import { AccountsKeyFigures, activeKeyFigureOf, type AccountsKeyFigureId } from './AccountsKeyFigures'
import { AccountsTotal } from './AccountsTotal'
import { AccountsVerdictSummary } from './accounts-list/AccountsVerdictSummary'
import type { AccountRow, SortKey } from './accounts-list/types'

// `gate` = la porte de PRIORITÉ (G1), axe distinct du `status` d'analyse et du
// cycle commercial. Ajouté en filtre et non en onglet : le portefeuille reste
// unique, et un filtre se COMBINE — « écarté ET secteur banque » est une
// question qu'un commercial se pose, et qu'un onglet ne sait pas poser.
// #2159.26 — `tag` : l'étiquette, posée par l'import ou par la puce d'une fiche.
const FILTER_BAR_KEYS = ['status', 'sector', 'score', 'gate', 'entityKind', 'tag'] as const
const PAGE_SIZE = 25

/**
 * Réécrit dans l'URL les SEULES clés que la barre de filtres possède.
 *
 * Une clé absente de `map` est effacée — c'est ce qui fait que « tout relâcher »
 * n'est rien d'autre qu'un `map` vide. La boucle vit ici et pas dans les deux
 * gestes qui l'utilisent : deux copies divergeraient le jour où un axe s'ajoute
 * à `FILTER_BAR_KEYS`, et la copie oubliée laisserait un filtre derrière elle.
 */
function writeFilterBarKeys(
  prev: Record<string, unknown>,
  map: Record<string, string[] | undefined>,
): Record<string, unknown> {
  const updated = { ...prev }
  for (const key of FILTER_BAR_KEYS) {
    // `status=all` n'est pas un filtre : c'est son absence, et l'écrire dans l'URL la salirait sans rien
    // restreindre (`readFilterList` l'écarte). #4498.a — un axe porte une liste : scalaire s'il n'y a qu'un choix.
    updated[key] = writeFilterList(readFilterList(map[key]))
  }
  return updated
}

export function AccountsPage({ from = '/accounts/' }: { from?: '/accounts/' } = {}) {
  const search = useSearch({ from })
  const navigate = useNavigate({ from })

  const query = search.q ?? ''
  const sortKey: SortKey = search.sort ?? 'date_desc'
  const statusFilter = search.status ?? 'all'
  const lifecycleFilter = search.lifecycle ?? 'all'
  const sectorFilter = search.sector
  const tagFilter = search.tag
  const scoreFilter = search.score as AccountListQuery['score']
  const gateFilter = search.gate as AccountListQuery['gate']
  /**
   * LE TYPE D'ENTITÉ (31/08/2026) — « montre-moi les comptes qui ont une
   * filiale », « ceux organisés en business units ».
   *
   * Le filtre porte sur les ENTITÉS du compte et non sur le compte lui-même :
   * un compte n'a pas de type, il a des subdivisions qui en ont un. Le serveur
   * retient donc un compte dès qu'UNE de ses entités porte le type demandé.
   */
  const entityKindFilter = search.entityKind as AccountListQuery['entityKind']
  /**
   * #1580 — LE BANDEAU DE TÊTE DEVIENT UN FILTRE, dans l'URL comme les autres.
   *
   * Une des trois métriques DÉCISIONNELLES du bandeau (`AccountsCountersBand`).
   * `undefined` = aucune posée. Jamais `followed` : cliquer ce chiffre-là ne
   * filtre pas, il ramène au portefeuille complet (voir `handleHeadlineChange`).
   */
  const headlineFilter = search.headline as AccountListQuery['headline'] | undefined
  /**
   * #1575.1 — L'AXE « avec des parcours observés », dans l'URL comme les autres.
   *
   * `'covered'` restreint, absent ≡ pas de filtre. Il est SÉPARÉ de `headline`
   * parce qu'il ne partage ni sa source (la mémoire marché, pas la requête qui
   * liste) ni son mécanisme (une liste d'identifiants arbitrée en TypeScript,
   * pas un prédicat SQL) — voir `accountListQuerySchema.marketCovered`.
   */
  const marketCoveredFilter = search.marketCovered === 'covered' ? ('covered' as const) : undefined
  /** #2150.13 — la vue « À actualiser », filtrée par le SERVEUR. */
  const freshnessFilter = search.freshness === 'stale' ? ('stale' as const) : undefined
  /**
   * #2150.14/.18 — « MES FAVORIS », RÉTABLI (revirement assumé de #1800,
   * Louis 15/09/2026). Même nature que `freshnessFilter` juste au-dessus :
   * une bascule dédiée, filtrée côté SERVEUR. Dérivation testée directement
   * dans `accountFavoriteFilters.test.ts` (un rechargement de page ne fait
   * rien d'autre que rappeler `favoriteFilterOf` sur l'URL fraîchement lue).
   */
  const favoriteFilter = favoriteFilterOf(search)
  // #4526.3 — la puce « Mon CRM », lue dans l'URL.
  const crmFilter = crmFilterOf(search)
  // #4597.1 — la puce « Importés » ; #4597.3 — la liste ouverte sur UN import (lien « voir les N comptes »).
  const importedFilter = importedFilterOf(search)
  const importJobFilter = search.importJob
  // #4526.6 — le nom du CRM branché du CLIENT, quand l'espace en a un.
  const crmName = crmNameOf(useCrmStatus().data)
  /**
   * #2150.15 — « PORTÉS PAR UN COLLÈGUE ». S'exclut mutuellement de
   * `favoriteFilter` à l'écran (voir `handleFavoriteChange` /
   * `handleOwnershipChange`) — jamais les deux axes posés à la fois, même si
   * `buildQueryString` les enverrait tous les deux sans se plaindre.
   */
  const ownershipFilter = ownershipFilterOf(search)
  // #4158.25 — « Mes comptes » : même axe `ownership`, valeur `'mine'`.
  const mineFilter = mineFilterOf(search)
  const [debouncedQuery] = useDebounce(query, 250)

  const {
    data: infiniteData,
    isLoading: loading,
    // `isError` était lu par personne : une liste en échec s'affichait comme une
    // liste VIDE, sous le message « Ton portefeuille est vide. Analyse un
    // premier compte » — une panne qui se lit comme un fait (PDF 2 §3.5).
    isError: failed,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useAccounts({
    q: debouncedQuery.trim() || undefined,
    status: statusFilter as AnalysisStatus | 'all',
    lifecycle: lifecycleFilter as AccountListQuery['lifecycle'],
    sort: sortKey,
    sector: sectorFilter,
    tag: tagFilter,
    score: scoreFilter,
    gate: gateFilter,
    entityKind: entityKindFilter,
    headline: headlineFilter,
    marketCovered: marketCoveredFilter,
    freshness: freshnessFilter,
    favorite: favoriteFilter,
    crm: crmFilter, // #4526.3
    imported: importedFilter, // #4597.1
    importJob: importJobFilter, // #4597.3
    ownership: ownershipFilter ?? mineFilter,
    limit: PAGE_SIZE,
  } satisfies AccountListQuery)

  // Onglets (Théo p.39) : « Écartés » reste câblé sur le status d'analyse
  // 'archived' (mécanique du bouton Archiver), les autres sur le tri commercial.
  const activeTab =
    statusFilter === 'archived'
      ? 'archived'
      : lifecycleFilter === 'watching'
        ? 'watching'
        : lifecycleFilter === 'opportunity'
          ? 'opportunity'
          : 'all'

  const handleTabChange = useCallback(
    (tab: string) => {
      void navigate({
        search: prev => {
          const next = { ...prev } as Record<string, unknown>
          next.lifecycle = tab === 'watching' || tab === 'opportunity' ? tab : undefined
          next.status = tab === 'archived' ? 'archived' : prev.status === 'archived' ? undefined : prev.status
          next.page = undefined
          return next
        },
      })
    },
    [navigate],
  )

  // Refonte Théo — les quatre onglets du portefeuille, lus dans l'URL (partageable).
  const portfolioTab = portfolioTabOf(search)
  const handlePortfolioTabChange = useCallback(
    (tab: Parameters<typeof searchForPortfolioTab>[1]) => {
      void navigate({ search: prev => searchForPortfolioTab(prev, tab) })
    },
    [navigate],
  )

  const handleCrmToggle = useCallback(() => {
    void navigate({ search: prev => crmChipSearch(prev, crmFilterOf(prev) !== 'only') })
  }, [navigate])

  const handleImportedToggle = useCallback(() => {
    void navigate({ search: prev => importedChipSearch(prev, importedFilterOf(prev) !== 'only') })
  }, [navigate])

  const handleClearImportJob = useCallback(() => {
    void navigate({ search: prev => ({ ...prev, importJob: undefined, page: undefined }) })
  }, [navigate])

  const accounts: AccountRow[] = useAccountsCache(infiniteData)
  // #4526.3 — les comptes du CRM lus par la liste (déjà filtrée `crm=only`), pour l'intersection avec les suivis.
  const crmAccountIds = useMemo(
    () => (crmFilter === 'only' ? new Set(accounts.map(account => account.id)) : undefined),
    [crmFilter, accounts],
  )
  // Les compteurs de tête (PDF-04 §1.3) viennent de la 1ʳᵉ page — le serveur ne
  // les calcule que là, puisqu'un total ne dépend pas de l'offset. `undefined`
  // pendant le chargement, donc l'écran ne montre rien plutôt qu'un « 0 » qui
  // serait faux : le même arbitrage que le funnel de `/contacts`.
  const counters = infiniteData?.pages[0]?.counters
  // #2154.30 — `search_performed` sur `/accounts` : le total SERVEUR de la 1ʳᵉ page, `undefined` tant qu'inconnu.
  useTrackSearchPerformed('/accounts', debouncedQuery, infiniteData?.pages[0]?.pagination.totalItems, loading)

  const handleQueryChange = useCallback(
    (next: string) => {
      const trimmed = next.trim()
      void navigate({
        search: prev => ({ ...prev, q: trimmed.length > 0 ? next : undefined, page: undefined }),
        replace: true,
      })
    },
    [navigate],
  )

  const handleSortKeyChange = useCallback(
    (next: SortKey) => {
      void navigate({
        search: prev => ({ ...prev, sort: next === 'date_desc' ? undefined : next }),
      })
    },
    [navigate],
  )

  const activeFilters: ActiveFilter[] = []
  // #4498.a — une pastille PAR valeur cochée (le retrait d'une pastille retire cette seule valeur). « Tous »
  // n'est PAS un filtre : c'est son absence, `readFilterList` l'écarte.
  for (const [id, raw] of [
    ['status', statusFilter],
    ['sector', sectorFilter],
    ['tag', tagFilter],
    ['score', scoreFilter],
    ['gate', gateFilter],
    ['entityKind', entityKindFilter],
  ] as const) {
    for (const value of readFilterList(raw)) activeFilters.push({ id, value })
  }

  const handleFiltersChange = useCallback(
    (next: ActiveFilter[]) => {
      const map: Record<string, string[] | undefined> = {}
      for (const { id, value } of next) map[id] = [...(map[id] ?? []), value]
      void navigate({ search: prev => writeFilterBarKeys(prev, map) })
    },
    [navigate],
  )

  /**
   * #4498 — « APPLIQUER LES FILTRES » de la modale « Filtrer mon portefeuille » : chaque axe serveur dans
   * l'URL, partageable, comme avant (`searchForPortfolioFilters`). Le type de compte et l'accessibilité, jugés
   * sur les lignes chargées, sont posés par `AccountContent` dans la même passe.
   */
  const portfolioFilters = portfolioFiltersFromSearch(search)
  const handleApplyPortfolioFilters = useCallback(
    (next: PortfolioFilterValues, options: { reset: boolean }) => {
      void navigate({ search: prev => searchForPortfolioFilters(prev, next, options) })
    },
    [navigate],
  )

  /**
   * RELÂCHER — y compris ce que l'écran ne montre pas.
   *
   * `handleFiltersChange([])` ne touche que `FILTER_BAR_KEYS` : le rangement du
   * cycle commercial y survivait, si bien que « Réinitialiser les filtres »
   * laissait l'utilisateur exactement là où il était. Or c'est le seul axe
   * qu'aucune pastille ni aucun onglet ne permet de retirer — l'oublier ici,
   * c'était un écran sans sortie.
   *
   * La recherche, elle, n'est PAS effacée : son champ est visible dans la barre
   * d'outils, avec le texte dedans. Effacer ce que l'utilisateur voit et
   * contrôle serait le surprendre.
   */
  const handleClearFilters = useCallback(() => {
    void navigate({
      // #1580 — `headline` est UN AXE DE PLUS que « relâcher tout » doit
      // reprendre, comme `lifecycle` juste à côté : sans lui, « Réinitialiser
      // les filtres » laisserait le portefeuille filtré par le bandeau.
      // #1575.1 — `marketCovered` est, comme `headline`, une restriction sans
      // pastille dans la barre de filtres : sans lui ici, « Réinitialiser les
      // filtres » laisserait le portefeuille filtré par le bandeau.
      search: prev => ({
        ...writeFilterBarKeys(prev, {}),
        lifecycle: undefined,
        headline: undefined,
        marketCovered: undefined,
        // #2150.13 — un axe de vue de plus, sans pastille : relâché avec les autres.
        freshness: undefined,
        // #2150.14/.18 / #2150.15 — les deux bascules, même raison.
        favorite: undefined,
        ownership: undefined,
        // #4643 — les puces de source restreignent la liste : « relâcher tout » les relâche aussi.
        crm: undefined,
        imported: undefined,
        importJob: undefined,
        page: undefined,
      }),
    })
  }, [navigate])
  /**
   * Refonte Théo — LE RESPONSABLE, un sélecteur de la barre (Toute l'équipe · Mes comptes · Portés par un
   * collègue). Il n'écrit QUE l'axe `ownership` (#2150.15 / #4158.25) : les Favoris sont devenus un ONGLET
   * (`favorite=mine`), et un critère ne vit qu'à un endroit — l'ex-bascule « Mes favoris » de la barre
   * doublait cet onglet, elle est repliée dedans.
   */
  const ownerValue = ownershipFilter === 'teammate' ? 'teammate' : mineFilter === 'mine' ? 'mine' : 'all'
  const handleOwnerChange = useCallback(
    (next: 'all' | 'mine' | 'teammate') => {
      void navigate({ search: prev => ({ ...prev, ...ownerSearch(next), page: undefined }) })
    },
    [navigate],
  )
  /** Refonte Théo — Tableau ou Cartes, dans l'URL (`layout=cards`) : un lien partagé ouvre la même forme. */
  const cardsLayout = search.layout === 'cards'
  const handleLayoutChange = useCallback(
    (cards: boolean) => {
      void navigate({ search: prev => ({ ...prev, layout: cards ? 'cards' : undefined }) })
    },
    [navigate],
  )
  /**
   * Refonte Théo — un CHIFFRE de la bande de tête pose la vue qu'il compte : le portefeuille entier,
   * « À reprendre » et « Relations actives » (filtre serveur `headline`, sur le prédicat qui les compte),
   * ou l'onglet Favoris.
   */
  const activeKeyFigure = activeKeyFigureOf(search)
  const handleKeyFigureSelect = useCallback(
    (id: AccountsKeyFigureId) => {
      void navigate({
        search: prev => {
          const base = searchForPortfolioTab(prev, id === 'favorites' ? 'favorites' : 'all')
          return { ...base, headline: id === 'toResume' || id === 'activeRelations' ? id : undefined }
        },
      })
    },
    [navigate],
  )
  /**
   * LA LENTILLE (26/08/2026) — dans l'URL, donc partageable et bookmarkable.
   *
   * « Regarde les comptes qu'on ne peut pas facturer » s'envoie alors en un
   * lien, ce qu'un état local n'aurait jamais permis. Absente = l'angle
   * commercial : le défaut est celui de toujours, et poser la lentille est un
   * geste EXPLICITE — personne ne doit retrouver son portefeuille changé sans
   * l'avoir demandé.
   */
  const deliveryLens = search.lens === 'delivery'
  /**
   * #1318 — l'allocation d'effort est une VUE de Comptes, pas une page.
   *
   * Elle remplace la liste plutôt que de s'y ajouter : ce sont les mêmes
   * comptes regardés autrement, et deux listes empilées demanderaient laquelle
   * fait foi. L'entête et l'accès au copilote restent au-dessus — ils parlent
   * du portefeuille, pas de la forme sous laquelle on le regarde.
   */
  const effortLens = search.lens === 'effort'
  // #4088.8 — « Listes » : les listes de cibles ont quitté `/mes-cibles` et vivent
  // ici, comme une lentille (même motif que `effort` : elle remplace la liste).
  const listsLens = search.lens === 'lists'
  // Refonte Théo — l'onglet « Suivis » : la liste de suivi explicite (3 au plus), à la place du tableau.
  const followedLens = search.lens === 'followed'
  const handleDeliveryLensChange = useCallback(
    (next: boolean) => {
      // `undefined` et non `'commercial'` : l'angle par défaut est l'ABSENCE de
      // lentille, et l'écrire dans l'URL la salirait sans rien changer — même
      // règle que `status=all` juste au-dessus.
      void navigate({ search: prev => ({ ...prev, lens: next ? 'delivery' : undefined }) })
    },
    [navigate],
  )

  const handleLoadMoreRef = useInfiniteScrollRef({
    hasNextPage: Boolean(hasNextPage),
    isFetchingNextPage,
    fetchNextPage,
  })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [compareOpen, setCompareOpen] = useState(false)

  /**
   * CE QUI RESTREINT LA LISTE — dérivé UNE fois, ici.
   *
   * ⚠️ `search.lifecycle` et non `lifecycleFilter` : ce dernier vaut `'all'`
   * par défaut, ce qui est déjà une réponse. La dérivation doit voir l'URL
   * telle qu'elle est.
   */
  const narrowing = listNarrowing({
    query,
    filterCount: activeFilters.length,
    // Plusieurs relations cochées : la première nomme la restriction, `lifecycle` ne porte qu'un mot.
    lifecycle: readFilterList(search.lifecycle)[0],
    // #1580 — le clic sur une métrique décisionnelle du bandeau de tête est
    // le MÊME genre de restriction invisible que `lifecycle` : ni pastille de
    // la barre de filtres, ni onglet.
    headline: search.headline,
    // #1575.1 — même nature que `headline` : une restriction posée par un clic
    // sur le bandeau, invisible dans la barre de filtres.
    marketCovered: search.marketCovered,
    freshness: search.freshness,
    // #2150.14/.18 / #2150.15 — même nature que `freshness` : posées par un
    // clic dédié, sans pastille dans la barre de filtres ni onglet.
    favorite: search.favorite,
    ownership: search.ownership,
    crm: search.crm,
    imported: search.imported,
    importJob: search.importJob,
  })

  // #4643 — la bande compte le portefeuille vivant : tout autre rétrécissement que ses propres vues (`headline`,
  // `favorite`, qu'elle allume elle-même) la rend muette sur ce qu'elle ne sait pas de la liste rendue.
  const bandScoped = listNarrowing({
    query,
    filterCount: activeFilters.length,
    lifecycle: readFilterList(search.lifecycle)[0],
    marketCovered: search.marketCovered,
    freshness: search.freshness,
    ownership: search.ownership,
    crm: search.crm,
    imported: search.imported,
    importJob: search.importJob,
  }).active

  const { t } = useTranslation('accounts')

  return (
    <CustomerPage
      anchorId="comptes"
      // Coque Théo — le titre, sa phrase et les deux gestes (Importer, Analyser un compte) se DÉCLARENT ici :
      // l'en-tête commun les rend, l'écran n'en dessine pas un second (COQUE.md §2).
      pageTitle={t('page.introTitle')}
      pageSubtitle={t('page.introSubtitle')}
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <ImportPortfolioButton />
          <Button asChild icon={ScanSearch} className="min-h-11">
            <Link to="/search">{t('page.analyze')}</Link>
          </Button>
        </div>
      }
      // #3822.D (recette prod 08/10, W 5b4b10d2f3) — `h-full` figeait cette
      // enveloppe à la hauteur VISIBLE du viewport : son contenu débordait
      // sans jamais pousser le padding bas réservé à la bulle de Laura
      // (`CustomerPageContent.tsx`, `md:pb-20`/`md:min-h-fit`, #3480), qui
      // recouvrait donc la dernière ligne du tableau. `min-h-full`, comme
      // `/actions` (même correctif, #3480).
      contentClassName="flex min-h-full flex-col px-0 py-0"
      // #2474 — l'entrée MANUELLE au portefeuille (`AddAccountButton`,
      // #2150.33) a quitté l'entête : « on ne passe que par l'analyse »
      // (Louis, 16/09/2026). La porte qui reste, et qui existait déjà pour une
      // liste non vide, est `<ListLauncher typeKey="account" />` — montée par
      // `AccountsToolbar` (via `AccountContent` ci-dessous) et qui ouvre
      // `AccountLaunchSurface`, le lancement d'une analyse EN PLACE.
      //
      // Vague 20 (16/09) — #2240 (« fix/six-constats-accounts-et-chat »)
      // proposait de déplacer CE MÊME bouton vers `AccountsToolbar` au lieu
      // de le retirer. #2474 est le retour le plus récent de Louis et il
      // est déjà EN PRODUCTION (mesuré : zéro bouton d'ajout manuel sur 252
      // boutons lus en prod, vague 19) : la suppression gagne, #2240 est
      // abandonné dans cette fusion (voir aussi `AccountsToolbar.tsx`).
    >
      {/* #1316.2 — « "Où en est le portefeuille" est trop vague ». Un entête
          qui dit à quoi sert l'écran, prénom pris au profil.

          ⚠️ PAS sous la lentille « effort » : cette vue porte DÉJÀ son propre
          entête et son propre accès au copilote. Vu en recette le 02/09, les
          deux s'empilaient — deux titres et deux liens « Demander à Laura » sur
          le même écran, ce que la loi 4 du tome 7 refuse : rien n'apparaît deux
          fois sous la même forme avec le même contenu. L'entête suit donc la
          LENTILLE, comme le reste de l'écran. */}
      {listsLens ? (
        <div className={`${PAGE_GUTTER_X} pt-4`}>
          <Link
            to="/accounts"
            search={{}}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
          >
            <ArrowLeft className="size-4" aria-hidden />
            {t('page.listsBack')}
          </Link>
        </div>
      ) : null}
      {effortLens || listsLens || followedLens ? null : (
        // Refonte Théo (`.a4-counters`) — la bande des quatre chiffres, juste sous l'en-tête de la coque.
        // #4583 — sous `?lens=followed` la liste est celle des suivis, pas celle de ces compteurs : la bande se tait.
        <div className={`${PAGE_GUTTER_X} pt-2`}>
          <AccountsKeyFigures
            counters={counters}
            active={activeKeyFigure}
            onSelect={handleKeyFigureSelect}
            scoped={bandScoped}
            renderedTotal={infiniteData?.pages[0]?.pagination.totalItems}
          />
        </div>
      )}

      {effortLens || listsLens || followedLens ? null : (
        <>
          <AccountsResumeShelf rows={accounts} />
          {/* #1316.6 — l'accès contextuel au copilote reste là quand l'étagère n'a rien à reprendre :
              un LIEN qui pré-remplit la question, jamais un envoi (#1321.4). */}
          {accountsToResume(accounts).length === 0 ? (
            <div className={`${PAGE_GUTTER_X} pt-4`}>
              <AskLaura label={t('page.askLauraLabel')} question={t('page.askLauraQuestion')} />
            </div>
          ) : null}
        </>
      )}

      {effortLens || listsLens ? null : (
        // V22 (`.a4-list-head`, #4496) — UNE SEULE RANGÉE : les quatre onglets du portefeuille à gauche, la
        // bascule Commercial | Facturation à droite. Les vues nommées (#1580, #2150.8, #2150.9) sont SUPPRIMÉES
        // (Louis 23/10), « Mes listes de cibles » est passé au sous-menu Comptes (lot NAV, `?lens=lists`).
        <section aria-label={t('page.portfolioListLabel')} className={`${PAGE_GUTTER_X} pt-8`}>
          <AccountsListHead
            portfolioTab={portfolioTab}
            onPortfolioTabChange={handlePortfolioTabChange}
            crmCount={counters?.crm}
            crmActive={crmFilter === 'only'}
            crmName={crmName}
            onCrmToggle={handleCrmToggle}
            importedCount={counters?.imported}
            importedActive={importedFilter === 'only'}
            onImportedToggle={handleImportedToggle}
            onClearImportJob={importJobFilter ? handleClearImportJob : undefined}
            deliveryLens={deliveryLens}
            onDeliveryLensChange={followedLens ? undefined : handleDeliveryLensChange}
          />
          {/* #4603.4 — l'APPELANT du rattrapage des paires compte-CRM ↔ compte-analyse (réservé à qui branche le CRM).
              #4603.5 — monté SANS condition de compteur : `counters.crm` compte les comptes CRM VIVANTS (puce « Mon
              CRM »), pas les PAIRES à proposer ; à 0, illisible ou pas encore lu, il rendait le geste inatteignable
              (recette prod 31/10, « Veepee »). La bannière décide seule : droit, puis simulation (`found`). */}
          <AccountsCrmFusionBanner />
        </section>
      )}

      {listsLens ? (
        <div className="pb-6 pt-2">
          <TargetListsSection />
        </div>
      ) : followedLens ? (
        <div className="pb-6 pt-3">
          {/* #4526.3 — Suivis ∩ Mon CRM : sous la puce CRM, la liste des suivis ne garde que les comptes du CRM. */}
          <FollowedAccountsSection crmAccountIds={crmAccountIds} />
        </div>
      ) : effortLens ? (
        /* #1318.1 — la vue « Priorités de la semaine ». Le moteur d'allocation
           est intact ; c'est la MÊME donnée regardée autrement, et elle remplace
           la liste au lieu de s'y empiler. */
        <div className={`${PAGE_GUTTER_X} pb-6`}>
          <SprintBoard />
        </div>
      ) : (
        <>
          {/* #4990 — résumé « aucun compte à attaquer » + légende des cinq verdicts, au-dessus de la liste. */}
          <div className={`${PAGE_GUTTER_X} pt-3`}>
            <AccountsVerdictSummary rows={accounts} />
          </div>
          <AccountContent
            accounts={accounts}
            counters={counters}
            headline={headlineFilter}
            deliveryLens={deliveryLens}
            onDeliveryLensChange={handleDeliveryLensChange}
            /* #3299 — « déplace sur la ligne du dessus, que tout soit sur la
             même ligne » : les deux bascules (#2150.14/.18/.15) quittent leur
             rangée propre et rejoignent la barre de recherche. */
            toolbarLeading={
              <>
                <AccountsOwnerSelect value={ownerValue} onChange={handleOwnerChange} />
                <AccountsSortSelect value={sortKey} onChange={handleSortKeyChange} />
              </>
            }
            toolbarTrailing={
              <>
                {deliveryLens ? null : <AccountsLayoutToggle cards={cardsLayout} onChange={handleLayoutChange} />}
                <AccountsExportButton rows={accounts} />
              </>
            }
            lensToggleInHead
            listFooter={
              // Théo `.a4-table-footer` — le total SERVEUR de la vue (filtres compris), sous la liste.
              <div className={`${PAGE_GUTTER_X} pt-3`}>
                <AccountsTotal total={loading || failed ? undefined : infiniteData?.pages[0]?.pagination.totalItems} />
              </div>
            }
            loading={loading}
            failed={failed}
            onRetry={() => void refetch()}
            viewMode={cardsLayout ? 'grid' : 'list'}
            onChangeViewMode={mode => handleLayoutChange(mode === 'grid')}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            compareOpen={compareOpen}
            onCompareOpenChange={setCompareOpen}
            query={query}
            onQueryChange={handleQueryChange}
            sortKey={sortKey}
            onSortKeyChange={handleSortKeyChange}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            activeFilters={activeFilters}
            onFiltersChange={handleFiltersChange}
            portfolioFilters={portfolioFilters}
            onApplyPortfolioFilters={handleApplyPortfolioFilters}
            onClearFilters={handleClearFilters}
            narrowing={narrowing}
            activeSources={[
              ...(crmFilter === 'only' ? ['crm' as const] : []),
              ...(importedFilter === 'only' ? ['imported' as const] : []),
            ]}
            loadingMore={isFetchingNextPage}
            loadMoreRef={handleLoadMoreRef}
          />
        </>
      )}
    </CustomerPage>
  )
}
