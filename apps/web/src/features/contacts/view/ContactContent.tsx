import {
  AddFilterButton,
  Box,
  BrailleLoader,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterBar,
  Sheet,
  SheetContent,
  SheetTitle,
  TabNav,
  type ActiveFilter,
  type FilterDefinition,
  type TabNavItem,
  MOTION,
} from '@bellum/ui'
import { CONTACTS_FILTERS_PANEL_ID } from './contacts-filters-panel-id'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { motion } from 'framer-motion'
import {
  contactFamilySchema,
  IMPORT_SOURCE_VALUE,
  MON_CRM_SOURCE_FILTER,
  type ContactChannelTally,
  contactStatusSchema,
  groupByContactView,
  HIERARCHY_LEVELS,
  INTERACTION_ACTIVITY_KINDS,
  type BulkEnrichmentExclusionReason,
  type Contact,
  type ContactLifecycleState,
  type ContactLifecycleTally,
  type ContactRecommendedTally,
  type ContactStatus,
  type EnrichmentCoordinate,
  type TargetList,
} from '@bellum/contracts'
import {
  Briefcase,
  Building2,
  CalendarX,
  Clock,
  Crosshair,
  History,
  Layers,
  Mail,
  MapPin,
  MessageSquareReply,
  Network,
  Radar,
  RefreshCw,
  Rows3,
  Rows4,
  Tag,
  TrendingUp,
  User,
  UserPlus,
} from 'lucide-react'
import type { WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import {
  type MouseEvent,
  type ReactNode,
  type RefCallback,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { toast } from 'sonner'
import { runEnrichmentBatch } from '@/features/contacts/lib/enrichBatchRunner'
import { beginCriticalOperation } from '@/lib/critical-operation-guard'
import { i18n } from '@/i18n'
import { useContactEngagement } from '@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext'
import type { EngagementChannel } from '@/features/accounts/view/account-detail/components/contact-engagement/types'
import { PersonalContactsSection } from '@/features/accounts/view/account-detail/tabs/contacts/PersonalContactsSection'
import { useAccountCompanies } from '@/features/accounts/hooks/useAccountFacets'
import { useTargetLists } from '@/features/target-lists/api'
import { sourceFilterOptions } from '@/features/contacts/lib/sourceFilterOptions'
import { contactsPagerOf } from '@/features/contacts/lib/contactsPager'
import { EnrichConfirmDialog, type EnrichmentScope } from '@/features/contacts/components/EnrichConfirmDialog'
import { EnrichmentInFlightLine } from '@/features/contacts/components/EnrichmentInFlightLine'
import { EnrichmentBatchResultDialog } from '@/features/contacts/components/EnrichmentBatchResultDialog'
import { onCooldownCount, planBulkEnrichment } from '@/features/contacts/lib/enrichBilling'
import { bulkEnrichmentSummaryOf, type BulkEnrichmentOutcome } from '@/features/contacts/lib/enrichSummary'
import {
  classifyEnrichmentError,
  classifyEnrichmentOutcome,
  type ContactEnrichmentOutcomeRow,
} from '@/features/contacts/lib/enrichmentOutcomeStatus'
import { ExecuteActionDialog } from '@/features/actions/components/ExecuteActionDialog'
import { ExportSheetButton } from '@/features/google/components/ExportSheetButton'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAddContactsToPlan } from '@/features/contacts/hooks/useAddContactsToPlan'
import { useAssignContacts } from '@/features/contacts/hooks/useAssignContacts'
import type { ContactScope } from '@/features/contacts/hooks/useContactsNavigation'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { useBulkVerifyContacts } from '@/features/contacts/hooks/useBulkVerifyContacts'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { toEngagementContact } from '@/features/contacts/lib/toEngagementContact'
import { ROLE_FILTERS, getRoleLabel } from '@/lib/contactRoles'
import { BulkEmailReviewDialog } from './contacts-list/BulkEmailReviewDialog'
import { PrepareContactsEmailDialog } from './contacts-list/PrepareContactsEmailDialog'
import { CreateSequenceDialog } from '@/features/outreach/view/CreateSequenceDialog'
import { ContactsEmpty } from './contacts-list/ContactsEmpty'
import { useContactStats } from '@/features/contacts/hooks/useContactStats'
import { useContactTags } from '@/features/contacts/hooks/useContactTags'
import { ContactsLifecycleFilter, type LifecycleFilterValue } from './contacts-list/ContactsLifecycleFilter'
import {
  ContactSelectionPanel,
  type ContactAssignTarget,
  type ContactSelectionAction,
  type ContactSelectionBusyAction,
} from './contacts-list/ContactSelectionPanel'
import { ContactsTable } from './contacts-list/ContactsTable'
import { ContactsSelectionBar } from './contacts-list/ContactsSelectionBar'
import { ContactsListBanner } from './contacts-list/ContactsListBanner'
import { ContactsQuickChips } from './contacts-list/ContactsQuickChips'
import { ContactsAccountSelect } from './contacts-list/ContactsAccountSelect'
import { ContactsStateBox } from './contacts-list/ContactsStateBox'
import { SelectionReviewDialog } from './contacts-list/SelectionReviewDialog'
import {
  readInitialSelection,
  useContactsWorkStatePersistence,
} from '@/features/contacts/selection/useContactsWorkStatePersistence'
import { useSelectAllResults } from '@/features/contacts/selection/useSelectAllResults'
import { CrmPushDialog } from '@/features/crm/view/CrmPushDialog'
import { useDataExit } from '@/lib/data-exit'
import { CreateTargetListDialog } from './contacts-list/CreateTargetListDialog'
import { ContactsViewChips, type ContactViewFilterValue } from './contacts-list/ContactsViewChips'
import { ContactsRecommendedToggle, type RecommendedFilterValue } from './contacts-list/ContactsRecommendedToggle'
import { ContactsZoneSortToggle } from './contacts-list/ContactsZoneSortToggle'
import { ContactsTableSkeleton } from './contacts-list/ContactsTableSkeleton'
import { AskLaura } from '@/components/primitives/AskLaura'
import { listedDoNotContact } from '@/features/team-guardrails/components/DoNotContactBadge'
import { useDoNotContactList } from '@/features/team-guardrails/hooks'
import { useCompactContactsList } from '@/features/contacts/hooks/useCompactContactsList'
import { ContactsToolbar } from './contacts-list/ContactsToolbar'
import { countActiveContactFilters } from '@/features/contacts/hooks/useContactsActiveFilterCount'
import { ContactsFiltersTrigger } from './contacts-list/ContactsFiltersTrigger'
import { networkCountsOf } from '@/features/contacts/lib/networkCounts'
import { useCrmStatus } from '@/features/crm/hooks/useCrmStatus'
import { crmNameOf } from '@/features/crm/lib/crmName'
import { ContactsNetworkOverview, type NetworkChannel } from './contacts-list/ContactsNetworkOverview'
import { capitalize } from '@bellum/utils'

type SelectionDragState = {
  active: boolean
  selected: boolean
}

/** J1b #3822 — sous la concurrence du worker (4) : un lot ne monopolise pas la file. */
const BULK_ENRICH_CONCURRENCY = 3
/** Un peu plus que le plafond de suivi d'un contact (150 s) : jamais un contact qui gèle le lot. */
const BULK_ENRICH_ITEM_TIMEOUT_MS = 170_000

/** Un enrichissement ANNONCÉ et pas encore accepté — voir `pendingEnrich`. */
type PendingEnrich = {
  /** Le plan de facturation : ce qui est annoncé, et donc ce qui partira. */
  contacts: readonly GlobalContact[]
  /** Le canal à ouvrir une fois l'enrichissement fini. `null` ⇒ n'ouvre rien. */
  channel: EngagementChannel | null
  /** Ceux qui ont DÉJÀ ce canal : ouverts avec les récupérés, jamais enrichis. */
  readyContacts: readonly Contact[]
  /** #2297.25/#2297.26 — pourquoi le reste de la sélection n'est pas dans `contacts`. */
  excluded: readonly { reason: BulkEnrichmentExclusionReason; count: number }[]
}

/**
 * Construit la liste des filtres. `company` est dynamique — alimenté
 * par `useAccountCompanies` (distinct des `account.company_name` du user).
 * `members` (#2158.65) vient de `GET /workspaces/members` — jamais un
 * annuaire fabriqué, la MÊME source que « Assigner à ».
 */
function buildContactsFilters(
  companies: string[],
  tags: string[],
  members: readonly WorkspaceMember[],
  targetLists: readonly TargetList[],
  monCrm: { label: string; shown: boolean },
  t: TFunction<'contacts'>,
): FilterDefinition[] {
  return [
    {
      id: 'role',
      label: t('list.filterRole'),
      icon: User,
      options: ROLE_FILTERS.filter(r => r !== 'all').map(r => ({ value: r, label: getRoleLabel(r) })),
    },
    {
      id: 'company',
      label: t('list.filterCompany'),
      icon: Building2,
      options: companies.map(c => ({ value: capitalize(c), label: capitalize(c) })),
    },
    {
      // Le RÉSEAU DORMANT (tome 1 §11.4). « Ses deux premières affaires ne
      // viennent d'aucun signal » — elles viennent d'une copine et du réseau de
      // son associé, et le produit ne regardait jamais là.
      id: 'dormant',
      label: t('list.filterDormant'),
      icon: Clock,
      options: [
        { value: '6', label: t('list.dormantMonths', { count: 6 }) },
        { value: '12', label: t('list.dormantMonths', { count: 12 }) },
        { value: '24', label: t('list.dormantMonths', { count: 24 }) },
      ],
    },
    // #2158.67 — la FRAÎCHEUR de la fiche (`contact.updated_at`), distincte
    // du réseau dormant (dernier ÉCHANGE) : ici, la dernière mise à jour de
    // la fiche elle-même (import, enrichissement, correction manuelle).
    {
      id: 'updatedWithin',
      label: t('list.filterUpdatedWithin'),
      icon: RefreshCw,
      options: [
        { value: '3', label: t('list.updatedWithinMonths', { count: 3 }) },
        { value: '6', label: t('list.updatedWithinMonths', { count: 6 }) },
        { value: '12', label: t('list.updatedWithinMonths', { count: 12 }) },
      ],
    },
    {
      id: 'channel',
      label: t('list.filterChannel'),
      icon: Mail,
      options: [
        { value: 'with_email', label: t('list.channelWithEmail') },
        { value: 'with_linkedin', label: t('list.channelWithLinkedin') },
        { value: 'with_both', label: t('list.channelWithBoth') },
        // L'inverse utile : la tuile « coordonnées à compléter » annonçait un
        // nombre sans aucun chemin vers la liste correspondante.
        { value: 'missing_details', label: t('list.channelMissingDetails') },
        // #2167.51 — recette E2E « cinq contacts avec email ET téléphone » :
        // aucune variante téléphone n'existait, un canal direct l'ajoute.
        { value: 'with_phone', label: t('list.channelWithPhone') },
      ],
    },
    // #2159.26 — les ÉTIQUETTES en usage (import CRM, fichier). Les options
    // viennent de `GET /contacts/tags` : jamais une étiquette que personne ne
    // porte.
    { id: 'tag', label: t('list.filterTag'), icon: Tag, options: tags.map(tag => ({ value: tag, label: tag })) },
    // #2158.61 — la ville/le pays (`contact.location`, ILIKE, comme
    // `company`). Texte libre et non une liste fermée : aucun endpoint
    // « valeurs distinctes » n'existe pour cette colonne, et une ville a trop
    // de graphies pour une liste. Ville et pays sont les deux SEULES
    // exceptions nommées à l'interdit des critères protégés (doctrine c58).
    {
      id: 'location',
      label: t('list.filterLocation'),
      icon: MapPin,
      type: 'text',
      placeholder: t('list.filterLocationPlaceholder'),
    },
    // #2158.65 — le PORTEUR du contact. Options venues des membres RÉELS de
    // l'espace, jamais un annuaire fabriqué (même source que « Assigner à »,
    // `ContactSelectionPanel`).
    {
      id: 'assignedTo',
      label: t('list.filterOwner'),
      icon: UserPlus,
      options: members.map(member => ({
        value: member.userId,
        label: member.fullName ?? member.email ?? t('selection.assign.memberFallback'),
      })),
    },
    // #2158.60 — la FAMILLE MÉTIER (`contact.family`). Taxonomie FERMÉE
    // (`contactFamilySchema`) : les valeurs sont déjà le libellé affiché
    // (« IT », « C-Level »…), même convention que `ImportContactsDialog`
    // (aucune traduction par valeur — ce sont des sigles/noms propres).
    {
      id: 'family',
      label: t('list.filterFamily'),
      icon: Layers,
      options: contactFamilySchema.options.map(family => ({ value: family, label: family })),
    },
    // #2158.59 — le NIVEAU (`computeHierarchyLevel(contact.title)`, taxonomie
    // FERMÉE). Mêmes libellés que la colonne « Niveau » du tableau
    // (`ContactTableRow.tsx`, clés `hierarchy.*`) — un réglage vit à un seul
    // endroit (GA-26), jamais un second jeu de libellés pour la même valeur.
    // `unknown` réutilise `hierarchy.unknownReason` : c'est la seule phrase
    // qui existe pour ce palier, la colonne ne lui donne pas de libellé court.
    {
      id: 'hierarchyLevel',
      label: t('list.filterHierarchyLevel'),
      icon: TrendingUp,
      options: HIERARCHY_LEVELS.map(level => ({
        value: level,
        label: level === 'unknown' ? t('hierarchy.unknownReason') : t(`hierarchy.${level}`),
      })),
    },
    // #2158.57 — l'ENTITÉ déclarée (`contact.entity`, ILIKE, comme `location`).
    // Texte libre et non une liste fermée : aucun endpoint « valeurs
    // distinctes » n'existe pour cette colonne (à la différence de `company`).
    {
      id: 'entity',
      label: t('list.filterEntity'),
      icon: Network,
      type: 'text',
      placeholder: t('list.filterEntityPlaceholder'),
    },
    // #2158.58 — la FONCTION (`contact.title`, ILIKE), distincte de la
    // recherche libre `q` : chercher « DSI » via `q` remonte aussi toute
    // société/email/téléphone contenant la chaîne.
    {
      id: 'title',
      label: t('list.filterTitle'),
      icon: Briefcase,
      type: 'text',
      placeholder: t('list.filterTitlePlaceholder'),
    },
    // #2158.68 — LA CIBLE (`target_list_items.contact_id`). Options venues
    // des listes RÉELLES de l'espace (`useTargetLists`, même source que
    // « Créer une cible » / « Mes cibles »), jamais un annuaire fabriqué.
    {
      id: 'targetListId',
      label: t('list.filterTargetList'),
      icon: Crosshair,
      options: targetLists.map(list => ({ value: list.id, label: list.name })),
    },
    // #2158.66 — la SOURCE (`contact.source`). Taxonomie FERMÉE
    // (`contactSourceSchema`), mais ⚠️ DISTINCTE de `family` : les valeurs
    // brutes SONT des noms de fournisseurs (apollo, pappers, hunter…), qui ne
    // se nomment JAMAIS à l'écran (doctrine « nos fournisseurs ne se nomment
    // jamais »). `contactSourceLabel` — déjà le libellé de la colonne Source
    // et de la frise du cycle de vie — fournit le même libellé anonymisé ici,
    // pour que la même source se lise pareil partout (GA-26).
    {
      id: 'source',
      label: t('list.filterSource'),
      icon: Radar,
      // #4526.4 / #4526.9 — « Mon CRM » : même valeur et même libellé que la puce, absent quand il ne rend rien.
      options: sourceFilterOptions(monCrm),
    },
    // #2158.14 (#2997) — la vue « Sans prochaine action » demandée, posée en
    // FILTRE (la partition de vues reste fermée à 5). Présent-ou-absent,
    // comme `unassigned` : une seule option, jamais un booléen à deux faces.
    {
      id: 'withoutNextAction',
      label: t('list.filterWithoutNextAction'),
      icon: CalendarX,
      options: [{ value: 'true', label: t('list.filterWithoutNextActionOption') }],
    },
    // #2158.69 (#2997) — la NATURE de la dernière activité échangée
    // (`activities.kind`, borné sur la ligne la plus récente), distincte de
    // `dormant` (l'ancienneté). Même périmètre que `INTERACTION_ACTIVITY_KINDS` :
    // jamais une note ou un changement d'étape, seulement un échange réel.
    {
      id: 'lastActivityKind',
      label: t('list.filterLastActivityKind'),
      icon: History,
      options: INTERACTION_ACTIVITY_KINDS.map(kind => ({
        value: kind,
        label: t(`list.lastActivityKindOption.${kind}`),
      })),
    },
    // #3718 — le STATUT déclaré du contact (`contacts.user_status`) : « Répondu »
    // rend « Traiter la réponse » atteignable sans ouvrir les fiches une à une.
    {
      id: 'userStatus',
      label: t('list.filterUserStatus'),
      icon: MessageSquareReply,
      options: contactStatusSchema.options.map(status => ({
        value: status,
        label: t(`list.userStatusOption.${status}`),
      })),
    },
  ]
}

type ContactsProps = {
  contacts: GlobalContact[]
  /** Total workspace du jeu filtré (`pagination.totalItems`) — PAS `contacts.length`,
   *  qui ne vaut que les pages déjà chargées. `undefined` = pas mesuré
   *  (chargement ou échec), jamais `0`. */
  totalContacts: number | undefined
  /** Compteurs par état sur tout le jeu filtré (agrégat serveur), ou `undefined`
   *  si l'agrégat n'est pas disponible : on n'affiche alors aucun compteur. */
  lifecycleTally: ContactLifecycleTally | undefined
  /** Pastille sélectionnée (search param `state`), `undefined` = "Tous". */
  stateFilter: ContactLifecycleState | undefined
  onLifecycleFilterChange: (next: LifecycleFilterValue) => void
  /**
   * #2158.6 — la vue sélectionnée (search param `view`), pour qu'un lien
   * direct (le CTA d'en-tête « Traiter les contacts prêts ») ait quelque
   * chose à cibler. `undefined` ⇒ pas de préférence explicite dans l'URL :
   * la vue retombe sur « à contacter » (#2158.72), jamais « Toutes ».
   * Optionnels : les présentateurs existants qui ne branchent pas encore
   * l'URL (tests, appelants antérieurs à ce lot) gardent leur comportement.
   */
  viewFilter?: ContactViewFilterValue
  onViewChange?: (next: ContactViewFilterValue) => void
  loading: boolean
  query: string
  onQueryChange: (next: string) => void
  activeFilters: ActiveFilter[]
  onFiltersChange: (next: ActiveFilter[]) => void
  onAddFilter: (filterId: string, value: string) => void
  /** #1473 — portée « à qualifier » : les contacts sans entreprise connue. */
  unassignedFilter: boolean | undefined
  onScopeChange: (next: ContactScope) => void
  onClearFilters: () => void
  isFilterActive: boolean
  loadingMore?: boolean
  hasNextPage?: boolean
  onLoadMore?: () => void
  /** #3701.3 — charge la page suivante ET rend les lignes cumulées (« Tous les résultats »). */
  onLoadNextPageRows?: () => Promise<{ rows: GlobalContact[]; hasNextPage: boolean; failed: boolean }>
  error?: boolean
  loadMoreRef?: RefCallback<HTMLDivElement>
  /**
   * #3376 — la section « Filtres » n'a plus son propre bouton d'en-tête : le
   * déclencheur vit désormais dans `ContactsIntro`, à gauche du CTA
   * « Traiter » (même `CONTACTS_FILTERS_PANEL_ID`). Cet état, et lui seul,
   * pilote son ouverture (`CollapsedSection` en mode `hideTrigger`).
   * Facultatifs (défaut : repliée, `useState(false)`-like) — les nombreux
   * tests qui montent `ContactContent` pour un tout autre geste n'ont pas à
   * le savoir.
   */
  filtersOpen?: boolean
  onFiltersOpenChange?: (open: boolean) => void
  /** #3471 — annonce au parent qu'une sélection (donc le panneau fixe à droite) existe : l'en-tête de page, frère de ce composant, réserve alors sa largeur. */
  onSelectionActiveChange?: (active: boolean) => void
  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : la portée « Recommandés »
   * vient désormais du PARENT (la liste `contacts` reçue est déjà filtrée
   * côté serveur, paginée sur ce chemin), jamais recalculée ici — ce
   * composant reste le présenteur stateless qu'il prétend être (ligne
   * ci-dessus). Facultatifs, défaut = comportement d'avant ce lot : les
   * nombreux tests qui montent `ContactContent` pour un tout autre geste
   * n'ont pas à le savoir.
   */
  recommendedFilter?: RecommendedFilterValue
  /** #4597.3 — la liste est ouverte sur UN import précis (lien « voir les N contacts ») ; la puce le dit et le relâche. */
  importJobActive?: boolean
  onClearImportJob?: () => void
  onRecommendedFilterChange?: (next: RecommendedFilterValue) => void
  /** #4982.1 — le tri « zone » (proche d'abord, fait en SQL) et son regroupement par ville (#4982.2). */
  zoneSort?: boolean
  onZoneSortChange?: (next: boolean) => void
  /** Le compteur « Recommandés X / Tous Y », voir `useContactsListData.recommendedTally`. */
  recommendedTally?: ContactRecommendedTally
  /** #4527.1 — les chiffres des tuiles et de la puce Mon CRM, comptés par l'API. */
  channelTally?: ContactChannelTally
  /** Théo B c1-repertoire — l'en-tête de l'écran, rendu ICI pour que « Demander à Laura » y porte le contexte filtré. */
  renderIntro?: (askLaura: ReactNode) => ReactNode
  /** « Réessayer » sur l'état d'erreur de la première page. */
  onRetry?: () => void
}

