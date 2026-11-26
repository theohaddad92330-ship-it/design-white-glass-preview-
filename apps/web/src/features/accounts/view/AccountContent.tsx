import {
  Box,
  BrailleLoader,
  Button,
  EmptyState,
  FilterBar,
  LAYOUT_TRANSITION,
  SearchEmptyState,
  TabNav,
  Text,
  type TabNavItem,
  type ActiveFilter,
  type FilterDefinition,
  cn,
} from '@bellum/ui'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Building2,
  CircleDot,
  Clock,
  Network,
  SlidersHorizontal,
  Tag,
  TrendingUp,
  TriangleAlert,
  Unlock,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { FilterOption } from '@bellum/ui'
import { PAGE_GUTTER_MX, PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { useAccountSectors, useAccountTags } from '@/features/accounts/hooks/useAccountFacets'
import { useArchiveAccount } from '@/features/accounts/hooks/useArchiveAccount'
import { useDeleteAccount } from '@/features/accounts/hooks/useDeleteAccount'
import { emptyListAction } from '@/features/accounts/lib/emptyListAction'
import type { ListNarrowing } from '@/features/accounts/lib/listNarrowing'
import { AccountsNextActionScopeNotice } from './hygiene/AccountHygieneNotices'
import { AccountsEmpty } from './accounts-list/AccountsEmpty'
import { AccountsSidebar } from './accounts-list/AccountsSidebar'
import { AccountsTable } from './accounts-list/AccountsTable'
import { AccountsBillingCardList } from './accounts-list/AccountsBillingCardList'
import { AccountsCardGrid } from './accounts-list/AccountsCardGrid'
import { AccountsTableSkeleton } from './accounts-list/AccountsTableSkeleton'
import { AccountsToolbar } from './accounts-list/AccountsToolbar'
import { CompareDialog } from './accounts-list/CompareDialog'
import { DeleteConfirmDialog } from './accounts-list/DeleteConfirmDialog'
import { RefreshSignalsDialog } from './accounts-list/RefreshSignalsDialog'
import { RefreshContactsDialog } from './accounts-list/RefreshContactsDialog'
import { DiscoverContactsDialog } from './accounts-list/DiscoverContactsDialog'
import { AnalyzeBatchDialog } from './accounts-list/AnalyzeBatchDialog'
import { SelectionBar } from './accounts-list/SelectionBar'
import { CrmPushDialog } from '@/features/crm/view/CrmPushDialog'
import { CreateTargetListFromSelectionDialog } from '@/features/target-lists/view/CreateTargetListFromSelectionDialog'
import { PortfolioExitLink } from './accounts-list/PortfolioExitLink'
import { AccountsBillingCounters } from './accounts-list/AccountsBillingCounters'
import { AccountsLensToggle } from './accounts-list/AccountsLensToggle'
import { AccountsFiltersDialog } from './accounts-list/AccountsFiltersDialog'
import {
  EMPTY_PORTFOLIO_FILTERS,
  PORTFOLIO_ACCOUNT_TYPES,
  accountInZone,
  accountTypeOf,
  portfolioZoneOptions,
  countPortfolioFilters,
  type PortfolioAccountType,
  type PortfolioFilterValues,
} from '@/features/accounts/lib/portfolioFilters'
import { useAccessSummary } from './accounts-list/useAccessSummary'
import { useQualificationSummary } from './accounts-list/useQualificationSummary'
import { NotInPortfolioEmptyState } from './accounts-list/NotInPortfolioEmptyState'
import {
  ANALYSIS_STATUS_FILTER_VALUES,
  getStatusConfig,
  statusLabelKey,
  type AccountRow,
  type SortKey,
} from './accounts-list/types'
import { OpportunityBanner } from './OpportunityBanner'
import {
  ACCESS_CLASSES,
  ACCOUNT_ENTITY_KINDS,
  COMMERCIAL_OPPORTUNITY_SCORE_MIN,
  PRIORITY_GATES,
  type AccessBarrierClass,
  type AccountListCounters,
  type AccountListHeadlineFilter,
} from '@bellum/contracts'

function buildStatusOptions(t: TFunction): FilterOption[] {
  return ANALYSIS_STATUS_FILTER_VALUES.map(value => ({
    value,
    label: t(statusLabelKey(value)),
    icon: getStatusConfig(value).icon,
    iconClassName: getStatusConfig(value).text,
  }))
}

const fadeUp = {
  hidden: { opacity: 0, transform: 'translate3d(0, 12px, 0)' },
  visible: { opacity: 1, transform: 'translate3d(0, 0, 0)' },
}

const easeOut = [0.23, 1, 0.32, 1] as const
const layoutTransition = LAYOUT_TRANSITION

function buildScoreOptions(t: TFunction): FilterOption[] {
  return [
    { value: 'high', label: t('filters.scoreHigh') },
    { value: 'medium', label: t('filters.scoreMedium') },
    { value: 'low', label: t('filters.scoreLow') },
  ]
}

const RECENT_HISTORY_FILTER_ID = 'sort'
const RECENT_HISTORY_SORT_KEY = 'date_asc'
const DEFAULT_SORT_KEY = 'date_desc'

function buildRecentHistoryFilter(t: TFunction): FilterDefinition {
  return {
    id: RECENT_HISTORY_FILTER_ID,
    label: t('filters.sort'),
    icon: Clock,
    verb: t('filters.sortVerb'),
    options: [{ value: RECENT_HISTORY_SORT_KEY, label: t('filters.recentHistory') }],
  }
}

/**
 * Manque B du 30/08 — le filtre d'accessibilité (A-D).
 *
 * INTERCEPTÉ LOCALEMENT, comme le filtre « historique récent » juste
 * au-dessus : `GET /accounts` (module `accounts`, hors périmètre de ce
 * chantier) ne sait pas filtrer sur la classe d'accès. La donnée arrive par
 * un second chemin (`useAccessSummary`, `AccountAccessController`) et se
 * filtre donc CÔTÉ CLIENT, sur les comptes déjà CHARGÉS — même limite assumée
 * que « tout sélectionner » (§ plus bas) : une classe rare peut demander de
 * faire défiler plusieurs pages avant d'en voir une occurrence.
 */
const ACCESS_CLASS_FILTER_ID = 'accessClass'

function buildAccessClassFilter(t: TFunction): FilterDefinition {
  return {
    id: ACCESS_CLASS_FILTER_ID,
    label: t('filters.accessClass'),
    icon: Unlock,
    options: ACCESS_CLASSES.map(cls => ({ value: cls, label: t(`filters.accessClassValue.${cls}`) })),
  }
}

/**
 * #4498 — le TYPE DE COMPTE (Client final · Intermédiaire), jugé sur les lignes CHARGÉES comme l'accessibilité
 * juste au-dessus : même dérivation que le badge de ligne (`accountTypeOf`), aucune API neuve.
 */
const ACCOUNT_TYPE_FILTER_ID = 'accountType'

function buildAccountTypeFilter(t: TFunction): FilterDefinition {
  return {
    id: ACCOUNT_TYPE_FILTER_ID,
    label: t('filters.accountType'),
    icon: Building2,
    options: PORTFOLIO_ACCOUNT_TYPES.map(type => ({ value: type, label: t(`filters.accountTypeValue.${type}`) })),
  }
}

/**
 * Le texte de l'état vide filtré pour UN axe isolé (manque C du 30/08).
 *
 * `lifecycle` garde sa phrase dédiée (« rangé en… ») : c'est le seul axe qui
 * n'a ni pastille ni onglet, et sa formulation existait déjà. Tout autre axe
 * — une pastille RÉELLE de la barre de filtres — passe par le même gabarit
 * générique, en allant chercher son LIBELLÉ (le filtre) et celui de sa
 * VALEUR dans les définitions déjà construites pour la barre : la même
 * source que ce que l'utilisateur a cliqué, jamais une seconde traduction
 * qui pourrait diverger.
 */
function namedFilterDescription(
  t: TFunction,
  filterDefinitions: FilterDefinition[],
  axis: { id: string; value: string },
): string {
  if (axis.id === 'lifecycle') {
    return t('emptyFiltered.notInLifecycle', { lifecycle: t(`commercialStatus.${axis.value}`) })
  }
  if (axis.id === 'source') {
    return t('emptyFiltered.notInSource', {
      source: t(axis.value === 'imported' ? 'importedChip.label' : 'crmChip.label'),
    })
  }
  const definition = filterDefinitions.find(def => def.id === axis.id)
  // `FilterDefinition` est une union — seul le variant `select` (le seul que
  // cet écran construit) porte `options`. `TextFilterDefinition` n'en a pas.
  const option =
    definition && 'options' in definition ? definition.options.find(opt => opt.value === axis.value) : undefined
  return t('emptyFiltered.notInFilter', { filter: definition?.label ?? axis.id, value: option?.label ?? axis.value })
}

function buildAccountsFilters(sectors: string[], tags: string[], t: TFunction): FilterDefinition[] {
  return [
    { id: 'status', label: t('filters.status'), icon: CircleDot, options: buildStatusOptions(t) },
    { id: 'score', label: t('filters.score'), icon: TrendingUp, options: buildScoreOptions(t) },
    { id: 'sector', label: t('filters.sector'), icon: Building2, options: sectors.map(s => ({ value: s, label: s })) },
    // La porte de PRIORITÉ (G1) — « montre-moi ce que j'ai écarté, et pourquoi »
    // (tome 1, U08). Le motif et la date étaient en base depuis le 19/08 et ne
    // se lisaient sur aucun écran : un journal qu'on ne peut pas relire n'est
    // pas un journal.
    {
      id: 'gate',
      label: t('filters.gate'),
      icon: SlidersHorizontal,
      options: PRIORITY_GATES.map(gate => ({ value: gate, label: t(`filters.gateValue.${gate}`) })),
    },
    /**
     * LE TYPE D'ENTITÉ (31/08/2026) — le « Type d'organisation » de la maquette,
     * dit dans NOTRE vocabulaire : le produit parle de COMPTES et d'entités.
     *
     * Les valeurs viennent d'`ACCOUNT_ENTITY_KINDS`, jamais recopiées ici : un
     * type ajouté au vocabulaire doit apparaître dans ce filtre sans que
     * personne n'y pense, sinon il resterait invisible et personne ne s'en
     * apercevrait.
     *
     * ⚠️ Le filtre porte sur les ENTITÉS du compte : un compte est retenu dès
     * qu'UNE des siennes porte le type demandé. Un groupe ne disparaît donc pas
     * de « filiales » parce que sa seconde division est une business unit.
     */
    {
      id: 'entityKind',
      label: t('filters.entityKind'),
      icon: Network,
      options: ACCOUNT_ENTITY_KINDS.map(kind => ({ value: kind, label: t(`entityKind.${kind}`) })),
    },
    // #2159.26 — les ÉTIQUETTES en usage (import CRM, fichier). Les options
    // viennent de `GET /accounts/tags` : jamais une étiquette que personne ne
    // porte.
    { id: 'tag', label: t('filters.tag'), icon: Tag, options: tags.map(tag => ({ value: tag, label: tag })) },
  ]
}

// UNE liste, pas quatre onglets (recette finale §19-20).
//
// « En observation », « À potentiel » et « Hors priorité » étaient trois vues
// d'un même portefeuille, et elles compliquaient la page sans donner de
// workflow : rien ne disait par où commencer, et un compte changeait d'onglet
// sans que personne ne l'ait déplacé. Le rapport tranche — « conserver un
// portefeuille unique et des filtres ».
//
// Le cycle de vie n'est pas perdu : il devient un FILTRE (« Statut »), au même
// rang que le score et le secteur. La différence est qu'un filtre se combine —
// « à potentiel ET score élevé ET secteur banque » est une question qu'un
// commercial se pose, et que des onglets ne savaient pas poser.
const ACCOUNTS_TAB_KEYS = ['all'] as const

// Onglets SANS compteur, volontairement : cette liste est paginée (25/page,
// scroll infini), donc un compteur dérivé des comptes chargés mentirait dès la
// 2e page — c'est exactement le bug corrigé sur les pastilles de /contacts.
// Pour en ajouter un : agréger côté serveur dans la réponse de `GET /accounts`
// (cf. `lifecycleTally` dans `contacts.service.ts`), jamais `accounts.filter().length`.
function buildTabItems(t: TFunction): TabNavItem[] {
  return ACCOUNTS_TAB_KEYS.map(key => ({ key, label: t(`listTabs.${key}`) }))
}

type AccountsProps = {
  accounts: AccountRow[]
  /** Les compteurs de tête, comptés par le SERVEUR sur l'ensemble du filtre.
   *  `undefined` pendant le chargement ou après une lecture ratée — le bandeau
   *  se tait alors, plutôt que d'écrire un « 0 » qui serait faux. */
  counters: AccountListCounters | undefined
  /** L'axe décisionnel posé dans l'URL (`search.headline`) — compte comme une restriction. */
  headline?: AccountListHeadlineFilter
  loading: boolean
  /** La liste n'a pas pu être chargée. Distinct de « vide » : une panne ne se
   *  raconte pas comme un portefeuille sans compte. */
  failed: boolean
  onRetry: () => void
  viewMode: 'list' | 'grid'
  onChangeViewMode: (mode: 'list' | 'grid') => void
  /**
   * LA LENTILLE (26/08/2026) — sous quel angle on regarde le portefeuille.
   *
   * `false` = l'angle commercial (« ce compte vaut-il mon temps ? »), `true` =
   * celui de l'ops (« peut-on facturer ce client ? »). Ce sont les MÊMES
   * comptes, les mêmes filtres, la même pagination : seules deux zones de la
   * ligne changent. Facultative avec un défaut FAUX — les tests existants
   * décrivent l'angle commercial et n'ont pas d'avis sur celui-ci.
   */
  deliveryLens?: boolean
  onDeliveryLensChange?: (next: boolean) => void
  /** #3299 — bascules Favoris / Collègue, montées dans la barre de recherche. */
  toolbarLeading?: ReactNode
  /** Refonte Théo — la droite de la barre : présentation (tableau / cartes) et export. */
  toolbarTrailing?: ReactNode
  /** Refonte Théo — la lentille Commercial / Facturation est déjà posée dans la tête de liste. */
  lensToggleInHead?: boolean
  /** Refonte Théo — le pied du tableau (« N comptes · dans cette vue »). */
  listFooter?: ReactNode
  selectedIds: Set<string>
  onSelectedIdsChange: (next: Set<string>) => void
  compareOpen: boolean
  onCompareOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (next: string) => void
  sortKey: SortKey
  onSortKeyChange: (next: SortKey) => void
  activeTab: string
  onTabChange: (tab: string) => void
  activeFilters: ActiveFilter[]
  onFiltersChange: (next: ActiveFilter[]) => void
  onClearFilters: () => void
  /**
   * #4498 — les critères SERVEUR de « Filtrer mon portefeuille », lus dans l'URL par la page ; le type de compte
   * et l'accessibilité, jugés sur les lignes chargées, vivent ici. Absents (tests d'avant) = « Tous ».
   */
  portfolioFilters?: Omit<PortfolioFilterValues, 'accountType' | 'accessClass' | 'zone'>
  onApplyPortfolioFilters?: (next: PortfolioFilterValues, options: { reset: boolean }) => void
  /**
   * CE QUI RESTREINT LA LISTE — l'unique dérivation (`listNarrowing`).
   *
   * Elle remplace un booléen `isFilterActive` qui ne regardait que la barre de
   * filtres, et qui répondait donc « non » sous `?lifecycle=opportunity`. C'est
   * ce « non » qui faisait rendre l'état du portefeuille VIDE à quelqu'un qui a
   * 24 comptes, et qui faisait annoncer « Tout le portefeuille » au-dessus de
   * chiffres comptés sur les seules opportunités.
   */
  narrowing: ListNarrowing
  /** #4643 — les puces de source allumées : un filtre qui ne rend rien les NOMME. */
  activeSources?: readonly ('crm' | 'imported')[]
  loadingMore?: boolean
  loadMoreRef?: (node: HTMLDivElement | null) => void
}

export function AccountContent({
  accounts,
  counters,
  headline,
  deliveryLens = false,
  onDeliveryLensChange,
  toolbarLeading,
  toolbarTrailing,
  lensToggleInHead = false,
  listFooter,
  loading,
  failed,
  onRetry,
  viewMode,
  selectedIds,
  onSelectedIdsChange,
  compareOpen,
  onCompareOpenChange,
  query,
  onQueryChange,
  sortKey,
  onSortKeyChange,
  activeTab,
  onTabChange,
  activeFilters,
  onFiltersChange,
  onClearFilters,
  portfolioFilters,
  onApplyPortfolioFilters,
  narrowing,
  activeSources = [],
  loadingMore = false,
  loadMoreRef,
}: AccountsProps) {
  const { t } = useTranslation('accounts')
  const shouldReduceMotion = useReducedMotion()
  const deleteAccount = useDeleteAccount()
  const archiveAccount = useArchiveAccount()
  const deletingId = deleteAccount.isPending ? deleteAccount.variables : null
  const archivingId = archiveAccount.isPending ? archiveAccount.variables : null

  const { data: sectors = [] } = useAccountSectors()
  const { data: tags = [] } = useAccountTags()
  const filterDefinitions = useMemo(() => buildAccountsFilters(sectors, tags, t), [sectors, tags, t])
  const tabItems = useMemo(() => buildTabItems(t), [t])

  /**
   * MANQUE B DU 30/08 — l'accessibilité (A-D) rejoint le portefeuille.
   *
   * `raw_analysis.access_barrier` existait déjà par compte (onglet Accès,
   * depuis le 29/08) et n'atteignait aucune vue de LISTE. `useAccessSummary`
   * lit `GET /accounts/access-summary` (même service, même donnée, jamais
   * recalculée — GA-26) et ce composant la FUSIONNE avec les lignes déjà
   * chargées par `GET /accounts`, comme il fusionne déjà d'autres compléments
   * par compte (`AccountRevenueCell`).
   */
  const accessSummary = useAccessSummary()
  // N21 du 30/08 (GA-179, D616) — `accessSummary.isError` est LA source de
  // vérité pour « la lecture a échoué ». `mergedAccounts` ci-dessous NE LA
  // REDÉRIVE PAS depuis la forme de `accessSummary.data` (l'ancien
  // `!Array.isArray(summary)` traitait un échec exactement comme un résumé
  // pas encore arrivé) — deux chemins qui redisent la même chose divergent
  // tôt ou tard.
  const accessSummaryFailed = accessSummary.isError
  const [accessClassFilter, setAccessClassFilter] = useState<AccessBarrierClass[]>([])
  const [accountTypeFilter, setAccountTypeFilter] = useState<PortfolioAccountType[]>([])
  // #4989.1 — la zone (ville / département du siège), jugée sur les lignes chargées comme le type de compte.
  const [zoneFilter, setZoneFilter] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const zoneOptions = useMemo(() => portfolioZoneOptions(accounts), [accounts])
  /**
   * #3749 — même mécanisme que `accessSummary` juste au-dessus, pour le
   * verdict de la grille de qualification : une lecture séparée (son propre
   * échec ne doit pas être confondu avec celui de l'accessibilité), fusionnée
   * dans la MÊME passe que `mergedAccounts`.
   */
  const qualificationSummary = useQualificationSummary()
  const qualificationSummaryFailed = qualificationSummary.isError
  const mergedAccounts = useMemo<AccountRow[]>(() => {
    const accessRows = accessSummary.data
    const accessClassById = new Map(
      Array.isArray(accessRows) ? accessRows.map(row => [row.accountId, row.accessClass]) : [],
    )
    const qualificationRows = qualificationSummary.data
    const qualificationVerdictById = new Map(
      Array.isArray(qualificationRows) ? qualificationRows.map(row => [row.accountId, row.verdict]) : [],
    )
    return accounts.map(account => ({
      ...account,
      ...(Array.isArray(accessRows) ? { accessClass: accessClassById.get(account.id) ?? null } : {}),
      ...(Array.isArray(qualificationRows)
        ? { qualificationVerdict: qualificationVerdictById.get(account.id) ?? null }
        : {}),
    }))
  }, [accounts, accessSummary.data, qualificationSummary.data])
  // D616 — le filtre n'est pas PERDU pendant une panne (comme les autres
  // filtres pendant une coupure réseau, §3.5 : `failed` plus bas conserve les
  // filtres pour éviter de refaire trois clics) : sa valeur reste en mémoire
  // et reprend effet dès que la lecture repart. Mais TANT que la lecture a
  // échoué, il n'agit sur RIEN — `accessClass` vaut alors `undefined` sur
  // CHAQUE ligne (voir `mergedAccounts` ci-dessus), et l'appliquer filtrerait
  // silencieusement la liste entière : une classe rare se lirait « aucun
  // compte de cette classe », qui est faux — la vraie réponse est « on ne
  // sait pas, la lecture a échoué ».
  const effectiveAccessClassFilter = accessSummaryFailed ? [] : accessClassFilter
  // Ce que le tableau, le panneau latéral et l'état vide MONTRENT — jamais
  // `accounts` directement dès qu'un filtre client (accessibilité) est posé.
  // Sans cette distinction, une classe qui ne rend rien afficherait un
  // tableau vide SANS AUCUN état vide : `accounts.length` resterait > 0.
  const visibleAccounts = useMemo(
    () =>
      mergedAccounts.filter(
        account =>
          (effectiveAccessClassFilter.length === 0 ||
            (account.accessClass != null && effectiveAccessClassFilter.includes(account.accessClass))) &&
          (accountTypeFilter.length === 0 || accountTypeFilter.includes(accountTypeOf(account))) &&
          accountInZone(account, zoneFilter),
      ),
    [mergedAccounts, effectiveAccessClassFilter, accountTypeFilter, zoneFilter],
  )
  // Les identifiants AFFICHÉS — la population que les compteurs de la lentille
  // décrivent. Dérivés du même `visibleAccounts` que le tableau, jamais de
  // `accounts` brut : les deux diffèrent dès qu'un filtre client est posé, et
  // un compteur qui décrirait une autre population que la liste sous ses yeux
  // serait un compteur qui ment.
  const visibleAccountIds = useMemo(() => visibleAccounts.map(account => account.id), [visibleAccounts])
  // `narrowing.active` (calculé par le parent) ne connaît pas ce filtre CLIENT
  // — il ne voit que l'URL. Une restriction invisible reste une restriction
  // (même défaut que celui que `narrowing` a corrigé pour `lifecycle`, D300).
  const accessClassNarrows = effectiveAccessClassFilter.length > 0
  const clientNarrows = accessClassNarrows || accountTypeFilter.length > 0 || zoneFilter.length > 0
  const effectiveNarrowingActive = narrowing.active || clientNarrows

  // #1134, généralisé le 30/08 (manque C) : ce qu'on propose quand la liste ne
  // rend rien — décidé par une fonction pure, à partir de TOUS les axes de
  // restriction actifs (les pastilles de la barre, le rangement du cycle
  // commercial, et désormais l'accessibilité), jamais un cas par filtre.
  const narrowingFilters = useMemo(() => {
    const list: { id: string; value: string }[] = [...activeFilters]
    if (narrowing.lifecycle) list.push({ id: 'lifecycle', value: narrowing.lifecycle })
    for (const value of effectiveAccessClassFilter) list.push({ id: ACCESS_CLASS_FILTER_ID, value })
    for (const value of accountTypeFilter) list.push({ id: ACCOUNT_TYPE_FILTER_ID, value })
    for (const value of zoneFilter) list.push({ id: 'zone', value })
    for (const value of activeSources) list.push({ id: 'source', value })
    return list
  }, [activeFilters, narrowing.lifecycle, effectiveAccessClassFilter, accountTypeFilter, zoneFilter, activeSources])
  const emptyAction = useMemo(() => emptyListAction(query, narrowingFilters), [query, narrowingFilters])

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  // Le panneau « Comptes proches de ta cible » n'est ouvert d'emblée QUE si
  // l'écran peut porter les deux.
  //
  // Mesuré le 23/08 sur un portable de 1440 px : barre latérale (250) + panneau
  // (340) + marges laissent 729 px au tableau, qui en demande 880. Les 151 px
  // manquants emportaient toute la colonne « Prochaine action » — la plus
  // actionnable des cinq, invisible sans défilement horizontal que rien
  // n'annonce. Panneau replié, le tableau tient exactement.
  //
  // #1795 — replié à l'arrivée, et à CHAQUE rafraîchissement : « par défaut
  // ça doit toujours être replié ». Il portait jusqu'ici un second critère —
  // ouvert d'emblée dès 1 536 px — qui allait dans le sens inverse : sur un
  // grand écran, c'était justement le cas où Louis le retrouvait déjà
  // déplié. Il n'est pas RETIRÉ pour autant : son bouton reste dans la barre
  // d'outils, à un clic, sur toutes les largeurs — même patron que
  // `showSimilar` de Découvrir (`features/discover/view/Discover.tsx:147`),
  // toujours fermé à l'arrivée, ouvert par un geste dédié. Un simple
  // `useState(false)` : rien n'est lu dans `localStorage` ni dans l'URL, donc
  // rien ne peut restaurer un état déplié après un rafraîchissement.
  const [isAccountsSidebarVisible, setIsAccountsSidebarVisible] = useState(false)

  const handleDelete = useCallback(
    (id: string) => {
      deleteAccount.mutate(id, {
        onSuccess: () => {
          const next = new Set(selectedIds)
          next.delete(id)
          onSelectedIdsChange(next)
        },
        onSettled: () => setDeleteConfirm(null),
      })
    },
    [deleteAccount, selectedIds, onSelectedIdsChange],
  )

  const handleClearSelection = useCallback(() => onSelectedIdsChange(new Set()), [onSelectedIdsChange])

  /**
   * Le PRODUCTEUR de la sélection.
   *
   * `selectedIds` ne changeait jusqu'ici que pour RETIRER un compte supprimé ou
   * pour tout VIDER : rien sur l'écran ne pouvait y ajouter un identifiant, si
   * bien que `SelectionBar` (≥ 2) et `CompareDialog` (≥ 2) étaient du code
   * juste, testé, et injoignable — le défaut n°1 de ce dépôt.
   *
   * Un `Set` NEUF à chaque fois : muter celui de l'appelant ne changerait pas
   * son identité, et React ne re-rendrait rien.
   */
  const handleSelectionChange = useCallback(
    (id: string, selected: boolean) => {
      const next = new Set(selectedIds)
      if (selected) next.add(id)
      else next.delete(id)
      onSelectedIdsChange(next)
    },
    [selectedIds, onSelectedIdsChange],
  )

  /**
   * « Tout sélectionner » porte sur les comptes CHARGÉS, jamais sur un total
   * serveur : la liste est paginée (25/page, défilement infini), et cocher ne
   * doit pas promettre d'agir sur des comptes que l'écran n'a pas encore vus.
   */
  const handleToggleAll = useCallback(
    (selected: boolean) => {
      // Les lignes VISIBLES : sous le filtre d'accessibilité, cocher « tout »
      // ne doit pas retenir des comptes qu'aucune ligne à l'écran ne montre.
      onSelectedIdsChange(selected ? new Set(visibleAccounts.map(a => a.id)) : new Set())
    },
    [visibleAccounts, onSelectedIdsChange],
  )

  const selectedAccounts = accounts.filter(a => selectedIds.has(a.id))

  // #2157.4/.8 — « Créer une cible » depuis une sélection de comptes. État
  // purement local : rien d'autre sur l'écran n'a besoin de savoir si ce
  // dialogue est ouvert (contrairement à `compareOpen`, remonté par
  // `AccountsPage`).
  const [createTargetOpen, setCreateTargetOpen] = useState(false)
  const targetSelectionItems = selectedAccounts.map(account => ({
    kind: 'account' as const,
    id: account.id,
    label: account.company_name,
  }))

  // #2293.2 — « actualiser les signaux de tout un portefeuille ». Même état
  // purement local que `createTargetOpen` juste au-dessus : rien d'autre sur
  // l'écran n'a besoin de savoir si ce dialogue est ouvert.
  const [refreshSignalsOpen, setRefreshSignalsOpen] = useState(false)

  // #2809 (#2293.2/.11, #2294.*) — « relancer la collecte de contacts sur la
  // sélection », le pendant CONTACTS de `refreshSignalsOpen` juste au-dessus.
  // Même état purement local.
  const [refreshContactsOpen, setRefreshContactsOpen] = useState(false)

  // #2809 (#2293.11, #2294.*) — « découvrir des contacts » (recherche FRAÎCHE,
  // personnes jamais collectées), distinct de `refreshContactsOpen`
  // au-dessus. Même état purement local.
  const [discoverContactsOpen, setDiscoverContactsOpen] = useState(false)

  // #2809 (#2293.3) — « Analyser en lot » depuis la sélection : même état
  // purement local que les deux au-dessus.
  const [analyzeBatchOpen, setAnalyzeBatchOpen] = useState(false)
  // #4188 — l'envoi en lot vers le CRM branché.
  const [crmPushOpen, setCrmPushOpen] = useState(false)

  // Le bandeau « comptes à fort potentiel » compte la MÊME population que le
  // rangement « Opportunité » : la coupure est empruntée au contrat (D44), pas
  // retapée. Un score absent n'est pas un zéro — il n'est simplement pas compté.
  const opportunityCount = accounts.filter(
    a => a.priority_score != null && a.priority_score >= COMMERCIAL_OPPORTUNITY_SCORE_MIN,
  ).length
  const completedCount = accounts.filter(a => a.status === 'completed').length
  const hasRecentHistorySort = sortKey === RECENT_HISTORY_SORT_KEY
  // Deux filtres sont INTERCEPTÉS localement plutôt que renvoyés au parent —
  // « historique récent » (un raccourci de tri déguisé en pastille) et
  // « accessibilité » (manque B, GET /accounts ne la connaît pas). Les DEUX
  // vivent dans le MÊME mécanisme : une pastille de plus dans le tableau
  // ci-dessous aurait dupliqué cette interception une seconde fois.
  // D616 (N21 du 30/08) — DÉSACTIVER le filtre plutôt que l'afficher inerte,
  // quand la lecture a échoué : le retirer des DEUX menus l'empêche d'être
  // choisi tant qu'il ne pourrait rendre qu'un résultat malhonnête (voir
  // `effectiveAccessClassFilter` plus haut). L'alternative — le laisser dans
  // le menu et le neutraliser seulement à l'application — offrirait un choix
  // qui ne fait plus rien, ce qui se découvre au clic, pas avant. La raison
  // du retrait est ÉCRITE ailleurs sur l'écran (`AccountsToolbar`
  // ci-dessous), jamais seulement devinable depuis son absence.
  const filterBarDefinitions = useMemo(() => {
    const withSort = hasRecentHistorySort ? [...filterDefinitions, buildRecentHistoryFilter(t)] : filterDefinitions
    const withType = [...withSort, buildAccountTypeFilter(t)]
    return accessSummaryFailed ? withType : [...withType, buildAccessClassFilter(t)]
  }, [filterDefinitions, hasRecentHistorySort, t, accessSummaryFailed])
  // #4498 — ce que la modale montre à l'ouverture : l'URL (axes serveur) + les deux critères jugés ici. Le
  // bouton « Ajouter un filtre » (`AddFilterButton`) a cédé la place à la modale « Filtrer mon portefeuille ».
  const dialogValues = useMemo<PortfolioFilterValues>(
    () => ({
      ...EMPTY_PORTFOLIO_FILTERS,
      ...portfolioFilters,
      accountType: accountTypeFilter,
      zone: zoneFilter,
      accessClass: effectiveAccessClassFilter,
    }),
    [portfolioFilters, accountTypeFilter, zoneFilter, effectiveAccessClassFilter],
  )
  // `onApplyPortfolioFilters` du parent n'écrit QUE dans l'URL : les deux critères jugés sur les lignes
  // chargées sont posés ICI, dans la même passe.
  const handleApplyPortfolioFilters = useCallback(
    (next: PortfolioFilterValues, options: { reset: boolean }) => {
      setAccessClassFilter(next.accessClass as AccessBarrierClass[])
      setAccountTypeFilter(next.accountType as PortfolioAccountType[])
      setZoneFilter(next.zone)
      onApplyPortfolioFilters?.(next, options)
    },
    [onApplyPortfolioFilters],
  )
  const filterBarActiveFilters = useMemo(() => {
    const withSort = hasRecentHistorySort
      ? [...activeFilters, { id: RECENT_HISTORY_FILTER_ID, value: RECENT_HISTORY_SORT_KEY }]
      : activeFilters
    const withType = [...withSort, ...accountTypeFilter.map(value => ({ id: ACCOUNT_TYPE_FILTER_ID, value }))]
    return [...withType, ...effectiveAccessClassFilter.map(value => ({ id: ACCESS_CLASS_FILTER_ID, value }))]
  }, [activeFilters, hasRecentHistorySort, effectiveAccessClassFilter, accountTypeFilter])
  const handleFilterBarChange = useCallback(
    (next: ActiveFilter[]) => {
      const nextFilters = next.filter(
        filter =>
          filter.id !== RECENT_HISTORY_FILTER_ID &&
          filter.id !== ACCESS_CLASS_FILTER_ID &&
          filter.id !== ACCOUNT_TYPE_FILTER_ID,
      )
      const stillHasRecentHistorySort = next.some(filter => filter.id === RECENT_HISTORY_FILTER_ID)

      if (hasRecentHistorySort && !stillHasRecentHistorySort) {
        onSortKeyChange(DEFAULT_SORT_KEY)
      }
      setAccessClassFilter(
        next.filter(filter => filter.id === ACCESS_CLASS_FILTER_ID).map(filter => filter.value as AccessBarrierClass),
      )
      setAccountTypeFilter(
        next.filter(filter => filter.id === ACCOUNT_TYPE_FILTER_ID).map(filter => filter.value as PortfolioAccountType),
      )

      onFiltersChange(nextFilters)
    },
    [hasRecentHistorySort, onFiltersChange, onSortKeyChange],
  )
  const handleFilterBarClear = useCallback(() => {
    if (hasRecentHistorySort) {
      onSortKeyChange(DEFAULT_SORT_KEY)
    }
    setAccessClassFilter([])
    setAccountTypeFilter([])
    onClearFilters()
  }, [hasRecentHistorySort, onClearFilters, onSortKeyChange])
  // L'état vide filtré NOMMAIT le geste (« réinitialise les filtres ») sans
  // jamais l'offrir : le texte décrivait une porte qui n'existait pas. Il
  // n'est proposé que s'il y a vraiment quelque chose à relâcher — un bouton
  // qui ne fait rien est pire qu'un texte nu.
  //
  // ⚠️ Le rangement du cycle commercial et le filtre d'accessibilité COMPTENT,
  // alors qu'aucun des deux n'a de pastille NATIVE dans la barre (le premier
  // n'en a AUCUNE, le second est intercepté avant d'y arriver). Les oublier
  // ici, c'est laisser l'écran sans aucune sortie sur ces deux axes.
  // #1580 — le filtre décisionnel du bandeau de tête COMPTE lui aussi comme
  // une restriction à offrir en sortie : sans lui, un portefeuille filtré par
  // le SEUL clic sur une métrique du bandeau afficherait « aucun résultat »
  // sans le moindre geste pour en sortir.
  const canClearFilters =
    activeFilters.length > 0 ||
    hasRecentHistorySort ||
    narrowing.lifecycle !== null ||
    clientNarrows ||
    headline !== undefined
  const accountsSidebarVariants = shouldReduceMotion
    ? {
        hidden: { opacity: 0, transform: 'translate3d(0, 0, 0) scale(1)' },
        visible: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        exit: { opacity: 0, transform: 'translate3d(0, 0, 0) scale(1)' },
      }
    : {
        hidden: { opacity: 0, transform: 'translate3d(16px, 0, 0) scale(0.985)' },
        visible: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        exit: { opacity: 0, transform: 'translate3d(12px, 0, 0) scale(0.99)' },
      }

  return (
    <Box className="flex min-h-full w-full flex-1 flex-col space-y-3">
      <AnimatePresence>
        {deleteConfirm && (
          <DeleteConfirmDialog
            isPending={deletingId === deleteConfirm}
            onConfirm={() => handleDelete(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {compareOpen && selectedAccounts.length >= 2 && (
          <CompareDialog accounts={selectedAccounts} onClose={() => onCompareOpenChange(false)} />
        )}
      </AnimatePresence>

      {/* #2157.4/.8 — la sélection de comptes propose « Créer une cible », une
          sélection MANUELLE de lignes (2157.8) sur la surface Comptes
          (2157.4). Le dialogue référence les comptes CANONIQUES, il n'en
          recopie aucun (même contrat que `target-lists`). */}
      <CreateTargetListFromSelectionDialog
        open={createTargetOpen}
        onOpenChange={setCreateTargetOpen}
        items={targetSelectionItems}
        onDone={handleClearSelection}
      />

      {/* #2293.2 — même moteur que « Approfondir cette réponse » depuis /chat
          (#2452), appliqué à l'axe Signaux sur la sélection de comptes. */}
      <RefreshSignalsDialog
        open={refreshSignalsOpen}
        onOpenChange={setRefreshSignalsOpen}
        accounts={selectedAccounts.map(account => ({ id: account.id, company_name: account.company_name }))}
        onDone={handleClearSelection}
      />

      {/* #2809 (#2293.2/.11, #2294.*) — même moteur, axe Contacts : le rejeu
          PAR SEGMENT (contacts seuls, jamais l'analyse entière) sur plusieurs
          comptes choisis, coût affiché avant tout débit. */}
      <RefreshContactsDialog
        open={refreshContactsOpen}
        onOpenChange={setRefreshContactsOpen}
        accounts={selectedAccounts.map(account => ({ id: account.id, company_name: account.company_name }))}
        onDone={handleClearSelection}
      />

      {/* #2809 (#2293.11, #2294.*) — découverte FRAÎCHE de contacts (personnes
          jamais collectées), distincte de `RefreshContactsDialog` ci-dessus. */}
      <DiscoverContactsDialog
        open={discoverContactsOpen}
        onOpenChange={setDiscoverContactsOpen}
        accounts={selectedAccounts.map(account => ({ id: account.id, company_name: account.company_name }))}
        onDone={handleClearSelection}
      />

      {/* #2809 (#2293.3) — source `portfolio` de `POST /analysis-batches` :
          lancer un lot d'analyse COMPLET (pas seulement l'axe Signaux) sur la
          sélection de comptes. */}
      <AnalyzeBatchDialog
        open={analyzeBatchOpen}
        onOpenChange={setAnalyzeBatchOpen}
        accounts={selectedAccounts.map(account => ({
          id: account.id,
          company_name: account.company_name,
          siren: account.siren,
        }))}
        onDone={handleClearSelection}
      />

      {/* Une seule vue : le portefeuille. Le cycle de vie est un filtre, pas un
          onglet (§20). La barre reste montée tant qu'il y a plus d'une entrée —
          si demain un vrai second axe apparaît, il retrouve sa place sans
          rebrancher le composant. */}
      {tabItems.length > 1 && (
        <Box display="flex" className={`items-center gap-1 pt-2 ${PAGE_GUTTER_X}`}>
          <TabNav
            tabs={tabItems}
            activeTab={activeTab}
            className="w-full"
            onTabChange={onTabChange}
            size="sm"
            variant="pill"
          />
        </Box>
      )}

      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
      >
        <AccountsToolbar
          leading={toolbarLeading}
          trailing={toolbarTrailing}
          search={query}
          onSearchChange={onQueryChange}
          onOpenFilters={() => setFiltersOpen(true)}
          activeFilterCount={countPortfolioFilters(dialogValues)}
          isSidebarVisible={isAccountsSidebarVisible}
          onToggleSidebar={() => setIsAccountsSidebarVisible(visible => !visible)}
        />
      </motion.div>

      <AccountsFiltersDialog
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        values={dialogValues}
        onApply={handleApplyPortfolioFilters}
        sectors={sectors}
        tags={tags}
        zones={zoneOptions}
        accessClassAvailable={!accessSummaryFailed}
      />
      <FilterBar
        definitions={filterBarDefinitions}
        active={filterBarActiveFilters}
        onChange={handleFilterBarChange}
        onClear={handleFilterBarClear}
        className={PAGE_GUTTER_X}
      />

      {/* D616 — le filtre « Accessibilité » disparaît du menu « Ajouter un
          filtre » pendant une panne (voir `filterBarDefinitions`), et cette
          disparition SEULE ne dirait rien à qui ne remarque pas une entrée
          absente. La raison se lit ici, à l'endroit où le filtre aurait
          normalement une chip. */}
      {accessSummaryFailed && (
        <Text size="xs" className={`block text-[var(--bellum-text-muted)] ${PAGE_GUTTER_MX}`}>
          {t('filters.accessClassFilterUnavailable')}
        </Text>
      )}

      {/* #4127 — le bandeau « État du portefeuille » est SUPPRIMÉ (Louis 13/10 :
          « il ne sert à rien »), et revient délibérément sur #4087.1 (bandeau
          compacté). Le conteneur part avec lui : il n'existe que s'il porte
          quelque chose — la sortie de vue restreinte (GA-107) ou la lentille. */}
      {(narrowing.active || (onDeliveryLensChange && !lensToggleInHead)) && (
        <Box className={`flex flex-wrap items-center justify-between gap-2 ${PAGE_GUTTER_MX}`}>
          <PortfolioExitLink narrowed={narrowing.active} />
          {onDeliveryLensChange && !lensToggleInHead && (
            <AccountsLensToggle
              deliveryLens={deliveryLens}
              onChange={onDeliveryLensChange}
              className="mt-0 ml-auto shrink-0"
            />
          )}
        </Box>
      )}

      {/* LE BANDEAU À SIX TUILES (maquette 11, 31/08/2026), et seulement quand
          la lentille de facturation est posée : sous l'angle commercial, la
          facturation n'a rien à dire. Chaque tuile porte SON périmètre —
          l'espace ou la page — parce que cette liste est paginée et qu'un total
          dérivé des lignes chargées grandirait en défilant.

          ⚠️ Le conteneur suit la CONDITION depuis le 06/09 : il restait monté
          sous l'angle commercial, où il ne portait plus rien depuis que la
          lentille est remontée d'une ligne — une boîte vide avec sa gouttière,
          c'est-à-dire des pixels d'entête que personne ne peut voir. */}
      {onDeliveryLensChange && deliveryLens && (
        <Box className={`flex flex-col gap-2 ${PAGE_GUTTER_MX}`}>
          <AccountsBillingCounters accountIds={visibleAccountIds} followed={counters?.followed} />
        </Box>
      )}

      {loading ? (
        <AccountsTableSkeleton />
      ) : failed ? (
        // Les filtres sont CONSERVÉS : c'est ce que le §3.5 demande, et c'est ce
        // qui évite de refaire trois clics après une coupure réseau.
        <EmptyState
          size="md"
          align="center"
          icon={<TriangleAlert className="h-10 w-10" />}
          title={t('loadError.title')}
          description={t('loadError.description')}
          action={
            <Button size="sm" variant="default" onClick={onRetry}>
              {t('loadError.retry')}
            </Button>
          }
        />
      ) : visibleAccounts.length === 0 ? (
        /* ⚠️ LA BASCULE. Deux états vides très différents vivent dans ce
           fichier, et c'est CETTE condition qui décide lequel s'affiche. Le
           30/08/2026 en production, elle a rendu « tu n'as encore rien
           analysé » à quelqu'un qui avait 24 comptes, parce qu'elle ne
           regardait que la barre de filtres. Elle lit maintenant la
           dérivation ÉTENDUE (`effectiveNarrowingActive`), qui compte AUSSI
           la restriction invisible ET le filtre d'accessibilité CLIENT
           (manque B) — sans quoi une classe qui ne rend rien afficherait un
           tableau vide sans aucun état vide. */
        effectiveNarrowingActive ? (
          emptyAction.kind === 'analyse' ? (
            /* #1134 : cette liste cherche dans le PORTEFEUILLE, pas dans le monde → on propose d'analyser. #4621 : un
               compte ARCHIVÉ est écarté de la recherche (#4053) ; l'écran le DIT avant de proposer une analyse payante. */
            <NotInPortfolioEmptyState company={emptyAction.company} onShowArchived={() => onTabChange('archived')} />
          ) : emptyAction.kind === 'namedFilter' ? (
            /* Manque C du 30/08, généralisé : UN SEUL axe de restriction actif
               — pastille de la barre, rangement du cycle commercial, ou
               accessibilité — se NOMME, et son geste de sortie se retire
               SEUL. Jamais le message générique du portefeuille filtré :
               « cassé et non mesurable se ressemblent », ici en version « un
               filtre nommé et un filtre tu se ressemblent ». */
            <SearchEmptyState
              title={t('emptyFiltered.title')}
              description={namedFilterDescription(t, filterBarDefinitions, emptyAction.axis)}
              action={
                <Button type="button" size="sm" variant="default" onClick={handleFilterBarClear}>
                  {t('emptyFiltered.removeFilter')}
                </Button>
              }
            />
          ) : (
            <SearchEmptyState
              title={t('emptyFiltered.title')}
              /* PLUSIEURS axes actifs à la fois : on ne sait plus dire LEQUEL
                 retirer isolément — le message générique reste le bon. */
              description={t('emptyFiltered.description')}
              action={
                canClearFilters ? (
                  <Button type="button" size="sm" variant="default" onClick={handleFilterBarClear}>
                    {t('emptyFiltered.resetFilters')}
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <AccountsEmpty />
        )
      ) : (
        <>
          <motion.div
            layout
            transition={{ layout: layoutTransition }}
            /* #1316.1 — « peu de comptes visibles dans le tableau ».
               ⚠️ Retirer le `overflow-y-auto` du tableau NE SUFFISAIT PAS, et je
               l'ai cru corrigé à tort : `overflow-x-auto` force `overflow-y` à
               `auto` en CSS, et toute cette chaîne était en `flex-1 min-h-0`
               — « je tiens dans l'écran » —, si bien que le tableau absorbait
               tout le débordement. Mesuré : 339 px visibles pour 2 156 de
               contenu, dans une fenêtre de 861.

               `min-h-0` part : la colonne prend sa hauteur naturelle, le
               débordement remonte à la page, et il n'y a plus qu'UN ascenseur
               vertical. Le tableau garde son défilement HORIZONTAL, qui est
               légitime (largeur plancher, D81). */
            className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-stretch"
          >
            <motion.div layout transition={{ layout: layoutTransition }} className="flex min-w-0 flex-1 flex-col">
              {/* Ce que les LIGNES ne peuvent pas dire.
                  La pastille « à programmer » se tait sur un compte non lu —
                  cinquante « non mesuré » alignés ne se lisent plus. Mais une
                  liste sans aucune marque se lirait « tout est propre », qui est
                  le mensonge le plus cher de ce chantier. La phrase le dit donc
                  UNE fois, ici, et seulement quand il y a quelque chose à dire :
                  muette dès que la lecture est complète. */}
              <AccountsNextActionScopeNotice className={`mb-2 ${PAGE_GUTTER_MX}`} />
              {/* DEUX FORMES, UN SEUL MODÈLE DE DONNÉES (maquette 11,
                  31/08/2026). L'angle COMMERCIAL garde le tableau : score,
                  effectif, prochaine action se COMPARENT d'une ligne à l'autre,
                  et c'est ce qu'un tableau sait faire. L'angle FACTURATION rend
                  des CARTES : raison sociale, SIREN, conformité, geste attendu
                  se lisent ENSEMBLE sur un compte à la fois, et ne se comparent
                  pas verticalement. Mêmes lignes, mêmes filtres, même
                  pagination — seule la mise en page change. */}
              {deliveryLens ? (
                <AccountsBillingCardList rows={visibleAccounts} />
              ) : viewMode === 'grid' ? (
                <AccountsCardGrid rows={visibleAccounts} />
              ) : (
                <AccountsTable
                  rows={visibleAccounts}
                  onDelete={id => setDeleteConfirm(id)}
                  onArchive={id => archiveAccount.mutate(id)}
                  archivingId={archivingId}
                  sortKey={sortKey}
                  onSortKeyChange={onSortKeyChange}
                  selectedIds={selectedIds}
                  onSelectionChange={handleSelectionChange}
                  onToggleAll={handleToggleAll}
                />
              )}
              {listFooter}
              <div ref={loadMoreRef} className="py-4 text-center text-sm text-muted-foreground">
                {loadingMore ? (
                  <BrailleLoader
                    variant="grid-searching"
                    dotSize={3}
                    className="mx-auto text-[var(--bellum-text-accent)]"
                  />
                ) : null}
              </div>
              {/* Recette démo 05/10/2026 : « 0 opportunité à fort potentiel » + un bouton vers une liste vide.
                  Sans opportunité, pas d'encart (on n'affiche pas ce qu'on n'a pas). */}
              {completedCount > 0 && opportunityCount > 0 && (
                <motion.div
                  layout
                  transition={{ layout: layoutTransition }}
                  className={cn('mt-auto mb-16', activeFilters.length > 0 ? 'lg:mb-0' : '')}
                >
                  <OpportunityBanner
                    completedCount={completedCount}
                    opportunityCount={opportunityCount}
                    onView={() => onTabChange('opportunity')}
                  />
                </motion.div>
              )}
            </motion.div>
            <AnimatePresence initial={false}>
              {isAccountsSidebarVisible && (
                <motion.div
                  key="accounts-sidebar"
                  layout
                  variants={accountsSidebarVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  transition={{
                    opacity: { duration: shouldReduceMotion ? 0.12 : 0.18, ease: easeOut },
                    transform: { duration: shouldReduceMotion ? 0 : 0.24, ease: easeOut },
                    layout: layoutTransition,
                  }}
                  className="mr-5 w-full shrink-0 lg:w-auto"
                >
                  <AccountsSidebar
                    accounts={visibleAccounts}
                    showRecentAccounts={sortKey !== 'date_asc'}
                    onViewHistory={() => {
                      onTabChange('all')
                      onSortKeyChange('date_asc')
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      <AnimatePresence>
        {selectedIds.size >= 2 && (
          <SelectionBar
            count={selectedIds.size}
            onCompare={() => onCompareOpenChange(true)}
            onCreateTarget={() => setCreateTargetOpen(true)}
            onRefreshSignals={() => setRefreshSignalsOpen(true)}
            onRefreshContacts={() => setRefreshContactsOpen(true)}
            onDiscoverContacts={() => setDiscoverContactsOpen(true)}
            onAnalyzeBatch={() => setAnalyzeBatchOpen(true)}
            onPushToCrm={() => setCrmPushOpen(true)}
            onClear={handleClearSelection}
          />
        )}
      </AnimatePresence>
      {/* #4188 — l'envoi EN LOT des comptes sélectionnés vers le CRM branché. */}
      <CrmPushDialog
        open={crmPushOpen}
        onOpenChange={setCrmPushOpen}
        selection={{ accountIds: [...selectedIds], contactIds: [] }}
      />
    </Box>
  )
}