/** Théo B c1-repertoire.R12 — 25 lignes par page, comme la maquette. */
const CONTACTS_PAGE_SIZE = 25

/** Présenteur stateless — tous les filtres viennent du parent (URL → API). */
export function ContactContent({
  contacts,
  totalContacts,
  lifecycleTally,
  stateFilter,
  onLifecycleFilterChange,
  viewFilter: viewFilterFromUrl,
  onViewChange,
  loading,
  query,
  onQueryChange,
  activeFilters,
  onFiltersChange,
  onAddFilter,
  unassignedFilter,
  onScopeChange,
  onClearFilters,
  isFilterActive,
  loadingMore = false,
  hasNextPage = false,
  onLoadMore,
  onLoadNextPageRows,
  error = false,
  loadMoreRef,
  filtersOpen = false,
  onFiltersOpenChange = () => {},
  onSelectionActiveChange,
  // #3942.2 — défaut `'all'` (neutre), PAS `'recommended'` : le défaut PRODUIT
  // vit chez l'appelant réel (`ContactsPageContent`), qui le passe
  // explicitement. Un présenteur stateless ne doit pas imposer un filtre que
  // l'appelant n'a pas demandé — les nombreux tests qui montent
  // `ContactContent` sans connaître ce geste gardent leur état vide générique.
  recommendedFilter = 'all',
  importJobActive = false,
  onClearImportJob = () => {},
  onRecommendedFilterChange = () => {},
  zoneSort = false,
  onZoneSortChange = () => {},
  recommendedTally,
  channelTally,
  renderIntro,
  onRetry,
}: ContactsProps) {
  const { t } = useTranslation('contacts')
  const { openEngagement } = useContactEngagement()
  const { data: companies = [] } = useAccountCompanies()
  // Vélocité d'acquisition (« +120 cette semaine ») : seule info que portaient
  // les anciennes cartes du haut, désormais reléguée sur le funnel — le reste
  // de ces cartes redisait les extrémités du funnel (détectés / prêts).
  const { data: contactStats } = useContactStats()
  const enrichMutation = useEnrichContact()
  // J1b #3822 — l'arrêt du lot (écran quitté) et la relance des « non traités ».
  const batchAbortRef = useRef<AbortController | null>(null)
  const relaunchEnrichRef = useRef<
    ((contacts: readonly GlobalContact[], scope?: EnrichmentScope) => Promise<Contact[]>) | null
  >(null)
  useEffect(() => () => batchAbortRef.current?.abort(), [])
  // #2964 (#2296.38-.41) — vérification FORCÉE de la sélection.
  const verifyMutation = useBulkVerifyContacts()
  // Actions de MASSE du panneau de sélection : répartir entre commerciaux, et
  // verser au plan d'action. Les membres viennent de `GET /workspaces/members`
  // (la même source que « Assigner à » côté actions) — jamais d'annuaire fabriqué.
  const { data: workspaceMembers = [] } = useWorkspaceMembers()
  const assignMutation = useAssignContacts()
  const addToPlanMutation = useAddContactsToPlan()
  const { data: tags = [] } = useContactTags()
  // #2158.68 — les listes RÉELLES de l'espace, même source que « Créer une
  // cible » / « Mes cibles » (jamais un annuaire fabriqué).
  const { data: targetLists = [] } = useTargetLists()
  const crmStatus = useCrmStatus()
  const monCrmLabel = crmNameOf(crmStatus.data) ?? t('quickChips.monCrm')
  const monCrmFilterShown =
    Boolean(channelTally?.monCrm) ||
    activeFilters.some(filter => filter.id === 'source' && filter.value === MON_CRM_SOURCE_FILTER)
  const filterDefinitions = useMemo(
    () =>
      buildContactsFilters(
        companies,
        tags,
        workspaceMembers,
        targetLists,
        { label: monCrmLabel, shown: monCrmFilterShown },
        t,
      ),
    [companies, tags, workspaceMembers, targetLists, monCrmLabel, monCrmFilterShown, t],
  )
  // #1473 — deux portées. « À qualifier » est un onglet et non une puce de la
  // barre de filtres : c'est une FILE de travail, avec un geste attaché
  // (rattacher l'entreprise), pas un critère de recherche. Sans elle, un
  // contact sans société est introuvable — la recherche texte porte sur le nom
  // de l'entreprise, donc elle ne peut pas le ramener.
  //
  // ⚠️ #1800 (09/09/2026) — l'onglet « Favoris » a été retiré (retour Louis,
  // « supprime la notion de favori »). « À qualifier » reste inchangé : Louis a
  // nommé les favoris, pas leur cousin.
  const contactScopeTabs: TabNavItem[] = useMemo(
    () => [
      { key: 'all', label: t('list.tabAll') },
      { key: 'unassigned', label: t('list.tabUnassigned') },
    ],
    [t],
  )
  const selectionDragRef = useRef<SelectionDragState>({ active: false, selected: false })
  // #3713.9 — la sélection d'avant l'ouverture d'une fiche, rendue au retour.
  const [restored] = useState(() => readInitialSelection<GlobalContact>())
  const [selectedContactsById, setSelectedContactsById] = useState<ReadonlyMap<string, GlobalContact>>(
    () => restored.selected,
  )
  const [reviewOpen, setReviewOpen] = useState(false)
  const [activeQuickAction, setActiveQuickAction] = useState<ContactSelectionBusyAction | null>(null)
  const [bulkSendOpen, setBulkSendOpen] = useState(false)
  const [sequenceOpen, setSequenceOpen] = useState(false)
  const [prepareEmailsOpen, setPrepareEmailsOpen] = useState(false)
  const [executeOpen, setExecuteOpen] = useState(false)
  // #2157.5 — « Créer une cible depuis Contacts ».
  const [targetListOpen, setTargetListOpen] = useState(false)
  // #4188 — l'envoi des contacts cochés vers le CRM de l'espace ; masqué quand la règle d'espace ferme la sortie de données.
  const [crmPushOpen, setCrmPushOpen] = useState(false)
  const dataExit = useDataExit()
  // Transparence billing (addendum Théo p.11) : les contacts en attente de
  // confirmation d'enrichissement — le dialog annonce le coût (1 crédit par
  // contact) AVANT tout débit ; null = dialog fermé.
  //
  // `contacts` est le plan de facturation, PAS la sélection : ce sont exactement
  // les contacts que `planBulkEnrichment` a retenus, donc exactement ceux que le
  // nombre affiché mesure et exactement ceux qui partiront.
  //
  // `channel` porte l'intention d'origine. « Ouvrir un canal » enrichissait
  // auparavant en SILENCE les contacts à qui ce canal manquait : il passe
  // désormais par la même porte, et se souvient ici de ce qu'il devra ouvrir une
  // fois le coût accepté. `null` = « Enrichir maintenant », qui n'ouvre rien.
  const [pendingEnrich, setPendingEnrich] = useState<PendingEnrich | null>(null)
  // #2988.1 — coordonnée choisie pour ce lot en attente ; repart de « les deux »
  // à chaque nouveau plan armé (la coordonnée d'un lot ne doit pas fuiter sur le
  // suivant, même règle que `nameOverride` sur la fiche contact).
  const [pendingEnrichScope, setPendingEnrichScope] = useState<EnrichmentScope>('both')
  // #2988 (#2161) — le résultat détaillé, contact par contact, du DERNIER lot
  // envoyé. `null` tant qu'aucun lot n'est parti ; un lot d'UN seul contact ne
  // l'ouvre pas, le toast/la carte individuelle suffisent déjà à ce cas.
  const [batchEnrichResult, setBatchEnrichResult] = useState<ContactEnrichmentOutcomeRow[] | null>(null)
  // Lifecycle filter (Théo p.16) — le filtrage ET les compteurs sont SERVER-side
  // (`contacts.lifecycle_state`). Auparavant les deux étaient calculés sur les
  // contacts chargés : avec une page de 25, la pastille "Tous" affichait 25 juste
  // sous une carte annonçant "210 contacts sauvegardés".
  const lifecycleFilter: LifecycleFilterValue = stateFilter ?? 'all'
  // Les cinq VUES (§37) — les cinq tâches qu'on fait sur une liste de contacts.
  // L'appartenance vient du contrat partagé (`resolveContactView` via
  // `groupByContactView`) : la refaire ici en ferait une seconde dérivation, qui
  // divergerait de celle que le reste du produit applique (GA-26).
  //
  // #2158.6/#2158.72 — la vue s'initialise depuis l'URL (`viewFilterFromUrl`),
  // défaut « à contacter » et non « Toutes » : la recette ouvre sur une
  // décision, pas sur le volume total. Elle reste ensuite un `useState` LOCAL
  // (pas une lecture directe du prop à chaque rendu) pour que le clic sur un
  // chip reste instantané pendant que `onViewChange` écrit l'URL en tâche de
  // fond ; l'effet ci-dessous ne fait que suivre une navigation EXTERNE (le
  // CTA d'en-tête, un lien partagé) survenue pendant que l'écran est déjà
  // monté.
  const [viewFilter, setViewFilterState] = useState<ContactViewFilterValue>(viewFilterFromUrl ?? 'all')
  useEffect(() => {
    const next = viewFilterFromUrl ?? 'all'
    setViewFilterState(previous => (previous === next ? previous : next))
  }, [viewFilterFromUrl])
  const setViewFilter = useCallback(
    (next: ContactViewFilterValue) => {
      setViewFilterState(next)
      onViewChange?.(next)
    },
    [onViewChange],
  )
  const viewGroups = useMemo(() => groupByContactView(contacts), [contacts])
  // Compteurs UNIQUEMENT quand tout est chargé. Une page de 25 sur un stock de
  // 210 annoncerait « À enrichir 12 » pour 12-sur-25 : c'est exactement le
  // défaut que les pastilles de cycle de vie ont déjà payé, en face du même
  // tableau.
  const viewCounts = useMemo(
    () =>
      hasNextPage
        ? undefined
        : {
            to_contact: viewGroups.to_contact.length,
            to_enrich: viewGroups.to_enrich.length,
            to_verify: viewGroups.to_verify.length,
            known: viewGroups.known.length,
            hidden: viewGroups.hidden.length,
          },
    [hasNextPage, viewGroups],
  )
  const viewFilteredContacts = viewFilter === 'all' ? contacts : viewGroups[viewFilter]
  /**
   * #3942.2 — recette prod 09/10 (#3942, PARTIEL) : la portée « Recommandés »
   * filtre désormais CÔTÉ SERVEUR (`recommendedScope`, paginé) — `contacts`
   * EST déjà le chemin recommandé quand `recommendedFilter === 'recommended'`,
   * jamais un sous-ensemble à recalculer ici. L'ancien filtre CLIENT
   * (`useRecommendedContactIds`, retiré) ne portait que sur la page chargée :
   * sur un espace de 41 304 contacts, le recommandé d'un compte pouvait
   * tomber hors page 1, qui annonçait alors « aucun recommandé ».
   *
   * Le compteur « Recommandés X / Tous Y » vient du MÊME endroit : quand la
   * portée est « recommended », `totalContacts` (le total PAGINÉ sous cette
   * portée) EST le chiffre « recommended » et `recommendedTally.all` donne
   * « Tous » ; sinon c'est l'inverse, et « recommended » reste absent (pas de
   * second classement payé juste pour l'afficher pendant qu'on regarde
   * « Tous ») — jamais un chiffre faux, « on n'affiche pas ce qu'on n'a pas ».
   */
  const recommendedCounts = useMemo(() => {
    if (totalContacts === undefined) return undefined
    return recommendedFilter === 'recommended'
      ? { recommended: totalContacts, all: recommendedTally?.all }
      : { recommended: recommendedTally?.recommended, all: totalContacts }
  }, [totalContacts, recommendedFilter, recommendedTally])
  // #4503.4 — « Ne pas solliciter » : les lignes chargées que la liste « ne pas contacter » de l'espace vise,
  // par le MÊME calcul que leur badge (`listedDoNotContact` : le contact, ou le domaine de son adresse).
  const [doNotContactOnly, setDoNotContactOnly] = useState(false)
  const doNotContactList = useDoNotContactList()
  const visibleContacts = useMemo(
    () =>
      doNotContactOnly
        ? viewFilteredContacts.filter(contact =>
            Boolean(listedDoNotContact(doNotContactList.data?.items, contact.id, contact.email)),
          )
        : viewFilteredContacts,
    [doNotContactOnly, viewFilteredContacts, doNotContactList.data],
  )
  const selectedContacts = useMemo(() => Array.from(selectedContactsById.values()), [selectedContactsById])
  const hasSelection = selectedContacts.length > 0
  useEffect(() => {
    onSelectionActiveChange?.(hasSelection)
    return () => onSelectionActiveChange?.(false)
  }, [hasSelection, onSelectionActiveChange])
  const selectedContactIds = useMemo(() => new Set(selectedContactsById.keys()), [selectedContactsById])
  const compactList = useCompactContactsList()
  const activeScopeTab: ContactScope = unassignedFilter ? 'unassigned' : 'all'
  // #4527.1 — les chiffres des tuiles viennent du SERVEUR (même population que la liste), plus des pages chargées :
  // présents même quand il reste des pages, jamais « 0 » tant que rien n'est mesuré (garde 549f2b2753).
  // Les vues qui rognent les lignes côté client n'ont pas de chiffre serveur : aucune tuile chiffrée plutôt qu'un faux.
  const networkCounts = useMemo(
    () => networkCountsOf({ tally: channelTally, narrowedClientSide: viewFilter !== 'all' || doNotContactOnly }),
    [channelTally, viewFilter, doNotContactOnly],
  )
  const monCrmActive = activeFilters.some(filter => filter.id === 'source' && filter.value === MON_CRM_SOURCE_FILTER)
  const toggleMonCrm = useCallback(() => {
    if (monCrmActive) onFiltersChange(activeFilters.filter(filter => filter.id !== 'source'))
    else onAddFilter('source', MON_CRM_SOURCE_FILTER)
  }, [monCrmActive, activeFilters, onAddFilter, onFiltersChange])
  // #4597.1 — « Importés » : la MÊME valeur de filtre `source=import` que la colonne « Origine » (#4597.4) — un seul geste.
  const importedActive = activeFilters.some(filter => filter.id === 'source' && filter.value === IMPORT_SOURCE_VALUE)
  const toggleImported = useCallback(() => {
    if (importedActive) onFiltersChange(activeFilters.filter(filter => filter.id !== 'source'))
    else onAddFilter('source', IMPORT_SOURCE_VALUE)
  }, [importedActive, activeFilters, onAddFilter, onFiltersChange])
  const channelFilterValue = activeFilters.find(filter => filter.id === 'channel')?.value
  const networkChannel: NetworkChannel | null =
    channelFilterValue === 'with_email' || channelFilterValue === 'with_phone' ? channelFilterValue : null
  const clearSelection = useCallback(() => setSelectedContactsById(new Map()), [])
  useContactsWorkStatePersistence(selectedContactsById, restored.scrollY, !loading && contacts.length > 0)
  // #3701.4 — les sélectionnés que les lignes affichées ne montrent plus.
  const visibleIds = useMemo(() => new Set(visibleContacts.map(contact => contact.id)), [visibleContacts])
  const hiddenSelectedCount = selectedContacts.filter(contact => !visibleIds.has(contact.id)).length
  const removeHiddenSelection = useCallback(() => {
    setSelectedContactsById(current => new Map([...current].filter(([id]) => visibleIds.has(id))))
  }, [visibleIds])
  const selectAll = useSelectAllResults<GlobalContact>({
    loaded: visibleContacts,
    hasNextPage: Boolean(hasNextPage),
    total: totalContacts,
    fetchNext: onLoadNextPageRows,
    onConfirm: rows =>
      setSelectedContactsById(current => {
        const next = new Map(current)
        for (const contact of rows) next.set(contact.id, contact)
        return next
      }),
  })

  // L'état vide filtré NOMMAIT le geste (« réinitialise les filtres ») sans
  // jamais l'offrir. Le bouton relâche EXACTEMENT ce qui est posé, et son
  // libellé dit ce qu'il fait : « réinitialiser les filtres » alors que seule
  // une recherche est en cause serait un bouton qui ne fait rien — pire qu'un
  // texte nu. La pastille de cycle de vie compte comme un filtre : elle vit
  // dans l'URL et `onClearFilters` la remet à vide avec le reste.
  // Théo B c1-repertoire.R13 — le panneau de sélection ne s'ouvre plus d'office : « Plus » l'ouvre.
  const [moreOpen, setMoreOpen] = useState(false)
  const morePanelOpen = moreOpen && hasSelection
  useEffect(() => {
    if (!hasSelection) setMoreOpen(false)
  }, [hasSelection])
  const setNetworkChannel = useCallback(
    (next: NetworkChannel | null) => {
      if (next === null) onFiltersChange(activeFilters.filter(filter => filter.id !== 'channel'))
      else onAddFilter('channel', next)
    },
    [activeFilters, onAddFilter, onFiltersChange],
  )
  const companyFilterValue = activeFilters.find(filter => filter.id === 'company')?.value
  const targetListIdFilter = activeFilters.find(filter => filter.id === 'targetListId')?.value
  // Théo B c1-repertoire.R12 — pagination 25 par page sur les lignes chargées ; « Suivant » au-delà appelle la page
  // serveur suivante (même requête infinie). Tout changement de critère ramène à la première page.
  const [rawPage, setPage] = useState(0)
  const pagingKey = JSON.stringify([
    query,
    activeFilters,
    stateFilter,
    unassignedFilter,
    viewFilter,
    recommendedFilter,
    doNotContactOnly,
  ])
  useEffect(() => {
    setPage(0)
  }, [pagingKey])
  const pageTotal =
    viewFilter === 'all' && !doNotContactOnly ? totalContacts : hasNextPage ? undefined : visibleContacts.length
  const {
    page,
    pageCount,
    from: pageFrom,
    to: pageTo,
    canNext: canNextPage,
  } = contactsPagerOf({
    page: rawPage,
    size: CONTACTS_PAGE_SIZE,
    loaded: visibleContacts.length,
    total: pageTotal,
    hasNextPage: Boolean(hasNextPage),
  })
  const pageRows = useMemo(
    () => visibleContacts.slice(page * CONTACTS_PAGE_SIZE, (page + 1) * CONTACTS_PAGE_SIZE),
    [visibleContacts, page],
  )
  const goToNextPage = useCallback(() => {
    if (!canNextPage) return
    if ((page + 2) * CONTACTS_PAGE_SIZE > visibleContacts.length && hasNextPage) onLoadMore?.()
    setPage(page + 1)
  }, [canNextPage, page, visibleContacts.length, hasNextPage, onLoadMore])
  // « Sélectionner les N » : tout est chargé → on coche tout ; sinon le parcours paginé existant (`selectAll`).
  const selectAllResults = useCallback(() => {
    if (!hasNextPage) {
      setSelectedContactsById(current => {
        const next = new Map(current)
        for (const contact of visibleContacts) next.set(contact.id, contact)
        return next
      })
      return
    }
    void selectAll.start()
  }, [hasNextPage, visibleContacts, selectAll])

  const hasQuery = query.trim().length > 0
  const hasClearableFilters = activeFilters.length > 0 || Boolean(stateFilter)
  // #3376 — le compte de filtres actifs (même formule qu'avant : la pastille
  // de cycle de vie compte comme un filtre) s'affiche désormais sur le
  // déclencheur compact de `ContactsIntro` (`useContactsActiveFilterCount`,
  // GA-26 — une seule formule) ; cet écran-ci n'en a plus besoin pour
  // lui-même.
  const handleResetSearchAndFilters = useCallback(() => {
    if (hasQuery) onQueryChange('')
    if (hasClearableFilters) onClearFilters()
  }, [hasQuery, hasClearableFilters, onQueryChange, onClearFilters])
  const noMatchResetLabel = hasQuery
    ? hasClearableFilters
      ? t('list.noMatchResetAll')
      : t('list.noMatchClearSearch')
    : t('list.noMatchResetFilters')

  /** Case d'en-tête : coche ou décoche les lignes VISIBLES. Une sélection faite
   *  sur une autre page (filtre différent, scroll précédent) n'est pas effacée
   *  au passage — décocher ici ne retire que ce qui est à l'écran. */
  const handleToggleAllVisible = useCallback(
    (selected: boolean) => {
      setSelectedContactsById(current => {
        const next = new Map(current)
        for (const contact of pageRows) {
          if (selected) next.set(contact.id, contact)
          else next.delete(contact.id)
        }
        return next
      })
    },
    [pageRows],
  )

  const handleContactSelectionChange = useCallback((contact: GlobalContact, selected: boolean) => {
    setContactSelection(setSelectedContactsById, contact, selected)
  }, [])

  const handleContactRowMouseDown = useCallback(
    (contact: GlobalContact, event: MouseEvent<HTMLTableRowElement>) => {
      if (event.button !== 0 || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      const nextSelected = !selectedContactIds.has(contact.id)
      selectionDragRef.current = { active: true, selected: nextSelected }
      setContactSelection(setSelectedContactsById, contact, nextSelected)
    },
    [selectedContactIds],
  )

  const handleContactRowMouseEnter = useCallback((contact: GlobalContact) => {
    const drag = selectionDragRef.current
    if (!drag.active) return
    setContactSelection(setSelectedContactsById, contact, drag.selected)
  }, [])

  useEffect(() => {
    const stopSelectionDrag = () => {
      selectionDragRef.current = { active: false, selected: false }
    }

    window.addEventListener('mouseup', stopSelectionDrag)
    window.addEventListener('blur', stopSelectionDrag)

    return () => {
      window.removeEventListener('mouseup', stopSelectionDrag)
      window.removeEventListener('blur', stopSelectionDrag)
    }
  }, [])

  /**
   * Enrichissement de MASSE.
   *
   * Deux défauts corrigés ici (PDF 2 §5.4). Le `catch` était VIDE : sur dix
   * contacts dont quatre échouaient, rien ne le disait — ni à l'écran, ni dans
   * la console. Et chaque contact produisait sa propre notification, si bien que
   * le seul chiffre qui compte (combien trouvés, combien sans résultat, combien
   * de crédits débités) n'apparaissait nulle part. Les notifications
   * individuelles sont donc coupées (`silent`) et une seule, agrégée, part à la
   * fin — avec le nombre d'échecs, jamais tu.
   */
  const enrichSelectedContacts = useCallback(
    async (contactsToEnrich: readonly GlobalContact[], scope: EnrichmentScope = 'both'): Promise<Contact[]> => {
      // #2988.1 — 'both' est la traduction ÉCRAN de « pas de restriction » :
      // le serveur attend `only` absent, jamais une valeur `'both'` qu'il ne
      // connaît pas.
      const only: EnrichmentCoordinate | undefined = scope === 'both' ? undefined : scope
      const enrichedContacts: Contact[] = []
      // #2297.48 — la ventilation PAR CHAMP (emails / téléphones / identités à
      // confirmer / sans résultat), pas un seul agrégat « trouvé ». `outcomes`
      // porte tout ce qu'`bulkEnrichmentSummaryOf` a besoin de lire — aucun
      // second comptage ici (GA-26).
      const outcomes: BulkEnrichmentOutcome[] = []
      // #2988 (#2161) — le détail CONTACT PAR CONTACT, taxonomie à 9 valeurs
      // (`enrichmentOutcomeStatus.ts`). `outcomes`/`failed` restent la seule
      // source de l'agrégat chiffré (GA-26, aucun second comptage) ; ces lignes
      // sont la même information, vue par contact plutôt que sommée.
      const resultRows: ContactEnrichmentOutcomeRow[] = []
      let failed = 0

      // J1b #3822 — exécuteur borné : 3 contacts en parallèle, plafond de temps PAR
      // contact, une issue pour CHACUN (voir `enrichBatchRunner.ts`). Quitter
      // l'écran arrête le lot, et les contacts non partis sont NOMMÉS.
      const progressToastId = 'bulk-enrich-progress'
      const abort = new AbortController()
      batchAbortRef.current = abort
      // #3822.5 — recette prod 07/10 : un rechargement automatique de build
      // périmé (`stale-build.ts`) a interrompu un lot en plein milieu,
      // perdant sélection et récapitulatif alors que des crédits avaient déjà
      // été débités côté serveur. Ce lot se déclare « en vol » du premier
      // appel réseau jusqu'au récapitulatif affiché — jamais avant la fin.
      const endCriticalOperation = beginCriticalOperation()
      try {
        if (contactsToEnrich.length > 1) {
          toast.loading(t('bulkEnrich.progress', { done: 0, total: contactsToEnrich.length }), {
            id: progressToastId,
            duration: Number.POSITIVE_INFINITY,
          })
        }
        const batch = await runEnrichmentBatch(
          contactsToEnrich,
          contact =>
            enrichMutation.mutateAsync({
              contact: toEngagementContact(contact),
              // #1473 — un contact à qualifier n'a pas de société. La chaîne vide
              // est ce que le hook attend déjà quand `entity` et compte manquent :
              // l'appel part sur le nom seul, il n'invente pas un employeur.
              accountCompanyName: contact.company_name ?? '',
              silent: true,
              ...(only ? { only } : {}),
            }),
          {
            concurrency: BULK_ENRICH_CONCURRENCY,
            perItemTimeoutMs: BULK_ENRICH_ITEM_TIMEOUT_MS,
            signal: abort.signal,
            // Crédits épuisés : les suivants échoueraient tous pareil, on ne les lance pas.
            stopOn: error => classifyEnrichmentError(error) === 'insufficient_credits',
            onProgress: (done, count) => {
              if (count > 1) toast.loading(t('bulkEnrich.progress', { done, total: count }), { id: progressToastId })
            },
          },
        )
        if (batchAbortRef.current === abort) batchAbortRef.current = null
        toast.dismiss(progressToastId)

        const notProcessed: GlobalContact[] = []
        for (const result of batch) {
          const contact = result.item
          if (result.kind === 'ok') {
            const enriched = result.value
            enrichedContacts.push(enriched)
            outcomes.push({
              email: enriched.email,
              phone: enriched.phone,
              last_enrichment_result: enriched.last_enrichment_result,
            })
            resultRows.push({
              contactId: contact.id,
              fullName: contact.full_name,
              status: classifyEnrichmentOutcome(enriched),
            })
          } else if (result.kind === 'error') {
            // Compté, jamais avalé : un échec silencieux se lit « aucun résultat »,
            // ce qui est une conclusion qu'on n'a pas le droit de tirer.
            failed += 1
            resultRows.push({
              contactId: contact.id,
              fullName: contact.full_name,
              status: classifyEnrichmentError(result.error),
            })
          } else {
            notProcessed.push(contact)
            resultRows.push({ contactId: contact.id, fullName: contact.full_name, status: 'not_processed' })
          }
        }

        // Un lot d'UN contact garde son écran existant (toast + carte) ; « lot »
        // commence à deux, où l'agrégat seul ne dit plus lequel a échoué.
        if (resultRows.length > 1) setBatchEnrichResult(resultRows)

        const summary = bulkEnrichmentSummaryOf(outcomes, failed)
        toast.message(t('bulkEnrich.title', { count: contactsToEnrich.length }), {
          description: [
            t('bulkEnrich.emailsFound', { count: summary.emailsFound }),
            t('bulkEnrich.phonesFound', { count: summary.phonesFound }),
            summary.identitiesToConfirm > 0
              ? t('bulkEnrich.identitiesToConfirm', { count: summary.identitiesToConfirm })
              : null,
            t('bulkEnrich.withoutResult', { count: summary.withoutResult }),
            summary.failed > 0 ? t('bulkEnrich.failed', { count: summary.failed }) : null,
            notProcessed.length > 0 ? t('bulkEnrich.notProcessed', { count: notProcessed.length }) : null,
            // #1953.19-adjacent — « fait » ne porte jamais preuve d'envoi : Laura
            // prépare, elle n'envoie jamais. Cette ligne est une CONSTANTE, pas
            // une mesure — elle ne peut structurellement qu'être 0.
            t('bulkEnrich.sent'),
          ]
            .filter(Boolean)
            .join(' · '),
          // #3822.2 (recette prod 08/10, W 5b4b10d2f3) — le récapitulatif
          // disparaissait seul (`TOAST_SUCCESS_MS`, 5 s) avant même les 17 s
          // de la recette. La spec dit « il reste jusqu'à fermeture » : ce
          // récap porte un chiffre à lire (crédits, trouvés, sans résultat),
          // jamais un simple accusé de réception — il ne s'auto-ferme donc
          // jamais, qu'il y ait ou non des contacts non traités.
          duration: Number.POSITIVE_INFINITY,
        })
        // Un arrêt se DIT à l'écran, et se relance d'un geste.
        if (notProcessed.length > 0) {
          toast.warning(t('bulkEnrich.notProcessedRelaunch', { count: notProcessed.length }), {
            duration: Number.POSITIVE_INFINITY,
            action: {
              label: t('bulkEnrich.relaunch'),
              onClick: () => {
                void relaunchEnrichRef.current?.(notProcessed, scope)
              },
            },
          })
        }

        return enrichedContacts
      } finally {
        endCriticalOperation()
      }
    },
    [enrichMutation, t],
  )
  relaunchEnrichRef.current = enrichSelectedContacts

  /**
   * Ouvre le canal avec ce qui est prêt. Aucun débit ici : ces contacts ont
   * déjà la coordonnée. Rien à ouvrir ⇒ on le DIT plutôt que d'ouvrir un
   * panneau vide.
   */
  const openChannelWith = useCallback(
    (contactsToOpen: readonly Contact[], channel: EngagementChannel, selectionSize: number) => {
      const deduped = dedupeContacts([...contactsToOpen])
      if (deduped.length === 0) {
        toast.info(missingChannelMessage(channel, selectionSize))
        return
      }
      openEngagement(deduped, channel)
    },
    [openEngagement],
  )

  // Confirmed enrichment (post-dialog) — the only path that actually debits.
  //
  // Ce qui part est `pending.contacts`, c'est-à-dire l'ensemble EXACT que le
  // dialogue vient de chiffrer. Aucun recalcul ici : recompter à ce moment-là
  // rouvrirait la porte entre l'annonce et le débit.
  const confirmPendingEnrich = useCallback(async () => {
    const pending = pendingEnrich
    setPendingEnrich(null)
    if (!pending || pending.contacts.length === 0) return
    setActiveQuickAction(pending.channel ?? 'enrich-missing')
    try {
      const enrichedContacts = await enrichSelectedContacts(pending.contacts, pendingEnrichScope)
      const channel = pending.channel
      if (!channel) return
      const recovered = enrichedContacts.filter(contact => hasChannelData(contact, channel))
      const selectionSize = pending.readyContacts.length + pending.contacts.length

      // Ce que la recherche N'A PAS rendu se dit. Sans ça, un panneau ouvert
      // sur moins de contacts qu'on en avait cochés se lit comme une perte.
      if (recovered.length < pending.contacts.length) {
        toast.message(
          t('selection.toastReady', {
            count: pending.readyContacts.length + recovered.length,
            channel: channelLabel(channel).toLowerCase(),
          }),
          { description: t('selection.toastReadyDescription') },
        )
      }

      openChannelWith([...pending.readyContacts, ...recovered], channel, selectionSize)
    } finally {
      setActiveQuickAction(null)
    }
  }, [enrichSelectedContacts, openChannelWith, pendingEnrich, pendingEnrichScope])

  /**
   * Le refus. Il ne débite rien, et fait la part GRATUITE de l'intention :
   * ouvrir le canal avec les contacts qui l'ont déjà. Sans ça, refuser la
   * dépense enfermait — on recliquait, on se revoyait redemander.
   */
  const declinePendingEnrich = useCallback(() => {
    const pending = pendingEnrich
    setPendingEnrich(null)
    if (!pending?.channel) return
    openChannelWith(pending.readyContacts, pending.channel, pending.readyContacts.length + pending.contacts.length)
  }, [openChannelWith, pendingEnrich])

  const handleAssignSelection = useCallback(
    (target: ContactAssignTarget) => {
      if (selectedContacts.length === 0) return
      assignMutation.mutate({
        contactIds: selectedContacts.map(contact => contact.id),
        assignedTo: target?.userId ?? null,
        ...(target ? { assigneeName: target.name } : {}),
      })
    },
    [assignMutation, selectedContacts],
  )

  const handleAddSelectionToPlan = useCallback(() => {
    if (selectedContacts.length === 0) return
    addToPlanMutation.mutate(selectedContacts)
  }, [addToPlanMutation, selectedContacts])

  /**
   * Les deux actions de masse qui peuvent DÉBITER, et la porte qu'elles
   * partagent désormais.
   *
   * Ni l'une ni l'autre n'appelle l'enrichissement : toutes deux ARMENT une
   * annonce (`pendingEnrich`) que `confirmPendingEnrich` seul consomme. Le
   * prédicat de facturation (`planBulkEnrichment`, qui délègue au contrat)
   * décide QUI part ; le nombre affiché mesure ce qu'il a retenu.
   *
   * ⚠️ Un plan vide n'ouvre PAS le dialogue avec « 0 crédit » — ce serait
   * annoncer un débit de zéro là où la vérité est qu'il n'y a rien à acheter.
   */
  const handleQuickAction = useCallback(
    (action: ContactSelectionAction) => {
      if (selectedContacts.length === 0) return

      // « Enrichir maintenant » (addendum Théo p.11).
      if (action.kind === 'enrich-missing') {
        // Le lot ENVOYÉ est celui que le contrat compte — une seule porte, donc
        // aucun écart possible entre le prix annoncé et le prix débité. L'ancien
        // filtre (« il manque l'un des trois champs ») envoyait aussi les
        // contacts qui avaient déjà un e-mail ou un téléphone : le panneau
        // annonçait 3 crédits là où le contrat en compte 2.
        const plan = planBulkEnrichment(selectedContacts)
        if (plan.billableContacts.length === 0) {
          const cooldownCount = onCooldownCount(plan.excluded)
          toast.info(t('selection.nothingBillable'), {
            description:
              cooldownCount > 0
                ? t('selection.nothingBillableOnCooldown', { count: cooldownCount })
                : t('selection.nothingBillableDescription'),
          })
          return
        }
        setPendingEnrichScope('both')
        setPendingEnrich({ contacts: plan.billableContacts, channel: null, readyContacts: [], excluded: plan.excluded })
        return
      }

      const readyContacts = selectedContacts
        .filter(contact => hasChannelData(contact, action.channel))
        .map(toEngagementContact)
      const contactsMissingChannel = selectedContacts.filter(contact => !hasChannelData(contact, action.channel))
      const plan = planBulkEnrichment(contactsMissingChannel)

      // Rien de facturable : on n'enrichit RIEN et on ouvre avec ce qu'on a.
      // C'est aussi le seul cas gratuit, donc le seul qui n'a rien à annoncer.
      if (plan.billableContacts.length === 0) {
        openChannelWith(readyContacts, action.channel, selectedContacts.length)
        return
      }

      setPendingEnrichScope('both')
      setPendingEnrich({
        contacts: plan.billableContacts,
        channel: action.channel,
        readyContacts,
        excluded: plan.excluded,
      })
    },
    [openChannelWith, selectedContacts, t],
  )

  const activeTargetList = targetListIdFilter ? targetLists.find(list => list.id === targetListIdFilter) : undefined
  const filtersCount = countActiveContactFilters({
    chips: activeFilters.length,
    stateFilter,
    unassigned: unassignedFilter,
    view: viewFilter,
  })
  const askLaura = (
    // #1419 — LE MÊME GESTE QUE PARTOUT AILLEURS : le prompt PRÉ-REMPLIT la saisie, il ne l'envoie jamais.
    // Filtré, il porte sur les contacts AFFICHÉS ; sinon, sur le portefeuille. Théo : dans l'en-tête (C1.A15).
    <AskLaura
      variant="prominent"
      question={isFilterActive ? t('list.copilotPromptFiltered') : t('list.copilotPrompt')}
      label={t('list.askCopilot')}
    />
  )
  const filtersPanel = (
    <div className="space-y-4">
      {/* #2738 / #3527 — la portée, l'état de travail et la maturité vivent ICI, repliés avec le reste ;
          le compte du déclencheur garantit qu'un filtre actif ne reste jamais muet. */}
      <Box display="flex" role="group" aria-label={t('list.tabScopeLegend')} className="items-center gap-1">
        <span aria-hidden="true" className="mr-1 shrink-0 text-xs font-medium text-[var(--bellum-text-muted)]">
          {t('list.tabScopeLegend')}
        </span>
        <TabNav
          variant="pill"
          tabs={contactScopeTabs}
          activeTab={activeScopeTab}
          onTabChange={key => onScopeChange(key as ContactScope)}
          size="sm"
        />
      </Box>
      {!loading && (contacts.length > 0 || viewFilter !== 'all') && (
        <ContactsViewChips
          counts={viewCounts}
          loadedTotal={hasNextPage ? undefined : contacts.length}
          value={viewFilter}
          onChange={setViewFilter}
        />
      )}
      {/* #3483.3a — la maturité de la donnée est une rangée NOMMÉE (C1.A4 : « Maturité » dans la modale). */}
      {!loading && (contacts.length > 0 || lifecycleFilter !== 'all') && (
        <ContactsLifecycleFilter
          tally={lifecycleTally}
          total={totalContacts}
          value={lifecycleFilter}
          onChange={onLifecycleFilterChange}
        />
      )}
      <div className="flex flex-col gap-2">
        <AddFilterButton
          definitions={filterDefinitions}
          onAdd={onAddFilter}
          hasActive={activeFilters.length > 0}
          label={t('list.filtersSection.addFilter')}
        />
        <FilterBar
          definitions={filterDefinitions}
          active={activeFilters}
          onChange={onFiltersChange}
          onClear={onClearFilters}
        />
      </div>
    </div>
  )

  return (
    <Box
      data-testid="contacts-content-root"
      // #3471 — le panneau de sélection (ouvert par « Plus ») est fixe à droite : le contenu se réserve sa largeur.
      className={cn('space-y-4', PAGE_GUTTER_X, morePanelOpen && 'lg:pr-[25.75rem]')}
      {...guideAnchorProps('contacts.page')}
    >
      {/* Théo B c1-repertoire — l'écran, du haut en bas : en-tête, liste ouverte, synthèse, doublons,
          barre d'outils, puces, tableau et son pied, barre de sélection. */}
      {renderIntro ? renderIntro(askLaura) : null}

      {/* C2.R3 — une liste ouverte depuis « Mes listes » se nomme, et se quitte. */}
      {targetListIdFilter ? (
        <ContactsListBanner
          name={activeTargetList?.name}
          total={totalContacts}
          onQuit={() => onFiltersChange(activeFilters.filter(filter => filter.id !== 'targetListId'))}
        />
      ) : null}

      {/* #3821.1 — « filtre téléphone difficile à trouver » : la synthèse reste TOUJOURS visible, hors de
          tout pli. Même réglage (`activeFilters`, id `channel`) que les puces et la modale (GA-26). */}
      {/* #4527.3 — liste vide ⇒ ni héro « 0 » ni tuiles à 0 : seul l'état vide parle (GA-18 / GA-19). */}
      {!loading && contacts.length > 0 && (
        <ContactsNetworkOverview
          total={totalContacts}
          counts={networkCounts}
          channel={networkChannel}
          unattachedActive={unassignedFilter === true}
          onChannelChange={setNetworkChannel}
          onUnattachedChange={next => onScopeChange(next ? 'unassigned' : 'all')}
          scope={recommendedFilter === 'recommended' ? 'recommended' : 'all'}
          onTotalSelect={() => {
            setNetworkChannel(null)
            if (unassignedFilter === true) onScopeChange('all')
          }}
          filtered={isFilterActive}
        />
      )}

      {/* #2484 — un fondu simple (`MOTION.reveal`), jamais une translation écrite à la main (GA-25). */}
      <motion.div {...MOTION.reveal} {...guideAnchorProps('contacts.recherche')}>
        <ContactsToolbar
          query={query}
          onQueryChange={onQueryChange}
          accountSelect={
            <ContactsAccountSelect
              companies={companies}
              value={companyFilterValue}
              onChange={next => {
                if (next) onAddFilter('company', next)
                else onFiltersChange(activeFilters.filter(filter => filter.id !== 'company'))
              }}
            />
          }
          filtersTrigger={
            <ContactsFiltersTrigger open={filtersOpen} onOpenChange={onFiltersOpenChange} count={filtersCount} />
          }
          trailing={
            contacts.length > 0 ? (
              <div className="flex items-center gap-2">
                {/* Théo B c1-repertoire.N1 — « Compacter la liste » : une icône, préférence par utilisateur. */}
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-pressed={compactList.compact}
                  aria-label={compactList.compact ? t('list.comfortList') : t('list.compactList')}
                  title={compactList.compact ? t('list.comfortList') : t('list.compactList')}
                  onClick={() => compactList.setCompact(!compactList.compact)}
                  className="pointer-coarse:size-11"
                >
                  {compactList.compact ? (
                    <Rows3 className="size-4" aria-hidden />
                  ) : (
                    <Rows4 className="size-4" aria-hidden />
                  )}
                </Button>
                {/* Une sélection en cours l'emporte : « Exporter » n'ignore jamais les lignes cochées. */}
                <ExportSheetButton
                  contacts={selectedContacts.length > 0 ? selectedContacts : contacts}
                  title={t('list.exportSheetTitle')}
                  label={
                    selectedContacts.length > 0
                      ? t('list.exportSheetSelection', { count: selectedContacts.length })
                      : t('list.export')
                  }
                />
              </div>
            ) : null
          }
        />
      </motion.div>

      {/* Théo B c1-repertoire `.v13-chip-row` — toujours visible : vues, canaux, à rattacher, ne pas solliciter ;
          #4503.4 — la bascule « Tous · Recommandés » (#3942.1) ferme la rangée, hors du pli « Filtres ». */}
      {!loading && (contacts.length > 0 || isFilterActive) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ContactsQuickChips
            className="min-w-0 flex-1"
            view={viewFilter}
            channel={networkChannel}
            unattached={unassignedFilter === true}
            doNotContact={doNotContactOnly}
            monCrm={{
              count: viewFilter === 'all' && !doNotContactOnly ? channelTally?.monCrm : undefined,
              active: monCrmActive,
              crmName: crmNameOf(crmStatus.data),
              onToggle: toggleMonCrm,
            }}
            imported={{
              count: viewFilter === 'all' && !doNotContactOnly ? channelTally?.imported : undefined,
              active: importedActive,
              onToggle: toggleImported,
            }}
            importJob={importJobActive ? { onClear: onClearImportJob } : undefined}
            onViewChange={setViewFilter}
            onChannelChange={setNetworkChannel}
            onUnattachedChange={next => onScopeChange(next ? 'unassigned' : 'all')}
            onDoNotContactChange={setDoNotContactOnly}
          />
          {contacts.length > 0 ? (
            <ContactsRecommendedToggle
              counts={recommendedCounts}
              value={recommendedFilter}
              filtered={activeFilters.length > 0}
              onChange={onRecommendedFilterChange}
            />
          ) : null}
          {contacts.length > 0 ? <ContactsZoneSortToggle active={zoneSort} onChange={onZoneSortChange} /> : null}
        </div>
      )}

      {/* #AM.39 — l'état « en cours » du chemin d'enrichissement de la liste, lu à l'index serveur. */}
      <EnrichmentInFlightLine className={PAGE_GUTTER_X} />

      {/* Théo B c1-repertoire « Affiner le répertoire » (C1.R8) — le pli sous la recherche devient une
          modale ; son contenu est INCHANGÉ (portée, vues, maturité, filtres avancés), appliqué à la volée. */}
      <Dialog open={filtersOpen} onOpenChange={onFiltersOpenChange}>
        <DialogContent
          id={CONTACTS_FILTERS_PANEL_ID}
          closeLabel={t('filtersDialog.close')}
          className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"
        >
          <DialogHeader>
            <DialogTitle>{t('filtersDialog.title')}</DialogTitle>
            <DialogDescription>{t('filtersDialog.description')}</DialogDescription>
          </DialogHeader>
          {filtersPanel}
          <DialogFooter>
            {hasClearableFilters ? (
              <Button type="button" size="sm" variant="plain" onClick={onClearFilters}>
                {t('list.noMatchResetFilters')}
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="default" onClick={() => onFiltersOpenChange(false)}>
              {totalContacts !== undefined
                ? t('filtersDialog.show', { count: totalContacts })
                : t('filtersDialog.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <ContactsTableSkeleton />
      ) : contacts.length === 0 && error ? (
        // #3713.8 — une 1re page en erreur n'est pas « zéro contact ».
        <ContactsStateBox
          role="alert"
          title={t('list.loadErrorTitle')}
          description={t('list.loadErrorDescription')}
          actions={
            onRetry ? (
              <Button type="button" size="sm" variant="soft" onClick={onRetry}>
                {t('list.retry')}
              </Button>
            ) : undefined
          }
        />
      ) : contacts.length === 0 ? (
        isFilterActive ? (
          <ContactsStateBox
            title={t('list.noMatchTitle')}
            description={t('list.noMatchDescription')}
            actions={
              hasQuery || hasClearableFilters ? (
                <>
                  <Button type="button" size="sm" variant="soft" onClick={handleResetSearchAndFilters}>
                    {noMatchResetLabel}
                  </Button>
                  <Button type="button" size="sm" variant="plain" onClick={() => onFiltersOpenChange(true)}>
                    {t('filtersDialog.title')}
                  </Button>
                </>
              ) : undefined
            }
          />
        ) : recommendedFilter === 'recommended' ? (
          // #3942.2 — `contacts` est déjà le résultat SERVEUR de la portée « Recommandés » : vide ICI = aucun recommandé.
          <ContactsStateBox
            title={t('recommended.emptyTitle')}
            description={t('recommended.emptyDescription')}
            actions={
              <Button type="button" size="sm" variant="soft" onClick={() => onRecommendedFilterChange('all')}>
                {t('recommended.chipAll')}
              </Button>
            }
          />
        ) : (
          <ContactsEmpty />
        )
      ) : visibleContacts.length === 0 ? (
        // ⚠️ Branche DÉJÀ jugée morte, et elle ne l'est plus : `visibleContacts` vaut `viewGroups[viewFilter]`,
        // un groupe se vide sans que la liste se vide (`Contacts.test.tsx` l'atteint). « Masqués » est une vue
        // HORS DE PORTÉE (écartée en SQL) : lui servir « aucun contact » affirmerait qu'on n'a rien masqué.
        viewFilter === 'hidden' ? (
          <ContactsStateBox title={t('views.hidden')} description={t('views.hiddenUnavailableReason')} />
        ) : (
          <ContactsStateBox title={t('list.lifecycleEmptyTitle')} description={t('list.lifecycleEmptyDescription')} />
        )
      ) : (
        <>
          <div
            data-testid="contacts-list-area"
            // #3713 — pendant que le panneau de sélection est ouvert, « Relation » cède et le plancher passe à 40 rem.
            className={cn(
              'overflow-x-auto overscroll-x-contain rounded-overlay border border-[var(--bellum-border)] bg-card py-1',
              morePanelOpen &&
                'lg:[&_table]:min-w-[40rem] lg:[&_[data-column=relation]]:hidden lg:[&_[data-column=identity]]:w-[32%] lg:[&_[data-column=contact]]:w-[18%] lg:[&_[data-column=company]]:w-[22%] lg:[&_[data-column=commercial]]:w-[28%]',
            )}
          >
            <ContactsTable
              rows={pageRows}
              selectedContactIds={selectedContactIds}
              onContactRowMouseDown={handleContactRowMouseDown}
              onContactRowMouseEnter={handleContactRowMouseEnter}
              onContactSelectionChange={handleContactSelectionChange}
              onToggleAll={handleToggleAllVisible}
              // #4597.4 — la colonne « Origine » est un filtre : un clic filtre la liste sur cette source.
              onFilterBySource={source => onAddFilter('source', source)}
              // #3942.5 — l'en-tête de groupe par compte n'a de sens que dans la portée Recommandés.
              groupByAccount={recommendedFilter === 'recommended' && !zoneSort}
              // #4982.2 — triée par zone : un en-tête par ville (le tri par zone prime sur le rang du chemin).
              groupByZone={zoneSort}
              compact={compactList.compact}
            />
          </div>
          {/* Théo B c1-repertoire `.v13-table-foot` (C1.R12) — « 1–25 sur 79 contacts · 25 par page », Précédent /
              Suivant. Une page au-delà des lignes chargées appelle la page serveur suivante (même requête). */}
          <div
            ref={loadMoreRef}
            data-testid="contacts-table-foot"
            className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs text-[var(--bellum-text-muted)]"
          >
            <span>
              {pageTotal !== undefined
                ? t('pager.rangeOf', { from: pageFrom, to: pageTo, total: pageTotal, size: CONTACTS_PAGE_SIZE })
                : t('pager.range', { from: pageFrom, to: pageTo, size: CONTACTS_PAGE_SIZE })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="plain"
                disabled={page === 0}
                onClick={() => setPage(Math.max(0, page - 1))}
              >
                {t('pager.previous')}
              </Button>
              {pageCount !== undefined ? (
                <span className="tabular-nums">{t('pager.page', { page: page + 1, count: pageCount })}</span>
              ) : null}
              {loadingMore ? (
                <BrailleLoader variant="grid-searching" dotSize={3} className="text-[var(--bellum-text-accent)]" />
              ) : null}
              <Button type="button" size="sm" variant="plain" disabled={!canNextPage} onClick={goToNextPage}>
                {t('pager.next')}
              </Button>
            </div>
            {error ? <span role="alert">{t('list.loadError')}</span> : null}
          </div>

          <ContactsSelectionBar
            contacts={selectedContacts}
            pageCount={pageRows.length}
            total={totalContacts}
            hasNextPage={Boolean(hasNextPage)}
            canSelectAll={onLoadNextPageRows !== undefined || !hasNextPage}
            hiddenSelectedCount={hiddenSelectedCount}
            selectAllBusy={selectAll.busy}
            members={workspaceMembers}
            assignPending={assignMutation.isPending}
            onAssign={handleAssignSelection}
            onSelectAllResults={selectAllResults}
            onReview={() => setReviewOpen(true)}
            onRemoveHidden={removeHiddenSelection}
            onSaveList={() => setTargetListOpen(true)}
            onPrepareMessage={() => setPrepareEmailsOpen(true)}
            onPrepareSequence={() => setSequenceOpen(true)}
            onMore={() => setMoreOpen(open => !open)}
            moreOpen={morePanelOpen}
            onClear={clearSelection}
          />

          {/* #2518 / #3471 — le panneau de sélection est une fenêtre SUPERPOSÉE, non modale : le tableau garde sa
              pleine largeur et reste cochable. Théo B c1-repertoire : il ne s'ouvre plus d'office — « Plus » de la
              barre de sélection l'ouvre ; sa croix vide la sélection, l'Échap le referme. Contenu INCHANGÉ. */}
          <Sheet
            open={morePanelOpen}
            modal={false}
            onOpenChange={open => {
              if (!open) setMoreOpen(false)
            }}
          >
            <SheetContent
              side="right"
              hideClose
              hideOverlay
              onInteractOutside={event => event.preventDefault()}
              className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
            >
              {/* Radix exige un `Dialog.Title` : le panneau porte déjà son compteur visible. */}
              <SheetTitle className="sr-only">{t('selection.count', { count: selectedContacts.length })}</SheetTitle>
              <ContactSelectionPanel
                contacts={selectedContacts}
                availableContacts={visibleContacts}
                activeAction={activeQuickAction}
                onAddContact={contact => handleContactSelectionChange(contact, true)}
                onClear={clearSelection}
                onQuickAction={handleQuickAction}
                onSendBulkEmail={() => setBulkSendOpen(true)}
                onExecuteActions={() => setExecuteOpen(true)}
                members={workspaceMembers}
                onAssign={handleAssignSelection}
                assignPending={assignMutation.isPending}
                onAddToPlan={handleAddSelectionToPlan}
                addToPlanPending={addToPlanMutation.isPending}
                onAddToSequence={() => setSequenceOpen(true)}
                onPrepareEmails={() => setPrepareEmailsOpen(true)}
                onCreateTargetList={() => setTargetListOpen(true)}
                onPushToCrm={dataExit.allowed ? () => setCrmPushOpen(true) : undefined}
                onVerifyForced={() => verifyMutation.mutate(selectedContacts.map(contact => contact.id))}
                verifyPending={verifyMutation.isPending}
              />
            </SheetContent>
          </Sheet>
        </>
      )}

      {/* #1512 — la MÊME fenêtre que l'écran Séquences, avec la sélection
          déjà dedans. Elle crée une séquence PAR contact : une séquence porte
          un contact, et c'est ce qui lui permet de s'arrêter quand cette
          personne répond. La fenêtre le dit avant de valider. */}
      <CreateSequenceDialog
        open={sequenceOpen}
        onOpenChange={setSequenceOpen}
        initialContacts={selectedContacts.map(contact => ({
          id: contact.id,
          full_name: contact.full_name,
          title: contact.title ?? null,
          email: contact.email ?? null,
          excluded_at: contact.excluded_at ?? null,
          assigned_to: contact.assigned_to ?? null,
        }))}
      />

      {/* #3942.2 — la fenêtre de revue, contact par contact, avec la
          sélection déjà dedans — jamais un second composeur ni un envoi. */}
      <PrepareContactsEmailDialog
        open={prepareEmailsOpen}
        onOpenChange={setPrepareEmailsOpen}
        contacts={selectedContacts}
        // #4042.8 — les pièces jointes se choisissent dans la revue d'envoi (une personne à la fois).
        onReviewWithAttachments={() => setBulkSendOpen(true)}
      />

      {/* #2157.5 — la MÊME notion de cible que /mes-cibles : une nouvelle
          liste `target-lists`, remplie avec la sélection comme éléments. */}
      {/* #3701.3 — la revue AVANT d'étendre à « tous les résultats », et la
          revue seule de la sélection courante. Elle lit, elle n'envoie rien. */}
      <SelectionReviewDialog
        open={selectAll.proposal !== null}
        onOpenChange={open => {
          if (!open) selectAll.cancel()
        }}
        contacts={selectAll.proposal?.rows ?? []}
        total={selectAll.proposal?.total}
        capped={selectAll.proposal?.capped}
        failed={selectAll.proposal?.failed}
        onConfirm={selectAll.confirm}
      />
      <SelectionReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} contacts={selectedContacts} />

      {crmPushOpen ? (
        <CrmPushDialog
          open
          onOpenChange={setCrmPushOpen}
          selection={{ accountIds: [], contactIds: selectedContacts.map(contact => contact.id) }}
        />
      ) : null}

      <CreateTargetListDialog open={targetListOpen} onOpenChange={setTargetListOpen} contacts={selectedContacts} />

      <BulkEmailReviewDialog
        open={bulkSendOpen}
        onOpenChange={setBulkSendOpen}
        contacts={selectedContacts}
        // #3701.9 — « résultat partiel précisé » : seuls les contacts PARTIS sortent
        // de la sélection ; ceux écartés ou en échec y restent, pour être revus.
        onSent={result => {
          const sent = new Set(result.sent.map(one => one.contact_id))
          setSelectedContactsById(current => new Map([...current].filter(([id]) => !sent.has(id))))
        }}
      />

      <ExecuteActionDialog
        open={executeOpen}
        onOpenChange={setExecuteOpen}
        contacts={selectedContacts.map(contact => ({ id: contact.id, name: contact.full_name }))}
        // #3701.9 — une erreur individuelle ne supprime pas la sélection : au moindre
        // échec elle est gardée entière pour réessayer.
        onDone={summary => {
          if (summary.failed === 0) clearSelection()
        }}
      />

      {/* Confirmation d'enrichissement (transparence billing) — coût annoncé
          avant le débit ; fermer sans confirmer n'enrichit rien.

          `count` est la TAILLE DU PLAN, jamais celle de la sélection : c'est ce
          qui fait que le nombre affiché mesure exactement ce qui partira. Le
          dialogue n'est monté que sur un plan non vide, donc ce nombre n'est
          jamais zéro — « 0 crédit » ne s'affiche pas, il n'existe pas ici. */}
      {pendingEnrich !== null && (
        <EnrichConfirmDialog
          open
          onOpenChange={open => {
            if (!open) setPendingEnrich(null)
          }}
          count={pendingEnrich.contacts.length}
          // Le nombre de CRÉDITS vient de la grille partagée via le PLAN, pas
          // d'un « 1 par contact » recopié dans une phrase : le jour où le poids
          // d'un enrichissement bouge, le dialogue bouge avec lui.
          excluded={pendingEnrich.excluded}
          coordinateScope={pendingEnrichScope}
          onCoordinateScopeChange={setPendingEnrichScope}
          onConfirm={() => {
            void confirmPendingEnrich()
          }}
          {...(pendingEnrich.channel && pendingEnrich.readyContacts.length > 0
            ? {
                declineLabel: t('selection.openWithoutEnriching', { count: pendingEnrich.readyContacts.length }),
                onDecline: declinePendingEnrich,
              }
            : {})}
        />
      )}

      {/* #2988 (#2161) — l'écran de résultat détaillé du LOT, contact par
          contact, une fois l'enrichissement de masse terminé. */}
      {batchEnrichResult !== null && (
        <EnrichmentBatchResultDialog
          open
          onOpenChange={open => {
            if (!open) setBatchEnrichResult(null)
          }}
          rows={batchEnrichResult}
        />
      )}

      {/* #2927 (recette Z1 04/10) — « Mes contacts personnels » : tous comptes confondus, visibles de leur seul
          propriétaire ; la section n'existe pas sans contact personnel (une absence ne fait aucune ligne). */}
      <PersonalContactsSection />
    </Box>
  )
}

function setContactSelection(
  setSelectedContactsById: (
    updater: (current: ReadonlyMap<string, GlobalContact>) => ReadonlyMap<string, GlobalContact>,
  ) => void,
  contact: GlobalContact,
  selected: boolean,
) {
  setSelectedContactsById(current => {
    if (current.has(contact.id) === selected) return current
    const next = new Map(current)
    if (selected) next.set(contact.id, contact)
    else next.delete(contact.id)
    return next
  })
}

function hasChannelData(
  contact: Pick<GlobalContact, 'email' | 'linkedin_url' | 'phone'> | Pick<Contact, 'email' | 'linkedin_url' | 'phone'>,
  channel: EngagementChannel,
): boolean {
  if (channel === 'linkedin') return Boolean(contact.linkedin_url)
  if (channel === 'phone') return Boolean(contact.phone)
  return Boolean(contact.email)
}

function channelLabel(channel: EngagementChannel): string {
  // i18n keys: channels.email | channels.linkedin | channels.phone
  return i18n.t(`contacts:channels.${channel}`)
}

function missingChannelMessage(channel: EngagementChannel, count: number): string {
  return i18n.t('contacts:selection.mustEnrich', { count, channel: channelLabel(channel).toLowerCase() })
}

function dedupeContacts(contacts: Contact[]): Contact[] {
  return Array.from(new Map(contacts.map(contact => [contact.id, contact])).values())
}
