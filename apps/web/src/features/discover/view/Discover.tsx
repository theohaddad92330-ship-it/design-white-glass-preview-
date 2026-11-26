import { useQueryClient } from '@tanstack/react-query'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
// La route est importée pour SA recherche, et elle importe cet écran en
// retour : la boucle est assumée (patron `MissionsPage`/`ProjectsPage`,
// `agent_docs` du 28/08) — c'est le seul moyen d'obtenir une recherche TYPÉE
// sur cette route-ci, `class` compris.
import { Route } from '@/routes/discover/index'
import { useTranslation } from 'react-i18next'
import { Bookmark, Download, Sparkles, Zap } from 'lucide-react'
import {
  discoverPresets,
  isPresetActive,
  territoryTrackHintKey,
  withoutPreset,
  withSingleRegion,
  type DiscoverPreset,
} from '../lib/discover-presets'
import { radarTechnologyFromFilters } from '../lib/discover-radar-entry'
import { useOfferPortfolio } from '@/features/profile/hooks/useOfferPortfolio'
import { useBestReferences } from '@/features/accounts/hooks/useBestReference'
import { DiscoverQuickPresetsDialog } from './DiscoverQuickPresetsDialog'
import { TargetSectorChoiceDialog } from './TargetSectorChoiceDialog'
import { SecondPassNotice } from './SecondPassNotice'
import { Button, DropdownMenuCheckboxItem, DropdownMenuItem } from '@bellum/ui'
import { discoverStorageKey } from '@/features/discover/lib/discover-storage'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useWorkspaceMarket } from '@/features/team/hooks/useWorkspaceMarket'
import { useRecordDiscoverResearch } from '@/features/team-research/hooks/useRecordDiscoverResearch'
import {
  MARKET_COUNTRY_NAMES,
  createLauraContextEnvelope,
  readSkillSearch,
  type ContextMode,
  type ZoneCeiling,
} from '@bellum/contracts'
import { buildAnalyzeSearch } from '@/features/discover/lib/discover-analyze'
import { resolveQualifyTarget } from '@/features/discover/lib/discover-qualify'
import { showsSearchLoading } from '@/features/discover/lib/discover-loading'
import { toast } from 'sonner'
import { useHiringDomainProfile } from '@/features/discover/hooks/useHiringDomainProfile'
import {
  hiringScopeNotice,
  outOfTradeLast,
  rankByHiringDomain,
  scopeDiscoverHiring,
} from '@/features/discover/lib/discover-hiring-domain'
import { HiringDomainNoticeLine } from '@/features/discover/view/HiringDomainNoticeLine'
import { DiscoverFunnelLine } from '@/features/discover/view/DiscoverFunnelLine'
import { useChooseEmployer } from '@/features/discover/hooks/useChooseEmployer'
import { SkillSearchFooter, SkillSearchNotices } from '@/features/discover/view/SkillSearch'
import { lauraContextSearch } from '@/lib/return-to-conversation'
import { autopilotPlan, type AutopilotPlan } from '@/features/discover/lib/discover-autopilot'
import {
  defaultDiscoverSort,
  isHighPotential,
  keywordMatchNotice,
  sortCandidates,
  verifiedFirst,
  keepUndatedBelow,
  undatedSeparatorIndex,
  lacksShownDatedSignal,
  type DiscoverSort,
} from '@/features/discover/lib/discover-ranking'
import {
  DISCOVER_EXPORT_COLUMNS,
  discoverCsv,
  discoverExportFilename,
  type DiscoverExportLabels,
} from '@/features/discover/lib/discover-export'
import {
  computePartnerComplementarity,
  isComplementarityUnknown,
  passesComplementarityKnown,
} from '@/features/discover/lib/discover-partner-complementarity'
import {
  applicationSectorLabel,
  MAX_SEARCH_SECTORS,
  matchApplicationSectors,
} from '@/features/discover/lib/discover-sectors'
import { parseDepartments, REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import { huntingRegionCodes } from '@/features/discover/lib/discover-offer-territory'
import { orderCallListByPack } from '@/features/discover/lib/discover-call-list-pack'
import { offerTargetBuyerRole } from '@/features/discover/lib/discover-offer-role'
import {
  extractFreetextZone,
  freetextSkillAndCity,
  parseNeedsFreetext,
} from '@/features/discover/lib/discover-needs-freetext'
import { headcountForProfileSize, proposeProfileSize } from '@/features/discover/lib/discover-profile-size'
import { personNameForView } from '@/features/discover/lib/discover-person-name-query'
import {
  PROFILE_SIZE_OFF,
  profileSizeDeclinedFromSearch,
  restoredFiltersFromSearch,
  searchFromFilters,
} from '@/features/discover/lib/discover-prefill'
import {
  applyRailConstraints,
  withSkills,
  decisionLevelImpact,
  filterContactRowsByDecisionLevel,
  knownContactLevelsByCompany,
  activeFiltersSummary,
  refinesWithoutLaunching,
  buildDiscoverRequest,
  buildPartnerCoverageIndex,
  buildPartnerRelationIndex,
  contractRecourseImpact,
  detectInconsistentFilters,
  isCapitalIncreaseOnly,
  emptyUnifiedFilters,
  isExpertiseUnknown,
  isObservedClientsUnknown,
  discoverOriginCriteriaFor,
  passesExistingRelationship,
  passesExpertiseKnown,
  passesFit,
  passesMinAccountsSeen,
  passesObservedClients,
  passesRank2Opening,
  primaryMode,
  skillCitationFirst,
  skillsText,
  suggestedWidenAxis,
  widenZoneOneStep,
  type FitFilter,
  type UnifiedFilters,
} from '@/features/discover/lib/discover-filters'
import { proposedVolumeForContext, volumeNoticeApplies } from '@/features/discover/lib/discover-capacity'
import { discoverEmptyReason, emptyListReason } from '@/features/discover/lib/discover-empty-reason'
import { usePartnerCoverage } from '@/features/discover/hooks/usePartnerCoverage'
import { DEFAULT_SIGNAL_SOURCES } from '@/features/discover/lib/discover-types'
import { useFeatureLock } from '@/features/plan-features/useFeatureLock'
import { downloadCSV } from '@/lib/export-csv'
import { useDataExit } from '@/lib/data-exit'
import { dataSourceLabel } from '@/lib/data-source-label'
import {
  applyCandidateFilters,
  hasDirectSignal,
  hasRoleFamily,
  hasSignalOfNature,
  hiddenCandidatesBreakdown,
  reconcileExcludedCount,
} from '@/features/discover/lib/discover-presentation'
import type { SavedSearch, SavedSearchDraft } from '@/features/discover/lib/discover-saved-searches'
import type { DiscoverCandidate, DiscoverSignal } from '@/features/discover/lib/discover-types'
import { splitDegraded, unverifiableReasons } from '@/features/discover/lib/discover-coverage'
import { secondPassScope } from '@/features/discover/lib/discover-second-pass'
import { unappliedFilters, unnamedCapabilities } from '@/features/discover/lib/discover-capability'
import { discoverSearchKey } from '@/features/discover/lib/discover-search-key'
import { forgetStoppedSearch, stopDiscoverSearch } from '@/features/discover/lib/discover-stop'
import { useDiscoverSearch, type DiscoverRequest } from '@/features/discover/hooks/useDiscoverSearch'
import { useDiscoverShortlist } from '@/features/discover/hooks/useDiscoverShortlist'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { useSavedSearches, useSavedSearchesStatus } from '@/features/discover/hooks/useSavedSearches'
import {
  readSearchHistory,
  recordSearch,
  writeSearchHistory,
  type SearchHistoryEntry,
} from '@/features/discover/lib/discover-search-history'
import { useSession } from '@/lib/hooks/use-session'
import { useConsultants } from '@/features/consultants/use-consultants'
import {
  forgetLastSearch,
  isBareDiscoverUrl,
  readLastSearch,
  rememberLastSearch,
} from '@/features/discover/lib/discover-last-search'
import { CreateTargetListFromSavedSearchDialog } from '@/features/target-lists/view/CreateTargetListFromSavedSearchDialog'
import { CandidateRow } from './CandidateRow'
import { DiscoverHistoryBlocks } from './DiscoverHistoryBlocks'
import {
  historySubject,
  splitDiscoverBlocks,
  type HistoryReason,
} from '@/features/discover/lib/discover-history-blocks'
import {
  DISCOVER_FIRST_LOT,
  DISCOVER_LIST_STEP,
  applyRequestLimit,
  canRequestMore,
  displayedCount,
  headerCounts,
  listWindow,
  nextRequestLimit,
} from '@/features/discover/lib/discover-list-window'
import { DegradedBanner } from './DegradedBanner'
import { useJobsPendingRetry } from '@/features/discover/hooks/useJobsPendingRetry'
import {
  ACCESS_CLASSES,
  DEFAULT_DISCOVER_RESULT_TYPE,
  discoverResultTypeFrom,
  type AccessBarrierClass,
  type AnalysisBatchSource,
  type BuyerRoleFamilyKey,
  type DiscoverFamily,
  type DiscoverResultType,
} from '@bellum/contracts'
import { useCommuneCoordinatesReady } from '@/lib/zones/commune-coordinates'
import { familyOf } from '@/features/discover/view/FamilyBadge'
import { EntityTypeFilteredNotice } from './EntityTypeFilteredNotice'
import { OtherActorsTab, type ActorsTab } from './OtherActorsTab'
import {
  isOtherActor,
  OTHER_ACTOR_KINDS,
  otherActorRows,
  otherKindsForEntityType,
  type OtherActorKind,
} from '../lib/discover-other-actors'
import { CoverageNotice } from './CoverageNotice'
import { SectorCoverageNotice } from './SectorCoverageNotice'
import { sectorCoverageReading } from '@/features/discover/lib/discover-sector-coverage'
import { IncompleteSearchNotice } from './IncompleteSearchNotice'
import { ProfileSizeNotice } from './ProfileSizeNotice'
import { incompleteSearchMatched, matchedCandidatesCount } from '@/features/discover/lib/discover-incomplete-search'
import { ListingFilterNotice } from './ListingFilterNotice'
import {
  applyZoneCeiling,
  applyZoneRaise,
  applyZoneStrict,
  nextZoneRaise,
  splitByRadius,
  zoneWideningOfList,
  type ZoneRaiseTier,
} from '@/features/discover/lib/discover-zone-widening'
import { belowTargetHeadcount } from '@/features/discover/lib/discover-below-target'
import { TargetSectorFilterNotice } from './TargetSectorFilterNotice'
import { WideningBanner } from './WideningNotice'
import { PlaceResolutionNotice } from './PlaceResolutionNotice'
import { SearchEffortNotice } from './SearchEffortNotice'
import {
  effortConsistentWithFaults,
  normalizeListCut,
  normalizeSearchEffort,
  signalsBudgetCut,
} from '../lib/discover-search-effort'
import { normalizePlaceResolution } from '../lib/discover-place-resolution'
import { DiscardedHoldingsNotice } from './DiscardedHoldingsNotice'
import { ProposedVolumeNotice } from './ProposedVolumeNotice'
import { DeliveryCapacityNotice } from './DeliveryCapacityNotice'
import { discoverCapacityNotice } from '@/features/discover/lib/discover-capacity-notice'
import { DecisionLevelNotice, type DecisionLevelNoticeState } from '@/features/discover/view/DecisionLevelNotice'
import { CapabilityNotice } from './CapabilityNotice'
import { AmbiguityNotice } from './AmbiguityNotice'
import { DiscoverSplitSuggestionNotice } from './DiscoverSplitSuggestionNotice'
import { suggestDiscoverSplit } from '@/features/discover/lib/discover-split-suggestion'
import { collapseBrandMembers } from '@/features/discover/lib/discover-brand-group'
import { SearchReadingNotice } from './SearchReadingNotice'
import { keptCriteriaLabels, withoutKeptCriteria } from '@/features/discover/lib/discover-name-search'
import { PreLaunchReading } from './PreLaunchReading'
import { requestReadingFrom } from '@/features/discover/lib/discover-reading'
import { onboardingSectorProposal } from '@/features/discover/lib/discover-onboarding-sectors'
import { blockingFilters, freelanceSignalMissing } from '@/features/discover/lib/discover-blocking-filters'
import {
  BlockingFiltersNote,
  DiscoverEmpty,
  DiscoverError,
  DiscoverLoading,
  DiscoverStopped,
  DiscoverStoppedPartial,
  DiscoverUnreadable,
  DiscoverUnverifiable,
} from './DiscoverStates'
import { SaveSearchDialog } from './DiscoverSidebar'
import { MyTargetToggle } from './MyTargetToggle'
import { poseMyTarget, retireMyTarget } from '@/features/discover/lib/discover-my-target'
import { DiscoverHistory } from './DiscoverHistory'
import {
  DiscoverBreakdown,
  DiscoverHeader,
  DiscoverKpis,
  DiscoverMarketToolbar,
  DiscoverPager,
  DiscoverQualityNotes,
  DiscoverSearchCard,
  MarketToolbarButton,
  DiscoverTracks,
  type DiscoverKpi,
  type DiscoverListView,
  type DiscoverTrack,
} from './DiscoverOverview'
import { marketBreakdown } from '@/features/discover/lib/discover-market-breakdown'
import { DiscoverMethod } from './DiscoverMethod'
import { ResultsToolbar } from './ResultsToolbar'
import { ResultTypeSelector } from './ResultTypeSelector'
import { ContactsResults, NeedsResults } from './ProjectionResults'
import type { PersonNameRequest } from './PersonNameResults'
import { useDiscoverPeople } from '@/features/discover/hooks/useDiscoverPeople'
import { useDiscoverCallList } from '@/features/discover/hooks/useDiscoverCallList'
import { useFindCallListPeople } from '@/features/discover/hooks/useFindCallListPeople'
import { mergeKnownSignals } from '@/features/discover/lib/discover-known-signals'
import {
  contactCountryScope,
  contactRowsFrom,
  emptyContactFilters,
  peopleSearchCriteria,
  type DiscoverContactFilters,
} from '@/features/discover/lib/discover-contact-rows'
import { needRowsFromCandidates } from '@/features/discover/lib/discover-result-rows'
import { selectedCandidates, splitSelectionByAccount, toggleSelected } from '@/features/discover/lib/discover-selection'
import {
  buildCallListRows,
  callListPeople,
  callListExportFilename,
  callListFunnel,
  discoverCallListCsv,
  emptyCallListFilters,
  type DiscoverCallListFilters,
  type DiscoverCallListLabels,
} from '@/features/discover/lib/discover-call-list'
import { CallListResults } from './CallListResults'
import { ProjectionSearchFields } from './ProjectionSearchFields'
import { SelectionBar } from './SelectionBar'
import { AddToTargetListDialog } from './AddToTargetListDialog'
import { AssignSelectionDialog } from './AssignSelectionDialog'
import { AnalyzeSelectionDialog } from './AnalyzeSelectionDialog'
import { FilterRail } from './FilterRail'
import { consultantSelectOptions } from './NeedsFiltersBlock'
import {
  framingLoadedCount,
  sameFramingExtras,
  type FramingExtras,
  type FramingOpenRequest,
} from '@/features/discover/lib/discover-framing'
import { expertiseHeadline, monogram, overviewCounters } from '@/features/discover/lib/discover-overview'
import { SimilarPanel } from './SimilarPanel'
import { applyContextMode, contextModeFromSearch } from '@/features/discover/lib/discover-context-mode'
import { homonymSirensBySiren, maskHomonymSignals } from '@/features/discover/lib/discover-homonyms'
import { applyOutOfTarget, nextSectorsCleared } from '@/features/discover/lib/discover-out-of-target'
import { applyStrictCriteria, wideningOf } from '@/features/discover/lib/discover-widening'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/* ------------------------------------------------------------------ */
/*  Découvrir — coquille de l'écran (maquette p.20).                    */
/*                                                                     */
/*  UN seul rail de filtres CROISABLES remplace les trois modes         */
/*  exclusifs d'avant. L'utilisateur croise dans une même recherche une  */
/*  cible structurée (secteur(s) × zone × taille × âge), des signaux     */
/*  d'intention (recrutement, marché public…) et un niveau de fit.       */
/*                                                                     */
/*  Sous le capot, deux sources de vérité alimentent la même liste :     */
/*  le SIGNAL dès qu'une intention est cochée (seul à dire « qui bouge    */
/*  maintenant »), sinon le REGISTRE. Les critères que la source          */
/*  primaire n'exprime pas nativement sont croisés côté écran, sur les    */
/*  faits réels déjà renvoyés — jamais fabriqués.                        */
/*                                                                     */
/*  « Comptes comparables au portefeuille » survit en panneau secondaire */
/*  (ses suggestions n'ont ni SIREN ni score — non croisables), ouvert à  */
/*  la demande plutôt qu'imposé comme un troisième onglet.               */
/* ------------------------------------------------------------------ */

const PARTNER_ONLY_KINDS: readonly OtherActorKind[] = ['partner']

export function Discover() {
  const { t, i18n } = useTranslation('discover')
  const { t: tCommon } = useTranslation('common')
  // Gating par offre : l'export CSV fait partie des exports du palier. Le
  // bouton reste visible, grisé — le clic ouvre l'upsell.
  const exportsLock = useFeatureLock('exports')
  // #2081.14 — les trois CSV de Découvrir sont construits DANS le navigateur :
  // la règle d'espace « qui peut exporter » se lit ici, décidée par l'API.
  // Refusée, chaque bouton d'export est MASQUÉ (pas grisé : ce n'est pas une
  // offre à monter, c'est une règle de l'espace).
  const dataExit = useDataExit()
  const navigate = useNavigate({ from: '/discover/' })
  const location = useLocation()
  const routeSearch = Route.useSearch()

  const [filters, setFilters] = useState<UnifiedFilters>(emptyUnifiedFilters)
  /** Instantané des filtres de la recherche EN COURS (le rail peut être édité
   *  sans relancer). Le croisement côté écran s'appuie dessus, jamais sur les
   *  filtres live — sinon une édition non lancée fausserait la liste. */
  const [activeFilters, setActiveFilters] = useState<UnifiedFilters>(emptyUnifiedFilters)
  /** #2165.7 — les filtres du type de résultat CONTACTS, déclarés ici (avant
   *  `applyPreset`) pour qu'un preset puisse aussi les pré-remplir (#2165.18). */
  const [contactFilters, setContactFilters] = useState<DiscoverContactFilters>(emptyContactFilters)
  /** #2545.2 — les filtres du tableau d'appels, séparés de ceux de « Contacts » :
   *  deux lectures différentes de la même liste de personnes. */
  const [callListFilters, setCallListFilters] = useState<DiscoverCallListFilters>(emptyCallListFilters)
  const [fit, setFit] = useState<FitFilter>('any')
  /** Filtre de famille (§8.2). `any` par défaut : l'écran ne décide pas à la
   *  place de l'utilisateur ce qu'il a le droit de voir. */
  const [family, setFamily] = useState<DiscoverFamily | 'any'>('any')
  /**
   * Filtre de CLASSE (tome 3) : porté par l'URL (`?class=A`), pas par un
   * `useState` — un réglage vit à UN seul endroit (GA-26), et c'est ce qui le
   * rend partageable et survivant au rechargement (§B du 30/08). `setAccessClass`
   * réécrit l'URL en repartant du search COURANT (`prev`, fourni par le
   * routeur) : un objet littéral aurait effacé `sectors`/`signals`/… posés par
   * ailleurs (préremplissage Copilote, `SituationPicker`) — le piège nommé
   * dans le brief de ce chantier.
   */
  /*
   * ⚠️ `?? 'any'` ne suffit pas, et le `<select>` natif masquait le trou.
   *
   * Le schéma de route fait `.catch(undefined)` sur une classe hors
   * vocabulaire (un lien collé de travers, `?class=Z`) — mais il peut aussi
   * laisser passer une chaîne que le menu ne propose pas. Un `<select>`
   * natif retombait alors silencieusement sur sa première option, donc
   * « toutes » ; un menu Radix n'affiche RIEN, et l'écran disait « aucun
   * filtre choisi » tout en filtrant sur rien. On borne donc au vocabulaire
   * réel plutôt que de compter sur un repli du navigateur.
   */
  const accessClass: AccessBarrierClass | 'any' =
    routeSearch.class && ACCESS_CLASSES.includes(routeSearch.class) ? routeSearch.class : 'any'
  const setAccessClass = useCallback(
    (next: AccessBarrierClass | 'any') => {
      void navigate({
        search: (prev: Record<string, unknown>) => ({ ...prev, class: next === 'any' ? undefined : next }),
      })
    },
    [navigate],
  )
  /**
   * #2165.7-.10 — LE TYPE DE RÉSULTAT, porté par l'URL comme `class`.
   *
   * UNE clé, donc UN type : l'exclusivité (#2165.10) n'est pas une règle que
   * l'écran applique, c'est la forme de l'état. `discoverResultTypeFrom` borne
   * au vocabulaire réel plutôt que de compter sur un repli du composant —
   * même défaut que celui nommé au-dessus pour `class`.
   */
  const routeResultType = discoverResultTypeFrom(routeSearch.type)
  // Lot U — « Partenaires » est FUSIONNÉ dans « Autres acteurs » : un lien `type=partners` ouvre « Autres acteurs »
  // (pastille Partenaires active), jamais un onglet mort.
  const resultType: DiscoverResultType = routeResultType === 'partners' ? 'accounts' : routeResultType
  const setResultType = useCallback(
    (next: DiscoverResultType) => {
      void navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          type: next === DEFAULT_DISCOVER_RESULT_TYPE ? undefined : next,
        }),
      })
    },
    [navigate],
  )
  const [hideOwned, setHideOwned] = useState(false)
  // #2165.26 — « Déjà travaillé » (client ou déjà analysé), INDÉPENDANT de
  // hideOwned qui masque aussi watched/parked. Voir `isWorkedByRep`.
  const [hideWorked, setHideWorked] = useState(false)
  // #2165.29 — Familles de rôles (`suggestedRoles`, croisé à l'écran). `any`
  // par défaut, même principe que `family`/`accessClass` ci-dessous.
  const [roleFamily, setRoleFamily] = useState<BuyerRoleFamilyKey | 'any'>('any')
  // #2165.45 — Nature du signal (`legal`/`tech` compris, non interrogeables
  // à la source). `any` par défaut.
  const [signalNature, setSignalNature] = useState<DiscoverSignal['type'] | 'any'>('any')
  // #2165.46 — Niveau de preuve : ne garder que les signaux non intermédiés.
  const [directSignalsOnly, setDirectSignalsOnly] = useState(false)
  // #4999.1 — « Uniquement freelance » sur l'onglet Besoins et signaux (le filtre du rail ne s'y appliquait pas).
  const [needsFreelanceOnly, setNeedsFreelanceOnly] = useState(false)
  // #2165.47 — Compte : texte libre cherché dans l'entreprise porteuse du besoin.
  const [needCompany, setNeedCompany] = useState('')
  // #2151.31-.34 / #2165.51/.53/.54/.56 — DÉCISION Louis 17/09 : un seul
  // filtre sur l'AGRÉGAT de l'espace remplace les quatre demandés. `null` =
  // pas de seuil. HORS de `activeFilters` (`UnifiedFilters`) à dessein — même
  // famille que `needCompany` ci-dessus : croise un agrégat externe, jamais
  // envoyé à la recherche (voir `passesMinAccountsSeen`, GA-275).
  const [minAccountsSeen, setMinAccountsSeen] = useState<number | null>(null)
  // #2151.33 — DÉCISION Louis 18/09 : les deux filtres restants de #2151,
  // livrés à côté de `minAccountsSeen` plutôt qu'en remplacement. Même
  // famille (HORS `activeFilters`, croisent l'agrégat de l'espace, jamais un
  // fait du candidat — voir `passesExistingRelationship`).
  const [existingRelationshipOnly, setExistingRelationshipOnly] = useState(false)
  // #2151.34 — idem, pour l'ouverture au rang 2 (`passesRank2Opening`).
  const [rank2OpeningOnly, setRank2OpeningOnly] = useState(false)
  // #2151.32 — DÉCISION Louis 18/09 : le troisième filtre de #2151, sur le
  // MÊME modèle (HORS `activeFilters`, croise l'agrégat de l'espace — voir
  // `passesObservedClients`). Sa donnée est DIFFÉRENTE des deux au-dessus :
  // la mémoire marché, jamais `account_partners`.
  const [observedClientsOnly, setObservedClientsOnly] = useState(false)
  // #2165.51 — filtre Expertise du panneau Partenaires (RÉFUTÉ en prod
  // 19/09 : absent). Fait DIRECT du candidat (`candidate.sector`), pas un
  // agrégat de l'espace — voir `passesExpertiseKnown`.
  const [expertiseKnownOnly, setExpertiseKnownOnly] = useState(false)
  // #2165.55 — filtre Complémentarité du panneau Partenaires (RÉFUTÉ en prod
  // 19/09 : 0 carte sur 24 portait le bloc). Même patron que `expertiseKnownOnly`
  // ci-dessus — voir `passesComplementarityKnown`.
  const [complementarityKnownOnly, setComplementarityKnownOnly] = useState(false)
  const [highPotentialOnly, setHighPotentialOnly] = useState(false)
  // `null` = l'utilisateur n'a pas choisi. Le tri proposé par le serveur
  // s'applique alors, et il est déduit de la maturité déclarée de l'ESN (§8.3) :
  // une ESN qui démarre ouvre sur l'accès, une ESN établie sur l'intérêt.
  const [sortChoice, setSortChoice] = useState<DiscoverSort | null>(null)
  // #3597.5 — « 10 comptes par défaut + Voir 10 de plus » : combien de lignes
  // sont révélées, et le `limit` élargi quand tout le chargé est déjà visible.
  // Les deux repartent de zéro à chaque nouvelle recherche / chaque affinage.
  const [shownCount, setShownCount] = useState(DISCOVER_LIST_STEP)
  const [limitOverride, setLimitOverride] = useState<number | null>(null)
  const [showMethod, setShowMethod] = useState(false)
  /** Panneau « comptes comparables au portefeuille » — ouvert à la demande. */
  const [showSimilar, setShowSimilar] = useState(false)
  // #3528 — la cible dépasse le plafond de secteurs : en attente du choix.
  const [pendingPlan, setPendingPlan] = useState<AutopilotPlan | null>(null)
  const [pendingPreset, setPendingPreset] = useState<DiscoverPreset | null>(null)
  /** #2504 — la modale « Pistes rapides », fermée par défaut : elle ne s'ouvre
   *  qu'au clic sur le bouton posé à côté de la saisie libre. */
  const [quickPresetsOpen, setQuickPresetsOpen] = useState(false)
  /*
   * #2486 — LA LECTURE DU TERRITOIRE A QUITTÉ DÉCOUVRIR (décision de Louis,
   * 16/09/2026). Le panneau « Territoire » (#1796.2 — couverture du
   * référentiel, ESN présentes, veille locale), sa bascule et la « ville
   * précise » du rail qui ne pilotait QUE lui sont retirés. Les routes
   * `territory/*` de l'API restent : Laura lit `territory/overview`.
   */
  /*
   * Lot K (31/10, revient sur #4632) — LA SECTION « MARCHÉ OBSERVÉ » SOUS LA LISTE EST RETIRÉE (décision de
   * Louis) : les comptes de la mémoire marché entrent dans la liste (source, #4791.2), plus de section à part.
   */
  // Le Profil ESN déclaré : alimente le volume proposé, les notices de capacité et les zones.
  const { data: esnAnswers } = useEsnProfile()
  // #4973 — les secteurs choisis à l'onboarding, PROPOSÉS dans le rail (jamais posés d'office, #4529.1).
  const onboardingSectors = useMemo(() => onboardingSectorProposal(esnAnswers), [esnAnswers])
  // #5203 — « Depuis un consultant » : les consultants de l'espace (déjà lus ailleurs), avec leur NOM et leur poste
  // (Louis 03/11 : ce sont les consultants de l'espace, ils se nomment ; la règle « rien d'identifiant » vise la
  // donnée marché, pas l'équipe). Sans pile, pas d'option.
  const consultantsRead = useConsultants().data
  const consultantOptions = useMemo(
    () => consultantSelectOptions(Array.isArray(consultantsRead) ? consultantsRead : []),
    [consultantsRead],
  )
  // #2291.9 — DÉCISION Louis 19/09 : le volume de comptes PROPOSÉS, adapté à
  // la capacité commerciale déclarée (`sales_team_size`, même lecture
  // `esnAnswers` que juste au-dessus, aucun appel réseau de plus).
  // #4304.1 — Neutre : notices équipe/capacité masquées. #4673.2 (31/10) : le VOLUME suit la taille d’équipe, Neutre compris.
  const isNeutralContext = (contextModeFromSearch(routeSearch.context) ?? 'neutral') === 'neutral'
  const proposedVolume = useMemo(
    () => proposedVolumeForContext(isNeutralContext, esnAnswers?.sales_team_size),
    [isNeutralContext, esnAnswers],
  )
  // #2804 (#2291.2) — LOT j3 26/09, tranché sans Louis : « capacité »
  // (livraison/montée en charge) AVERTIT, jamais ne filtre ni ne réordonne
  // les comptes — voir `discover-capacity-notice.ts`.
  const deliveryCapacity = useMemo(() => discoverCapacityNotice(esnAnswers), [esnAnswers])
  // #2165.12 / #2165.13 (DÉCISION Louis 17/09) — les SOURCES réelles des deux
  // presets sourcés : les secteurs déclarés au portefeuille d'offre (déjà des
  // codes normalisés, `offerPortfolioSchema`) et les secteurs des comptes
  // marqués « meilleure référence » (bruts, passés par le MÊME normaliseur
  // que l'ICP). Vide dans les deux cas ⇒ le preset se désactive et le DIT
  // (`disabledReason`, discover-presets.ts) — jamais une valeur devinée.
  const { data: offerPortfolio, isPending: portfolioPending } = useOfferPortfolio()
  // #3923.1 / #3923.a — le profil DÉCLARÉ qui classe et explique les signaux : les secteurs
  // refusés ET, depuis #3923.a, les métiers placés (`placed_roles`, transportés par
  // `esnAnswersSchema`) — une offre d'emploi hors métier passe après les autres.
  // #3901.p — déclarés, à défaut DÉDUITS (lot du 11/10) : ce qui décide si une offre d'emploi est un signal.
  const relevanceProfile = useHiringDomainProfile()
  const { data: bestReferences } = useBestReferences()
  const bestReferenceSectorCodes = useMemo(
    () =>
      matchApplicationSectors(
        (bestReferences ?? []).map(reference => reference.sector).filter((sector): sector is string => Boolean(sector)),
      ),
    [bestReferences],
  )
  // #2804 (#2291.2) — la zone de chasse déclarée au portefeuille d'offre,
  // traduite en codes région du rail (la SEULE traduction, `discover-offer-
  // territory.ts` — un second mapping ici en serait une copie, GA-26).
  const offerRegionCodes = useMemo(
    () =>
      // LUDOVIC-C LC.7 — TOUTES les zones : portefeuille ET profil (GA-26, une seule lecture).
      huntingRegionCodes(
        offerPortfolio?.target_geographies,
        esnAnswers?.geo_zones,
        esnAnswers?.company_locations,
        esnAnswers?.ideal_client_territory,
      ),
    [offerPortfolio, esnAnswers],
  )
  // #4529.1 (Louis 24/10) — l'arrivée est NEUTRE : aucune zone du profil ni du portefeuille n'est posée d'office.
  // Revient sur LUDB.2 (19/10, `f5583dc654`) pour l'arrivée seulement ; la zone se pose quand l'utilisateur la
  // choisit (piste « Territoire ») ou active « Ma cible » (#4530).
  // #2804 (#2291.2) — la famille de rôle acheteur déclarée au portefeuille
  // d'offre, résolue en clé du référentiel (la SEULE résolution,
  // `discover-offer-role.ts` — un second mapping ici en serait une copie, GA-26).
  const offerBuyerRole = useMemo(
    () => offerTargetBuyerRole(offerPortfolio?.preferred_buyer_role_families ?? []),
    [offerPortfolio],
  )
  const presets = useMemo(
    () =>
      discoverPresets({
        offerSectorCodes: offerPortfolio?.target_application_sectors,
        offerRegionCodes,
        offerBuyerRole,
        bestReferenceSectorCodes,
      }),
    [offerPortfolio, offerRegionCodes, offerBuyerRole, bestReferenceSectorCodes],
  )
  /**
   * Refonte Théo (23/10) — le rail de recherche n'est plus un `CollapsedSection` : ses critères tiennent
   * en UNE rangée de puces dans la carte « Quel marché veux-tu explorer ? », toujours visible (le repli de
   * #1796.1 / #2467 n'a plus de hauteur à gagner). Chaque puce ouvre son réglage ou la modale.
   */
  /** Refonte Théo — « Enregistrer » (en-tête « Ton marché ») ouvre la fenêtre d'enregistrement. */
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  /** #4493 — une piste ouvre « Cadrer la recherche » sur sa rubrique, brouillon pré-rempli (jamais lancé). */
  const [framingRequest, setFramingRequest] = useState<FramingOpenRequest | null>(null)
  /** Refonte Théo — « Filtrer les résultats affichés… » : un filtre d'écran sur le nom, jamais une recherche. */
  const [textFilter, setTextFilter] = useState('')
  /** #4495 — la vue de la liste des comptes : ligne large ou colonnes (les MÊMES cartes, empilées). */
  const [listView, setListView] = useState<DiscoverListView>('list')

  // `request` n'est posé qu'au clic : Découvrir est gratuit, mais on ne tire
  // pas sur les sources sans intention explicite de l'utilisateur.
  const [request, setRequest] = useState<DiscoverRequest | null>(null)

  /**
   * #2489.3/D1 (décision Louis, 18/09/2026 après-midi) — le bouton « chercher
   * hors de ma cible ». État à part de `request` : basculer ce bouton ne doit
   * pas exiger de relancer le rail — il se pose sur la recherche REGISTRE déjà
   * en cours (mode Signaux non concerné, voir `TargetSectorFilterNotice`).
   * Remis à `false` à chaque nouvelle recherche lancée (`launch`) : chaque
   * recherche repart filtrée par défaut, comme la décision l'exige.
   */
  const [includeOutOfTarget, setIncludeOutOfTarget] = useState(false)
  /** #4433 — « revenir au strict » : posé sur la recherche en cours, remis à `false` à chaque recherche lancée. */
  const [strictCriteria, setStrictCriteria] = useState(false)
  /**
   * #3873.6 — RENVERSE #2489.3/D1 (Louis 10/10) : l'utilisateur a VIDÉ les cases
   * secteurs du rail (il en avait coché) → la cible du profil est levée pour la
   * recherche qui suit. Un rail jamais touché ne pose rien.
   */
  const [sectorsCleared, setSectorsCleared] = useState(false)
  const onRailChange = useCallback(
    (next: UnifiedFilters) => {
      setSectorsCleared(was => nextSectorsCleared(was, filters.sectors, next.sectors))
      setFilters(next)
    },
    [filters.sectors],
  )
  /**
   * #2454.10 — le mode de contexte, lu dans l'URL (`?context=neutral`) et posé
   * sur la recherche en cours sans relancer le rail : basculer de mode relance
   * la MÊME recherche (la clé de cache change), jamais une autre.
   */
  // #4529.1 — sans `?context`, Découvrir envoie EXPLICITEMENT `neutral` : il ne laisse plus le serveur appliquer
  // `workspaces.default_context_mode` (Découvrir seul, #4529.5 — le réglage d'espace et Laura ne changent pas).
  // #2454.4 est gardé : un lien qui porte `?context=…` (mission ponctuelle comprise) le conserve.
  const contextMode: ContextMode = contextModeFromSearch(routeSearch.context) ?? 'neutral'
  /** #4429.4 — « Revenir à Toulouse seule » : la ville stricte pour CETTE ville (une autre ville
   *  retrouve les paliers de zone). */
  const [zoneStrictCity, setZoneStrictCity] = useState<string | null>(null)
  /** #4429.4 (25/10) — « Revenir à la grande région / à 100 km » : l'échelle de CETTE ville est bornée à ce barreau. */
  const [zoneStep, setZoneStep] = useState<{ city: string; ceiling: ZoneCeiling; radiusKm?: number } | null>(null)
  /** #4433.3 (01/11) — « Élargir la zone » MONTE d'un palier (département, puis région) : la ville reste posée. */
  const [zoneRaise, setZoneRaise] = useState<{ city: string; tier: ZoneRaiseTier } | null>(null)
  const effectiveRequest = useMemo<DiscoverRequest | null>(() => {
    return applyRequestLimit(
      applyContextMode(
        applyZoneRaise(
          applyZoneCeiling(
            applyZoneStrict(
              applyStrictCriteria(applyOutOfTarget(request, includeOutOfTarget), strictCriteria),
              zoneStrictCity,
            ),
            zoneStep,
          ),
          zoneRaise,
        ),
        contextMode,
      ),
      limitOverride,
    )
  }, [request, includeOutOfTarget, strictCriteria, zoneStrictCity, zoneStep, zoneRaise, contextMode, limitOverride])

  // #4429.4 — la zone est stricte quand le geste a RÉELLEMENT posé `zoneStrict` sur la recherche affichée.
  const zoneStrictPlace =
    zoneStrictCity && effectiveRequest?.mode === 'registry' && effectiveRequest.query.filters.zoneStrict
      ? zoneStrictCity
      : null

  // #4429.4 — le barreau posé par « Revenir à 100 km » : dit tant que la recherche affichée le porte RÉELLEMENT.
  const zoneCeilingStep =
    zoneStep && effectiveRequest?.mode === 'registry' && effectiveRequest.query.filters.zoneCeiling
      ? { place: zoneStep.city, ceiling: zoneStep.ceiling }
      : null

  // #4490.2 — « Arrêter » : la clé de la recherche coupée. Tant qu'elle est celle de la recherche affichée,
  // l'écran dit « recherche arrêtée » (et jamais une erreur) ; toute nouvelle recherche l'efface.
  const queryClient = useQueryClient()
  const [stoppedKey, setStoppedKey] = useState<string | null>(null)
  const stoppedRequest = useRef<DiscoverRequest | null>(null)
  const requestKey = JSON.stringify(discoverSearchKey(effectiveRequest))
  const searchStopped = stoppedKey === requestKey
  const stopSearch = useCallback(() => {
    // #4490.2 — coupe l'appel (AbortSignal) et rend la main ; les critères du rail ne bougent pas.
    stoppedRequest.current = effectiveRequest
    setStoppedKey(requestKey)
    void stopDiscoverSearch(queryClient, effectiveRequest)
  }, [queryClient, effectiveRequest, requestKey])
  const {
    data,
    isFetching,
    isError,
    error: searchError,
    refetch,
  } = useDiscoverSearch(effectiveRequest, {
    keepPrevious: limitOverride !== null,
    // #4363.3 — les premières entreprises s'affichent avant la fin des enrichissements (pas sur « Voir 10 de plus »,
    // où la liste déjà affichée est gardée).
    firstLot: limitOverride === null ? DISCOVER_FIRST_LOT : undefined,
  })
  // #4419.8 — « Choisir l'entreprise » : le choix est écrit pour l'espace, puis la recherche est relue.
  const chooseEmployer = useChooseEmployer(() => void refetch())
  // #4045 — des cartes n'ont pas pu être cherchées dans le budget : UNE relecture ~20 s plus
  // tard (la collecte a fini en arrière-plan), les cartes se mettent à jour sans recharger.
  // #4363.3 — un premier lot n'est ni une liste coupée par son budget ni une carte à relire : ces deux lecteurs
  // attendent la liste complète.
  const completeData = data?.partial ? undefined : data
  // Théo D team-recherches.N1 — la recherche menée à ses résultats est gardée pour l'équipe.
  useRecordDiscoverResearch(activeFilters, completeData ? completeData.candidates.length : null)
  // #4490.2 — une recherche arrêtée ne rappelle rien : ni relecture des offres, ni second passage.
  const jobsSearching = useJobsPendingRetry(
    { data: searchStopped ? undefined : completeData, isFetching, refetch },
    JSON.stringify(effectiveRequest),
  )
  const { followed, dismissed, toggleFollow, dismiss, restoreAllDismissed } = useDiscoverShortlist()

  /* #2166.54 — sélection multiple des résultats comptes. `Set<siren>`, vidée
   *  par tout geste de lot qui la consomme (#2166.55/.59/.60). */
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = useCallback((siren: string) => setSelected(current => toggleSelected(current, siren)), [])
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  const [targetDialogOpen, setTargetDialogOpen] = useState(false)
  // #2166.58 — même bascule que la cible, pour l'attribution de la sélection.
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  // #2166.56 — même bascule, pour l'analyse de LOT (acte payant, coût annoncé).
  const [analyzeDialogOpen, setAnalyzeDialogOpen] = useState(false)
  // #2293.3 — la recherche enregistrée actuellement rejouée, si le rail actif
  // en vient bien une (`applySavedSearch`) plutôt que d'un preset, de
  // l'autopilote ou d'un ajustement manuel : seul état qui distingue un lot
  // d'analyse « saved_search » d'un lot « discover » ordinaire.
  const [appliedSavedSearchId, setAppliedSavedSearchId] = useState<string | null>(null)
  const { searches, save, remove, markRun } = useSavedSearches()
  const { status: savedStatus } = useSavedSearchesStatus()
  const isDemo = useIsDemo()
  // « Mes recherches » : une vue de Découvrir portée par l'URL (`?view=history`), jamais une route neuve.
  const showHistory = (routeSearch as Record<string, unknown>).view === 'history'
  const openHistory = useCallback(
    () => void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, view: 'history' }) }),
    [navigate],
  )
  const closeHistory = useCallback(
    () => void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, view: undefined }) }),
    [navigate],
  )
  // #4313.1 — historique des recherches : 30 jours, 20 au plus, relançables.
  const historyUserId = useSession().user?.id
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>(() =>
    readSearchHistory(historyUserId, Date.now()),
  )
  useEffect(() => {
    setSearchHistory(readSearchHistory(historyUserId, Date.now()))
  }, [historyUserId])
  const { data: profileContext, isLoading: profileLoading } = useProfileContext()
  // T.1 — la taille du profil posée sur la recherche courante, et son retrait par l'utilisateur.
  // #4516.7 — la taille du profil est PROPOSÉE (puce cliquable), jamais appliquée.
  const [profileSizeProposed, setProfileSizeProposed] = useState<ReturnType<typeof proposeProfileSize>>(null)
  const [profileSizeDeclined, setProfileSizeDeclined] = useState(false)
  // #2157.9 — troisième porte manquante de #2853 : créer une cible depuis une
  // recherche enregistrée (les deux autres, Laura et CRM, n'ont aucun
  // connecteur existant — hors périmètre d'un lot borné).
  // #2157.57 — le geste ouvre l'APERÇU (chercher → aperçu → verser) ; rien ne se crée avant son « Créer la cible ».
  const [targetPreviewSearch, setTargetPreviewSearch] = useState<SavedSearch | null>(null)

  /* ---------------- Lancement ---------------- */

  /** Pose une recherche : fige les filtres actifs et dérive la requête. Un rail
   *  sans aucun critère laisse l'écran en état « idle » (`request === null`). */
  const idealProfile = profileContext?.profile_context?.idealAccountProfile
  const prefillApplied = useRef(false)
  const launch = useCallback(
    (
      requested: UnifiedFilters,
      declinedOverride?: boolean,
      prefillOnly?: boolean,
      /** #4530.4 — le geste « Ma cible » change le mode ET lance : l'URL et le volume suivent CE mode, pas celui d'avant. */
      switchTo?: ContextMode,
    ) => {
      // #4490.1 — pré-remplir n'est pas lancer : l'URL, la mémoire et le relais de Laura posent le rail et
      // s'arrêtent là (ni requête, ni historique, ni réécriture de l'URL). La taille et la zone du profil
      // se posent au lancement, visiblement, comme pour un rail posé à la main ; la requête part au clic seulement.
      if (prefillOnly) {
        setShowSimilar(false)
        setFilters(requested)
        if (declinedOverride !== undefined) setProfileSizeDeclined(declinedOverride)
        return
      }
      // #4516.6 — aucune taille posée d'office (revient sur T.1 du 19/10) : le profil la PROPOSE seulement.
      // R22-DV6 — une proposition écartée ne revient pas au lancement suivant.
      const declined = declinedOverride ?? profileSizeDeclined
      // #4529.1 — plus aucune zone du profil ajoutée au lancement : ce qui part est ce que le rail porte.
      const next = requested
      setProfileSizeProposed(proposeProfileSize(next, idealProfile, declined))
      if (declined !== profileSizeDeclined) setProfileSizeDeclined(declined)
      setShowSimilar(false)
      setFilters(next)
      // Une recherche lancée à la main écrit SON URL : le pré-remplissage d'arrivée n'a plus rien à relire.
      prefillApplied.current = true
      // #4490.2 — relancer une recherche arrêtée repart de zéro (la clé identique ne rappellerait rien).
      if (stoppedRequest.current) {
        forgetStoppedSearch(queryClient, stoppedRequest.current)
        stoppedRequest.current = null
        setStoppedKey(null)
      }
      setActiveFilters(next)
      // #4313.1 — chaque recherche LANCÉE entre dans l'historique (sans critère : rien).
      setSearchHistory(previous => {
        const recorded = recordSearch(previous, next, Date.now())
        writeSearchHistory(historyUserId, recorded)
        return recorded
      })
      // #2293.3 — toute recherche LANCÉE autrement qu'en rejouant une recherche
      // enregistrée efface l'étiquette : un rail modifié après coup n'est plus
      // « cette » recherche enregistrée (`applySavedSearch` la repose juste
      // après cet appel, seul chemin qui la porte).
      setAppliedSavedSearchId(null)
      // #2291.9 — volume adapté à la capacité commerciale déclarée.
      const volume = switchTo
        ? proposedVolumeForContext(switchTo === 'neutral', esnAnswers?.sales_team_size)
        : proposedVolume
      const nextRequest = buildDiscoverRequest(next, Date.now(), volume.count)
      setRequest(nextRequest)
      // #4312 — une recherche sans critère n'est pas une recherche : plus rien à retrouver au retour.
      if (!nextRequest) forgetLastSearch(historyUserId)
      // #3597.5 — une nouvelle recherche repart de dix comptes, sans `limit` élargi.
      setShownCount(DISCOVER_LIST_STEP)
      setLimitOverride(null)
      // #2489.3/D1 — chaque recherche LANCÉE repart filtrée par la cible
      // déclarée par défaut ; le bouton ne survit pas d'une recherche à l'autre.
      setIncludeOutOfTarget(false)
      // #4433 — chaque recherche lancée repart avec l'élargissement par paliers permis.
      setStrictCriteria(false)
      // #2165.64 — le filtre vit dans l'URL, pas dans le composant : chaque
      // recherche LANCÉE (rail, preset, Copilote, autopilote…) réécrit l'URL
      // pour qu'un rechargement — ou un lien partagé — retrouve EXACTEMENT ce
      // qui vient d'être lancé. `searchFromFilters` porte TOUJOURS chaque clé
      // connue (valeur ou `undefined`) : un critère retiré EFFACE sa clé au
      // lieu de laisser une vieille valeur traîner. `laura` est explicitement
      // effacé ici : la mention « préparé par Laura » reste vraie pour CETTE
      // session (état React, jamais réinitialisé), mais l'URL qui survit —
      // au rechargement ou au partage — ne doit plus porter une origine que
      // la recherche courante n'a plus.
      void navigate({
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          ...searchFromFilters(next),
          ...(switchTo ? { context: switchTo === 'neutral' ? undefined : switchTo } : {}),
          laura: undefined,
          view: undefined,
          // R22-DV6 — un retrait explicite de la taille du profil se retrouve à la réouverture.
          profileSize: declined ? PROFILE_SIZE_OFF : undefined,
        }),
      })
    },
    [navigate, queryClient, proposedVolume, esnAnswers, idealProfile, profileSizeDeclined, historyUserId],
  )

  /** #4419.27 — « N hors effectif » : retirer la tranche (posée par l'utilisateur) relance sans elle. */
  const removeHeadcount = useCallback(() => {
    launch({ ...activeFilters, headcount: [] })
  }, [activeFilters, launch])
  /** #4516.7 — la proposition du profil, prise d'un geste : la tranche devient un filtre de l'utilisateur. */
  const applyProposedProfileSize = useCallback(() => {
    if (!profileSizeProposed) return
    launch({ ...activeFilters, headcount: headcountForProfileSize(profileSizeProposed) })
  }, [activeFilters, launch, profileSizeProposed])
  /** #4516.8 — écartée : elle ne revient pas, et l'URL le garde (`profileSize=off`, les liens restent valides). */
  const dismissProfileSize = useCallback(() => {
    setProfileSizeProposed(null)
    setProfileSizeDeclined(true)
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, profileSize: PROFILE_SIZE_OFF }) })
  }, [navigate])
  /**
   * #4317 — « Réinitialiser les filtres » repart VRAIMENT de zéro : le rail, mais aussi la recherche
   * lancée, l'URL, la zone et la tranche d'effectif posées depuis le profil (qui ne reviennent pas).
   */
  const resetAllFilters = useCallback(() => {
    const empty = emptyUnifiedFilters()
    setProfileSizeDeclined(true)
    setProfileSizeProposed(null)
    setShowSimilar(false)
    setSectorsCleared(false)
    setFilters(empty)
    setActiveFilters(empty)
    setRequest(null)
    forgetLastSearch(historyUserId)
    setShownCount(DISCOVER_LIST_STEP)
    setLimitOverride(null)
    setIncludeOutOfTarget(false)
    void navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, ...searchFromFilters(empty), laura: undefined }),
    })
  }, [navigate, historyUserId])
  /* ---------------- #4312 — retrouver la dernière recherche au retour ---------------- */

  // La recherche lancée (critères + type de résultat + mode de contexte) est mémorisée sous la forme que
  // l'URL porte déjà : revenir sur `/discover` NU (bouton de menu, retour de Laura) la rouvre. Les
  // résultats reviennent du cache de requêtes (`useDiscoverSearch`), pas d'un nouvel appel.
  useEffect(() => {
    if (!request) return
    rememberLastSearch(
      historyUserId,
      {
        ...searchFromFilters(activeFilters),
        type: resultType === DEFAULT_DISCOVER_RESULT_TYPE ? undefined : resultType,
        context: routeSearch.context,
        profileSize: profileSizeDeclined ? PROFILE_SIZE_OFF : undefined,
      },
      Date.now(),
    )
  }, [request, activeFilters, resultType, routeSearch.context, historyUserId, profileSizeDeclined])
  const lastSearchRestored = useRef(false)
  // #4493.7 (point 31, recette PR 12) — /discover s'ouvre SANS requête : la dernière recherche est PROPOSÉE
  // (« Reprendre ta dernière recherche »), jamais restaurée d'office. Revient sur la restauration de #4312.
  const [resumableSearch, setResumableSearch] = useState<Readonly<Record<string, string>> | null>(null)
  useEffect(() => {
    if (lastSearchRestored.current || !historyUserId) return
    lastSearchRestored.current = true
    // L'URL précise déjà sa demande (lien, Laura, rechargement) : elle prime, la mémoire ne s'y mêle pas.
    if (!isBareDiscoverUrl(location.search as Record<string, unknown>)) return
    setResumableSearch(readLastSearch(historyUserId, Date.now()))
  }, [historyUserId, location.search])
  const resumeLastSearch = useCallback(() => {
    if (!resumableSearch) return
    setResumableSearch(null)
    // #4556 — en démonstration, « Reprendre » MONTRE la liste (la salle répond une liste scriptée, sans collecte
    // payante) : sinon la requête se chargeait sans afficher une carte avant un « Explorer » non recettable.
    const restored = restoredFiltersFromSearch(resumableSearch)
    if (restored && isDemo) {
      launch(restored)
      return
    }
    // #4628.4 — hors démo, les critères promis (« Tes critères reviennent ») se POSENT dans le rail DANS LE GESTE :
    // avant, le seul détour par l'URL puis le pré-remplissage les rendait, et le rail restait vide (« Toute la
    // France », « Tous les secteurs »). Pré-remplissage seul (#4490.1) : la recherche part au clic sur Explorer.
    if (restored) {
      prefillApplied.current = true
      launch(restored, profileSizeDeclinedFromSearch(resumableSearch) ? true : undefined, true)
    }
    void navigate({ search: () => ({ ...resumableSearch }), replace: true })
  }, [navigate, resumableSearch, isDemo, launch])

  // #4574 — le champ libre du rail est aussi l'endroit où l'on tape un NOM : « Marion Sagnard chez Bedrock ».
  // Seule la vue des personnes lit un nom (c'est là que vivait la carte supprimée) ; une phrase qui ne désigne
  // personne efface la demande, et la recherche suit son chemin d'avant (le champ libre complète le rail).
  const [personNameRequest, setPersonNameRequest] = useState<PersonNameRequest | null>(null)
  const runSearchWith = useCallback(
    (railFilters: UnifiedFilters, sectorsCleared: boolean) => {
      // #4841 — « talend en occitanie » : la zone dite dans la phrase se POSE dans le rail (chip + URL) et ne repart
      // pas en mot-clé. Le rail reste la vérité : s'il porte déjà une zone, la phrase est laissée telle quelle.
      const railHasZone = railFilters.city.trim() || railFilters.department.trim() || railFilters.region.length > 0
      const zone = railHasZone ? null : extractFreetextZone(railFilters.freetext)
      const filters: UnifiedFilters =
        zone && (zone.region || zone.department)
          ? {
              ...railFilters,
              freetext: zone.rest,
              region: zone.region ? [zone.region] : railFilters.region,
              department: zone.department ?? railFilters.department,
            }
          : railFilters
      // #4574.7 — le nom se lit aussi depuis la vue Entreprises : la vue des personnes s'ouvre sur la carte.
      const personName = personNameForView(resultType, filters.freetext)
      setPersonNameRequest(personName ? { query: personName.query, nonce: Date.now() } : null)
      if (personName?.switchToContacts) setResultType('contacts')
      // #1796.1 — le point de lancement UNIQUE d'une recherche depuis le rail :
      // (`launch` sert aussi le pré-remplissage depuis le Copilote et l'autopilote).
      // #2165.60 — RÉFUTÉ en prod le 19/09 : une phrase libre en mode Besoins
      // ("qui recrute des développeurs Java à Toulouse") rendait des résultats
      // hors sujet, un rail resté VIDE. Le texte libre part TOUJOURS comme une
      // recherche REGISTRE (`buildDiscoverRequest`, mode 'registry') : ce qu'elle
      // peut poser dans des contrôles RÉELS — la ville (`city`, qui filtre
      // vraiment la requête registre), la nature du signal (`signalNature`, qui
      // filtre les lignes déjà rendues) et les mots-clés (`keywords`) — est posé
      // ICI, AVANT le lancement, pour que le rail le MONTRE. Le texte libre lui-
      // même n'est pas retiré : `SearchReadingNotice` continue de dire ce qu'il
      // n'a pas pu appliquer.
      if (resultType === 'needs' && filters.freetext.trim()) {
        const parsed = parseNeedsFreetext(filters.freetext)
        if (parsed.nature !== 'any') setSignalNature(parsed.nature)
        const next: UnifiedFilters = {
          ...filters,
          city: parsed.city ?? filters.city,
          // #4841 — la zone dite dans la phrase est posée dans le rail ; une zone déjà cochée y gagne (jamais écrasée).
          region: filters.region.length === 0 && parsed.region ? [parsed.region] : filters.region,
          department: filters.department || (parsed.department ?? ''),
          keywords: parsed.keywords ?? filters.keywords,
        }
        launch(next)
        if (sectorsCleared) setIncludeOutOfTarget(true)
        return
      }
      // #4419.29 — en mode Comptes, « dev vue à lille » pose la compétence ET la ville (100 km, #4641), rien de non tapé.
      const skillAndCity =
        resultType === 'accounts'
          ? freetextSkillAndCity(filters.freetext, Boolean(zone && (zone.region || zone.department)))
          : null
      if (skillAndCity) {
        const withZone = withSkills({ ...filters, freetext: '' }, skillAndCity.skill)
        launch({
          ...withZone,
          city: skillAndCity.city ?? withZone.city,
          // #4841 — « talend en occitanie », « java dans le gard » : la zone arrive dans le rail (chip + URL) ; celle déjà cochée y gagne.
          region: withZone.region.length === 0 && skillAndCity.region ? [skillAndCity.region] : withZone.region,
          department: withZone.department || (skillAndCity.department ?? ''),
        })
        if (sectorsCleared) setIncludeOutOfTarget(true)
        return
      }
      launch(filters)
      // #3873.6 — vidage explicite des secteurs : la cible est levée pour CETTE recherche.
      if (sectorsCleared) setIncludeOutOfTarget(true)
    },
    [launch, resultType, setResultType],
  )
  const runSearch = useCallback(() => runSearchWith(filters, sectorsCleared), [runSearchWith, filters, sectorsCleared])

  /* ---------------- Arrivée depuis le Copilote (V2 §14) / rechargement (#2165.64) ---------------- */

  // `find_accounts` ne cherche RIEN côté chat : il prépare des critères, et le
  // clic de l'utilisateur atterrit ici avec eux dans l'URL. On pose le rail et
  // on lance — l'utilisateur a déjà validé, et explorer ne coûte aucun crédit.
  // Une seule fois : l'écran reste ensuite piloté par le rail, pas par l'URL
  // (chaque `launch` la réécrit lui-même, voir plus haut).
  // #1903.23 / #1933.7 — « Laura a préparé cette vue » : ABSENT jusqu'ici,
  // alors que c'est exactement ce que ce préremplissage fait. Posé au même
  // moment que `launch(prefilled)`, jamais recalculé ensuite : un utilisateur
  // qui modifie le rail continue de voir la mention, ce qui reste vrai (les
  // critères DE DÉPART venaient bien de Laura), et le rail reste modifiable —
  // la mention ne fige rien.
  //
  // #2165.64 — LE FILTRE VIT DANS L'URL, PAS DANS LE COMPOSANT. Depuis que
  // `launch` écrit lui-même ses filtres dans l'URL, un rechargement porte les
  // MÊMES clés (`sectors`, `department`…) qu'une proposition de Laura —
  // `restoredFiltersFromSearch` (porte LARGE, `discover-prefill.ts`) les relit
  // dans les deux cas, sinon un rechargement perdrait le périmètre affiné.
  // Seul `laura=1` (posé par `discoverSearch`, `discover-handoff.tsx`, et
  // effacé par `launch` lui-même dès la première recherche lancée dans CETTE
  // session) distingue « Laura a composé cette URL » de « le commercial
  // recharge sa PROPRE recherche » — un rechargement silencieux ne doit pas
  // prétendre que Laura y est pour quelque chose.
  const [preparedByLaura, setPreparedByLaura] = useState(false)
  useEffect(() => {
    if (prefillApplied.current) return
    // DISCOVER-TAILLE T.1 — un lien direct (`/discover?sectors=nuclear`) attend la
    // lecture du profil : lancé avant, il partirait sans la taille visée.
    if (profileLoading) return
    const rawSearch = location.search as Record<string, unknown>
    const restored = restoredFiltersFromSearch(rawSearch)
    if (!restored) return
    prefillApplied.current = true
    // ⚠️ Le routeur type ses paramètres d'URL (`?laura=1` peut arriver en
    // NOMBRE, pas en chaîne) — même prudence que `filtersFromSearch` juste
    // au-dessus, qui passe déjà tout par `String(...)`.
    if (String(rawSearch.laura ?? '') === '1') {
      // Les critères venus de la conversation se VOIENT : la rangée de puces est toujours affichée.
      setPreparedByLaura(true)
    }
    // #4490.1 — pré-remplissage seul (voir `launch`), jamais un lancement.
    launch(restored, profileSizeDeclinedFromSearch(rawSearch) ? true : undefined, true)
  }, [location.search, launch, profileLoading])

  /*
   * #1627 → #4632 — l'arrivée depuis « Voir mes premières pistes » (Bienvenue / Profil ESN, `mc_*` dans l'URL)
   * ne rouvre plus un panneau : `restoredFiltersFromSearch` lit ces clés et les POSE DANS LE RAIL, par le
   * pré-remplissage juste au-dessus. Le clic sur le bouton unique lance la liste.
   */

  /* ---------------- Presets (V2 §17) : PRÉ-REMPLISSENT le rail ---------------- */

  const applyPreset = useCallback(
    (preset: DiscoverPreset, chosenSectors?: readonly string[]) => {
      // #3528 — un preset sourcé (« Compatibles avec mon offre », « Comme mes
      // références ») qui ramène plus de 5 secteurs : on DEMANDE de choisir.
      if (!chosenSectors && preset.patch.sectors && preset.patch.sectors.length > MAX_SEARCH_SECTORS) {
        setPendingPreset(preset)
        return
      }
      setPendingPreset(null)
      // #2165.19 — le preset pose AUSSI le type de résultat quand il en porte
      // un. `setResultType` écrit dans l'URL, `launch` dans l'état : deux
      // gestes, un seul clic, et aucun des deux n'écrase l'autre (le `search`
      // de `navigate` repart du search COURANT).
      if (preset.resultType) setResultType(preset.resultType)
      // #2165.18 (17/09/2026) — un preset qui atterrit sur CONTACTS peut aussi
      // pré-remplir les filtres de personnes (niveau, expertise) : le même
      // principe que `patch` côté comptes, « point de départ, pas boîte noire ».
      if (preset.contactFiltersPatch) setContactFilters({ ...emptyContactFilters(), ...preset.contactFiltersPatch })
      // #4490 — une piste POSE les critères et s'arrête là : seul « Explorer » dépense (aucun appel sans geste).
      launch(
        {
          ...emptyUnifiedFilters(),
          ...preset.patch,
          ...(chosenSectors ? { sectors: [...chosenSectors] } : {}),
        },
        undefined,
        true,
      )
    },
    [launch, setResultType],
  )

  /* ---------------- Colonne de gauche ---------------- */

  const applySavedSearch = useCallback(
    (search: SavedSearch) => {
      launch(search.filters)
      // Posé APRÈS `launch` : `launch` efface l'étiquette pour tout lancement,
      // celui-ci la repose pour ce cas précis.
      setAppliedSavedSearchId(search.id)
      // #3873 — « Rejouer » EST une exécution : sans ce geste, la carte
      // annonçait « Jamais rejouée » indéfiniment, même juste après le clic.
      markRun(search.id)
    },
    [launch, markRun],
  )

  // #4556 (craft rule n°9) puis #4628 — EN DÉMONSTRATION, /discover s'ouvre avec la première recherche enregistrée de
  // l'espace PROPOSÉE (un bouton), jamais jouée seule : #4490 tient, « une piste POSE les critères et s'arrête là :
  // aucun appel sans geste ». Avant #4628 l'arrivée la lançait (`launch(first.filters)`) : un prospect voyait une
  // recherche partir sans avoir rien cliqué, comme si le produit décidait à la place du commercial. Le clic la joue
  // (la salle répond alors une liste SCRIPTÉE, sans collecte payante). Hors démo, rien ne change (#4493.7 : la
  // mémoire est proposée, jamais restaurée d'office). Une URL qui précise sa demande prime ; sans recherche
  // enregistrée, rien n'est proposé (jamais une liste inventée). Ce n'est pas un « Rejouer » : la date de dernière
  // exécution de la recherche n'est pas touchée.
  const [demoProposal, setDemoProposal] = useState<SavedSearch | null>(null)
  const demoArrivalDone = useRef(false)
  useEffect(() => {
    if (!isDemo || demoArrivalDone.current || savedStatus !== 'ready') return
    demoArrivalDone.current = true
    if (!isBareDiscoverUrl(location.search as Record<string, unknown>)) return
    setDemoProposal(searches[0] ?? null)
  }, [isDemo, savedStatus, searches, location.search])
  const playDemoProposal = useCallback(() => {
    if (!demoProposal) return
    setDemoProposal(null)
    launch(demoProposal.filters)
    setAppliedSavedSearchId(demoProposal.id)
  }, [demoProposal, launch])

  /* #2151.3 / .6 / .11 — la colonne de gauche compose le libellé, l'objectif,
     la cadence et le partage ; les CRITÈRES viennent d'ici, du rail. */
  const saveCurrentSearch = useCallback((draft: SavedSearchDraft) => save({ ...draft, filters }), [filters, save])

  const createTargetFromSavedSearch = useCallback((search: SavedSearch) => setTargetPreviewSearch(search), [])

  /**
   * #4530 — le bouton bascule « Ma cible » (Louis 24/10) remplace le panneau « Ta cible » (`StartingPoint`) et le
   * sélecteur « Contexte ». Actif = `contextMode === 'my_activity'` (l'URL le porte, `?context=my_activity` ouvre
   * donc le bouton activé, #4530.7).
   *
   * Activer : le contexte « Mon activité » ET les critères du profil dans le rail (`poseMyTarget`, visibles et
   * retirables un à un), puis la recherche PART — revient sur #3659 / #2488 (pré-remplir sans lancer) pour CE
   * bouton seulement. Re-cliquer : `retireMyTarget` retire ce que le bouton avait posé (pas ce que l'utilisateur a
   * posé ensuite), le contexte repasse en Neutre, et la recherche repart. #3528 gardé : plus de 5 secteurs,
   * on DEMANDE de choisir (jamais de coupe silencieuse).
   */
  const myTargetPlan = useMemo(
    () =>
      autopilotPlan(idealProfile ?? null, offerRegionCodes, offerPortfolio?.target_application_sectors ?? [], {
        answers: esnAnswers,
        soldSeniority: offerPortfolio?.sold_seniority_levels,
        targetSite: offerPortfolio?.target_site,
      }),
    [idealProfile, offerRegionCodes, offerPortfolio, esnAnswers],
  )
  const [myTargetTrim, setMyTargetTrim] = useState<{ kept: number; total: number } | null>(null)
  const myTargetPosed = useRef<ReturnType<typeof poseMyTarget>['posed'] | null>(null)
  const myTargetOn = contextMode === 'my_activity'
  const applyMyTarget = useCallback(
    (chosenSectors?: readonly string[]) => {
      setPendingPlan(null)
      setShowSimilar(false)
      const { filters: next, posed } = poseMyTarget(filters, myTargetPlan, chosenSectors)
      myTargetPosed.current = posed
      // #4490 — « Ma cible » POSE zone + secteurs (#4529.3) et le contexte, et s'arrête là : seul « Explorer » lance.
      launch(next, undefined, true)
      void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, context: 'my_activity' }) })
    },
    [filters, myTargetPlan, launch, navigate],
  )
  const toggleMyTarget = useCallback(() => {
    if (myTargetOn) {
      const retired = myTargetPosed.current ? retireMyTarget(filters, myTargetPosed.current) : filters
      myTargetPosed.current = null
      setMyTargetTrim(null)
      setShowSimilar(false)
      // #4490 — retirer « Ma cible » retire ses critères et le contexte, sans relancer.
      launch(retired, undefined, true)
      void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, context: undefined }) })
      return
    }
    // #4530 — jamais de modale bloquante : au-delà du plafond, les premiers secteurs sont posés ET la coupe est DITE
    // (`myTargetTrim`, #3528 gardé : pas de coupe silencieuse), avec un lien vers le réglage unique (GA-26).
    const profileSectors = myTargetPlan.basisKey === 'profile' ? myTargetPlan.filters.sectors : []
    if (profileSectors.length > MAX_SEARCH_SECTORS) {
      setMyTargetTrim({ kept: MAX_SEARCH_SECTORS, total: profileSectors.length })
      applyMyTarget(profileSectors.slice(0, MAX_SEARCH_SECTORS))
      return
    }
    setMyTargetTrim(null)
    applyMyTarget()
  }, [myTargetOn, myTargetPlan, filters, launch, applyMyTarget, navigate])

  /* ---------------- Résultats ---------------- */

  const rawCandidates: DiscoverCandidate[] = useMemo(() => data?.candidates ?? [], [data])
  // #2545 / #3819 (démo Ludovic 08/10) — la SOURCE UNIQUE des personnes et des
  // signaux que l'espace connaît déjà pour ces entreprises (`POST
  // /contacts/call-list`) : l'onglet Contacts, la liste d'appels et la carte
  // compte (signaux historisés, compte rapproché) lisent la MÊME réponse.
  const callList = useDiscoverCallList(rawCandidates, rawCandidates.length > 0)
  const knownCandidates: DiscoverCandidate[] = useMemo(
    () => (callList.byKey ? mergeKnownSignals(rawCandidates, callList.byKey) : rawCandidates),
    [rawCandidates, callList.byKey],
  )
  // #3901.p — décision Louis 16/10/2026 : une offre HORS des métiers de l'ESN ne s'affiche pas sur la carte ;
  // sur « Comptes qui recrutent », un compte qui n'a plus que des offres hors métier ne remonte pas.
  // La règle s'applique à la LECTURE : l'existant en profite sans rejeu.
  const hiringOnly = activeFilters.signalSources.length === 1 && activeFilters.signalSources[0] === 'hiring'
  const hiringScope = useMemo(
    () => scopeDiscoverHiring(knownCandidates, relevanceProfile, { dropEmpty: hiringOnly }),
    [knownCandidates, relevanceProfile, hiringOnly],
  )
  // #3819.11 / #3901.9 (18/10) — deux homonymes sans source pour départager : leur signal est MASQUÉ.
  const candidates: DiscoverCandidate[] = useMemo(() => maskHomonymSignals(hiringScope.items), [hiringScope.items])
  // #3819.11 / #3901.9 — deux sociétés de la réponse au même nom, SIREN différents : la carte NOMME l'ambiguïté.
  const homonyms = useMemo(() => homonymSirensBySiren(candidates), [candidates])
  const findPeople = useFindCallListPeople()

  /** Le tri EFFECTIF : celui que l'utilisateur a choisi, sinon celui que le
   *  serveur propose d'après la maturité déclarée. Proposé, jamais imposé.
   *
   *  Le serveur dit « interest » là où le tri s'appelle « score » côté écran :
   *  le renommer casserait les liens déjà partagés, qui portent le tri en
   *  paramètre d'URL. La traduction est EXPLICITE — un `as` laisserait passer
   *  une valeur qui ne correspond à aucun cas du comparateur, et la liste
   *  cesserait silencieusement d'être triée. */
  // #3814.1 — aucun secteur choisi : le défaut bascule sur la taille
  // (`defaultDiscoverSort`), au lieu du tri recommandé par le serveur qui
  // noie les grands comptes sous les TPE tant que rien d'autre ne les sépare.
  const sort: DiscoverSort = sortChoice ?? defaultDiscoverSort(activeFilters.sectors, data?.recommendedSort)
  const mode = request?.mode ?? primaryMode(activeFilters)
  // #4363 — les sources que la recherche en cours interroge vraiment.

  /**
   * #2165.55 / #2165.56 / #2151.34 — DÉFAUT mesuré en prod le 19/09 sur
   * `/discover?type=partners` : les agrégats ci-dessous ne lisaient QUE
   * `activeFilters.entityType === 'esn'` (le mode de RECHERCHE), jamais
   * `resultType === 'partners'` (la lecture « Partenaires » d'une recherche
   * de comptes ordinaire, `partnerRowsFromCandidates`) — le MÊME défaut déjà
   * nommé et corrigé côté rail pour Expertise (`FilterRail.tsx:177-182`),
   * jamais recopié jusqu'ici pour la complémentarité et le rang 2. Un seul
   * point de vérité pour tout ce qui suit (GA-26).
   */
  const partnerReadout = activeFilters.entityType === 'esn' || routeResultType === 'partners'
  // #4746.2 (lot P) — UNE liste, deux onglets. Une URL / un préréglage / une recherche enregistrée qui porte
  // `entityType=esn` ouvre « Autres acteurs » avec les pastilles ESN et partenaires ; `all` et `client` : « Comptes ».
  const urlOtherKinds =
    routeResultType === 'partners' ? PARTNER_ONLY_KINDS : otherKindsForEntityType(activeFilters.entityType)
  const [actorsTabChoice, setActorsTabChoice] = useState<ActorsTab | null>(null)
  const [otherKindsChoice, setOtherKindsChoice] = useState<OtherActorKind[] | null>(null)
  const actorsTab: ActorsTab = actorsTabChoice ?? (urlOtherKinds ? 'others' : 'accounts')
  const otherKinds: readonly OtherActorKind[] = otherKindsChoice ?? urlOtherKinds ?? OTHER_ACTOR_KINDS
  // Le compteur d'« Autres acteurs » n'existe qu'une fois l'onglet ouvert : avant, rien n'est affiché, jamais « 0 ».
  const [othersOpened, setOthersOpened] = useState(false)
  const showSkillIntermediaries = useCallback(() => {
    // #4419.6 — « Voir les cabinets et ESN » : l'onglet « Autres acteurs », pastilles Cabinets et ESN.
    setActorsTabChoice('others')
    setOthersOpened(true)
    setOtherKindsChoice(['recruiter', 'esn'])
  }, [])

  // #2151.31-.34 — l'agrégat de l'espace, lu en mode ESN ET en lecture
  // Partenaires (voir `partnerReadout` ci-dessus).
  const partnerCoverage = usePartnerCoverage({ enabled: partnerReadout })
  const partnerCoverageIndex = useMemo(
    () => buildPartnerCoverageIndex(partnerCoverage.data ?? []),
    [partnerCoverage.data],
  )
  // #2151.33 / #2151.34 — MÊME réponse que `partnerCoverageIndex` ci-dessus
  // (un seul appel réseau), lue une seconde fois pour la relation et le rang 2
  // OBSERVÉS (compte de l'espace, jamais une déclaration de l'ESN).
  const partnerRelationIndex = useMemo(
    () => buildPartnerRelationIndex(partnerCoverage.data ?? []),
    [partnerCoverage.data],
  )

  // #2151.36 / #2165.55 — la complémentarité n'a de sens qu'en recherche
  // ESN/partenaire (voir `partnerReadout` ci-dessus). Secteurs déclarés = ceux
  // du profil ESN (même lecture que l'autopilote, `discover-autopilot.ts`) ;
  // taille non câblée ici (aucune source de l'effectif PROPRE de l'ESN côté
  // écran) — l'axe reste NOMMÉ non évalué.
  const ownSectorsForComplementarity = useMemo(
    () => matchApplicationSectors(profileContext?.profile_context?.idealAccountProfile?.sectorsPriority ?? []),
    [profileContext],
  )
  const complementarityFor = useCallback(
    (candidate: DiscoverCandidate) =>
      partnerReadout
        ? computePartnerComplementarity(candidate, { sectors: ownSectorsForComplementarity, headcountRange: null })
        : undefined,
    [ownSectorsForComplementarity, partnerReadout],
  )

  /**
   * #2165.7 — les PERSONNES. Un moteur à part, et une requête qui ne part que
   * lorsque le type est choisi : le registre et le signal parlent
   * d'entreprises, ils ne savent rien des gens.
   *
   * Le terme libre du rail sert de recherche plein texte, sans quoi le type
   * « Contacts » ignorerait ce que l'utilisateur vient de taper.
   *
   * #3528.3 — le filtre « niveau de décision » lit AUSSI ces contacts, en vue
   * « Comptes » : la requête part alors sans terme libre (c'est tout l'espace
   * qui dit quels comptes ont un contact du niveau visé, pas la recherche).
   */
  const peopleView = (resultType === 'contacts' || resultType === 'calls') && !showSimilar
  // #4634 — « Contacts » sans entreprises de recherche (#3819) lit `GET /contacts` : ses critères y partent.
  const contactsSearched = resultType === 'contacts' && !showSimilar && !callList.byKey
  const contactSearchCriteria = useMemo(() => peopleSearchCriteria(contactFilters), [contactFilters])
  const people = useDiscoverPeople({
    // #2545.1 — le tableau d'appels a besoin des MÊMES personnes que
    // « Contacts » : c'est une jointure de cette liste avec les comptes de la
    // recherche, pas un second moteur.
    enabled: peopleView || activeFilters.decisionLevels.length > 0,
    q: peopleView ? filters.freetext || filters.keywords : '',
    // #4634 — les critères du volet CHERCHENT dans l'espace, ils ne trient plus 50 lignes déjà tirées. Seulement sur
    // « Contacts » lu depuis `GET /contacts` (`contactsSearched`) : la liste d'appels et le niveau de décision des
    // Comptes lisent CETTE même requête sans critère — un critère de personne n'y retire aucun compte.
    criteria: contactsSearched ? contactSearchCriteria : undefined,
  })
  const knownContactLevels = useMemo(() => knownContactLevelsByCompany(people.data?.data ?? []), [people.data])

  // Croisement côté écran : ce que la source primaire n'a pas honoré nativement
  // (secteur × effectif × âge × ville en mode Signaux), sur les faits réels.
  // #3528 (recette 03/10) — tant que les contacts de l'espace ne sont pas LUS (ou
  // illisibles), le niveau de décision n'est pas appliqué : une liste qui tombe à
  // zéro pendant le chargement dirait « aucun compte » sur une lecture qu'on n'a pas.
  const decisionLevelsActive = activeFilters.decisionLevels.length > 0
  const decisionLevelReady = !decisionLevelsActive || people.isSuccess
  const effectiveFilters = useMemo(
    () => (decisionLevelReady ? activeFilters : { ...activeFilters, decisionLevels: [] }),
    [activeFilters, decisionLevelReady],
  )
  // #5069 — le rayon en km lit le référentiel des communes, chargé à la demande : il recalcule la liste à son arrivée.
  const communeCoordinatesReady = useCommuneCoordinatesReady()
  const crossed = useMemo(
    () => applyRailConstraints(candidates, effectiveFilters, mode, Date.now(), knownContactLevels),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `communeCoordinatesReady` : lu en coulisse par `passesCity`
    [candidates, effectiveFilters, mode, knownContactLevels, communeCoordinatesReady],
  )
  const decisionLevelRemoved = useMemo(
    () =>
      decisionLevelsActive && decisionLevelReady
        ? decisionLevelImpact(candidates, activeFilters, mode, Date.now(), knownContactLevels)
        : null,
    [candidates, activeFilters, mode, knownContactLevels, decisionLevelsActive, decisionLevelReady],
  )
  // #2291.2 — ce que « recourt au freelance / à la régie » retire de CE MÊME
  // pool (il y est appliqué en premier), dont les comptes jamais observés :
  // dit à côté du filtre, jamais tu (inconnu ≠ non).
  const contractRecourseRemoval = useMemo(
    () => contractRecourseImpact(candidates, activeFilters),
    [candidates, activeFilters],
  )
  const kept = useMemo(
    () => applyCandidateFilters(crossed, { hideOwned, hideWorked, dismissed }),
    [crossed, hideOwned, hideWorked, dismissed],
  )
  // #2165.11 — DÉCISION Louis 17/09 midi : sur `kept` (le croisement rail),
  // pas sur `visible` — les filtres d'AFFICHAGE (fit/famille/classe) ne
  // reflètent pas la largeur de la RECHERCHE elle-même.
  const splitSuggestion = useMemo(() => suggestDiscoverSplit(kept, activeFilters), [kept, activeFilters])
  const applySplitSearch = useCallback(
    (patch: Partial<UnifiedFilters>) => {
      launch({ ...activeFilters, ...patch })
    },
    [activeFilters, launch],
  )
  /** Répartition PAR MOTIF de ce que `kept` retire de `crossed` (§C du 30/08) —
   *  « déjà à toi » et « écarté » sont deux affirmations différentes, et
   *  toutes deux déjà CONNUES ici (aucune n'est devinée). `hiddenCount` en est
   *  la SOMME, jamais un total calculé indépendamment : les deux ne peuvent
   *  donc plus diverger.
   *
   *  #2614.1 (correction) — `excluded` compté ici ne voit que `crossed`, DÉJÀ
   *  coupé à `limit` côté IA (verdicts EXCLU triés derniers, `_VERDICT_RANK`) :
   *  une recherche qui remplit sa page perd ses comptes exclus à cette coupe
   *  AVANT que ce compte local ne les voie. `reconcileExcludedCount` relève ce
   *  total au total RÉEL mesuré côté IA (`query.qualificationExcludedTotal`)
   *  quand il le dépasse — jamais l'inverse. */
  const hiddenBreakdown = useMemo(() => {
    const computed = hiddenCandidatesBreakdown(crossed, { hideOwned, hideWorked, dismissed })
    return { ...computed, excluded: reconcileExcludedCount(computed.excluded, data?.query) }
  }, [crossed, hideOwned, hideWorked, dismissed, data])
  /** Sous-total de la maquette : compté sur la liste RENDUE, pas sur la réponse. */
  // #2151.33 / #2151.34 — le pool ESN juste AVANT les trois chips de filtre
  // relationnel (relation existante / rang 2 / clients observés). Sert de
  // base COMMUNE à `visible` ET au compte d'impact de chaque chip
  // (`buildRelationChipImpacts` ci-dessous) : un seul calcul, jamais deux
  // pipelines qui pourraient diverger (GA-26).
  // #2165.51 — le pool AVANT le filtre Expertise, exposé à part : sert de
  // base à `preRelationChipsCandidates` ci-dessous ET au compteur d'inconnus
  // affiché à côté du filtre (`expertiseUnknownCount`), jamais deux calculs
  // qui pourraient diverger (GA-26).
  const preExpertiseCandidates = useMemo(() => {
    const byFit = kept.filter(candidate => passesFit(candidate, fit))
    // Le filtre de FAMILLE (§8.2) : « accessibles maintenant », « via un
    // intermédiaire »… Il ne masque jamais rien de lui-même — c'est un choix
    // de l'utilisateur, et « toutes » reste le défaut.
    const byFamily = family === 'any' ? byFit : byFit.filter(candidate => familyOf(candidate) === family)
    // Le filtre de CLASSE (tome 3). Un candidat dont la barrière n'est pas
    // estimable ne correspond à AUCUNE classe : il sort de la liste filtrée
    // plutôt que d'être rangé au hasard dans l'une des quatre.
    const byClass =
      accessClass === 'any' ? byFamily : byFamily.filter(candidate => candidate.barrier?.access_class === accessClass)
    // #2165.29 — Familles de rôles : `suggestedRoles` est une sortie, jamais
    // interrogeable en amont — croisement ici, comme famille/classe ci-dessus.
    const byRoleFamily = byClass.filter(candidate => hasRoleFamily(candidate, roleFamily))
    // #2165.45 — Nature du signal (legal/tech compris).
    const byNature = byRoleFamily.filter(candidate => hasSignalOfNature(candidate, signalNature))
    // #2165.46 — Niveau de preuve : signaux directs uniquement.
    const byProof = byNature.filter(candidate => hasDirectSignal(candidate, directSignalsOnly))
    // #2151.31-.34 — « vu sur N dossiers » : n'agit qu'en mode ESN, sur
    // l'agrégat de l'espace (jamais un fait du candidat lui-même).
    return byProof.filter(candidate =>
      activeFilters.entityType === 'esn'
        ? passesMinAccountsSeen(candidate.name, minAccountsSeen, partnerCoverageIndex)
        : true,
    )
  }, [
    kept,
    fit,
    family,
    accessClass,
    roleFamily,
    signalNature,
    directSignalsOnly,
    activeFilters.entityType,
    minAccountsSeen,
    partnerCoverageIndex,
  ])

  // #2165.51 — Expertise (secteur résolu au registre) : un fait DIRECT du
  // candidat, pas un agrégat de l'espace, mais même garde de mode que
  // `minAccountsSeen` ci-dessus (visible en mode ESN uniquement ici ; le
  // panneau Partenaires le montre aussi en mode registre, voir FilterRail).
  const preComplementarityCandidates = useMemo(
    () =>
      preExpertiseCandidates.filter(candidate =>
        activeFilters.entityType === 'esn' ? passesExpertiseKnown(candidate, expertiseKnownOnly) : true,
      ),
    [preExpertiseCandidates, activeFilters.entityType, expertiseKnownOnly],
  )
  // #2165.55 — Complémentarité : DÉRIVÉE (pas un fait direct), même patron
  // que `passesExpertiseKnown` ci-dessus — gardée par `partnerReadout` dès
  // le départ (jamais le défaut de gate `entityType==='esn'` seul que ce lot
  // corrige pour le rang 2 juste plus bas).
  const preRelationChipsCandidates = useMemo(
    () =>
      preComplementarityCandidates.filter(candidate =>
        partnerReadout
          ? passesComplementarityKnown(complementarityFor(candidate) ?? null, complementarityKnownOnly)
          : true,
      ),
    [preComplementarityCandidates, partnerReadout, complementarityKnownOnly, complementarityFor],
  )
  // #2165.55 — combien de candidats le filtre Complémentarité a ÉCARTÉS
  // faute d'AUCUN axe évalué : même règle que `expertiseUnknownCount`
  // ci-dessous, sur le pool juste avant lui, jamais après.
  const complementarityUnknownCount = useMemo(() => {
    if (!complementarityKnownOnly || !partnerReadout) return 0
    return preComplementarityCandidates.filter(candidate =>
      isComplementarityUnknown(complementarityFor(candidate) ?? null),
    ).length
  }, [preComplementarityCandidates, complementarityKnownOnly, partnerReadout, complementarityFor])

  // #2151.33 / #2151.34 — DÉCISION Louis 18/09 : les deux filtres restants de
  // #2151, appliqués EN CHAÎNE (jamais indépendamment) à partir du pool
  // ci-dessus — c'est ici que `visible` se construit réellement, jamais un
  // fait du candidat lui-même.
  const postRelationChipsCandidates = useMemo(() => {
    const byRelation = preRelationChipsCandidates.filter(candidate =>
      activeFilters.entityType === 'esn'
        ? passesExistingRelationship(candidate.name, existingRelationshipOnly, partnerRelationIndex)
        : true,
    )
    // #2165.56 / #2151.34 — DÉFAUT mesuré en prod le 19/09 : ce filtre ne
    // lisait QUE `entityType==='esn'`, jamais `resultType==='partners'` — sur
    // la lecture « Partenaires » d'une recherche de comptes ordinaire, le
    // chip « Tient le rang 2 quelque part » restait coché sans jamais rien
    // retirer (`: true` en silence). Voir `partnerReadout` ci-dessus.
    const byRank2 = byRelation.filter(candidate =>
      partnerReadout ? passesRank2Opening(candidate.name, rank2OpeningOnly, partnerRelationIndex) : true,
    )
    // #2151.32 — DÉCISION Louis 18/09 : le troisième filtre de #2151, même
    // garde de mode que `byRelation`/`byRank2` ci-dessus.
    return byRank2.filter(candidate =>
      activeFilters.entityType === 'esn'
        ? passesObservedClients(candidate.name, observedClientsOnly, partnerRelationIndex)
        : true,
    )
  }, [
    preRelationChipsCandidates,
    activeFilters.entityType,
    partnerReadout,
    existingRelationshipOnly,
    rank2OpeningOnly,
    observedClientsOnly,
    partnerRelationIndex,
  ])

  const visibleAll = useMemo(() => {
    const scoped = highPotentialOnly ? postRelationChipsCandidates.filter(isHighPotential) : postRelationChipsCandidates
    const sortedByChoice = sortCandidates(scoped, sort, {
      keyword: activeFilters.keywords,
      explicit: sortChoice !== null,
    })
    // KEVIN-FIX K.4 — les compétences saisies pèsent dans le rang, sauf sous un tri CHOISI (Taille, règle du 17/10).
    const sorted = sortChoice === null ? skillCitationFirst(sortedByChoice, activeFilters) : sortedByChoice
    // #3901.w — « Comptes qui recrutent » (la seule source `hiring`) : les recrutements du
    // domaine DÉCLARÉ de l'espace d'abord ; hors domaine = rang, jamais une suppression.
    // #4284.15 — le re-rang par domaine ne défait pas la partition « signal daté » au-dessus du séparateur.
    // #4284.26 — quel que soit le tri, un compte « hors de ton métier » vient APRÈS les autres.
    // #4284.15 (Louis 21/10, renverse #3941.4) — la partition « signal daté » est la DERNIÈRE passe, sous tous les tris.
    // #4892.1 — une marque = une ligne : les entités membres se replient sous leur tête (rien n'est fusionné).
    // Lot T point 4 — sans NAF/SIREN en bas, quel que soit le tri : DERNIÈRE passe, avant le repli des marques.
    return collapseBrandMembers(
      verifiedFirst(
        keepUndatedBelow(outOfTradeLast(hiringOnly ? rankByHiringDomain(sorted, relevanceProfile) : sorted)),
      ),
    )
  }, [postRelationChipsCandidates, highPotentialOnly, sort, sortChoice, hiringOnly, relevanceProfile, activeFilters])
  // #4746.2 (lot P) — UNE liste, deux onglets : « Comptes » = clients finaux SEULEMENT (jamais une ESN, un cabinet,
  // un intérim, un partenaire, un site d'annonces) ; le reste vit dans « Autres acteurs » (lot U : « Partenaires » y
  // est fusionné).
  // #5069 — le rayon choisi est tenu : un compte élargi hors rayon (ou sans distance connue) passe sous « Au-delà de N km ».
  const searchedRadiusKm =
    effectiveRequest?.mode === 'registry' && effectiveRequest.query.filters.city
      ? effectiveRequest.query.filters.radiusKm
      : undefined
  const { visible, beyondAt } = useMemo(() => {
    const shown = visibleAll.filter(candidate => !isOtherActor(candidate))
    const split = splitByRadius(shown, searchedRadiusKm, candidate => {
      // Le séparateur « Sans signal récent » garde sa partition : le rang hors cible ne départage que dans chaque classe.
      return (lacksShownDatedSignal(candidate) ? 2 : 0) + (belowTargetHeadcount(candidate.headcountRange) ? 1 : 0)
    })
    return { visible: split.ordered, beyondAt: split.beyondAt }
  }, [visibleAll, searchedRadiusKm])
  const otherActorCandidates = useMemo(() => visibleAll.filter(isOtherActor), [visibleAll])
  const otherRows = useMemo(
    () => otherActorRows(otherActorCandidates, data?.skillIntermediaries ?? []),
    [otherActorCandidates, data?.skillIntermediaries],
  )
  /**
   * #4494 — « Cadrer la recherche » : les affinages d'écran que la modale règle aussi, et l'application du
   * brouillon (même chemin que « Explorer » : `runSearchWith`, donc la même requête pour un même cadrage).
   */
  const framingExtras = useMemo<FramingExtras>(
    () => ({
      fit,
      minAccountsSeen,
      existingRelationshipOnly,
      rank2OpeningOnly,
      observedClientsOnly,
      expertiseKnownOnly,
      complementarityKnownOnly,
    }),
    [
      fit,
      minAccountsSeen,
      existingRelationshipOnly,
      rank2OpeningOnly,
      observedClientsOnly,
      expertiseKnownOnly,
      complementarityKnownOnly,
    ],
  )
  const applyFraming = useCallback(
    (draft: UnifiedFilters, next: FramingExtras) => {
      setFit(next.fit)
      setMinAccountsSeen(next.minAccountsSeen)
      setExistingRelationshipOnly(next.existingRelationshipOnly)
      setRank2OpeningOnly(next.rank2OpeningOnly)
      setObservedClientsOnly(next.observedClientsOnly)
      setExpertiseKnownOnly(next.expertiseKnownOnly)
      setComplementarityKnownOnly(next.complementarityKnownOnly)
      const cleared = nextSectorsCleared(sectorsCleared, filters.sectors, draft.sectors)
      setSectorsCleared(cleared)
      runSearchWith(draft, cleared)
    },
    [runSearchWith, sectorsCleared, filters.sectors],
  )
  /**
   * #4494.3 — « N comptes » recalculé en direct, SANS appel : sur les comptes déjà chargés, tant que le
   * brouillon ne change pas la requête elle-même (sinon le nombre se lit au lancement — jamais deviné).
   */
  const framingCountFor = useCallback(
    (draft: UnifiedFilters, next: FramingExtras): number | null => {
      if (request === null || !data || showSimilar) return null
      if (!sameFramingExtras({ ...next, fit }, framingExtras)) return null
      const now = Date.now()
      const sameRequest =
        JSON.stringify(discoverSearchKey(buildDiscoverRequest(draft, now, proposedVolume.count))) ===
        JSON.stringify(discoverSearchKey(buildDiscoverRequest(activeFilters, now, proposedVolume.count)))
      if (!sameRequest) return null
      // Le niveau de décision se lit sur les contacts de l'espace : tant qu'ils ne sont pas lus, aucun chiffre.
      if (draft.decisionLevels.length > 0 && !people.isSuccess) return null
      const keptFor = (value: UnifiedFilters, level: FitFilter) =>
        applyCandidateFilters(applyRailConstraints(candidates, value, mode, now, knownContactLevels), {
          hideOwned,
          hideWorked,
          dismissed,
        }).filter(candidate => passesFit(candidate, level))
      return framingLoadedCount(keptFor(draft, next.fit), keptFor(effectiveFilters, fit), visible)
    },
    [
      request,
      data,
      showSimilar,
      fit,
      framingExtras,
      proposedVolume.count,
      activeFilters,
      effectiveFilters,
      people.isSuccess,
      candidates,
      mode,
      knownContactLevels,
      hideOwned,
      hideWorked,
      dismissed,
      visible,
    ],
  )
  // #4045 — mot-clé saisi mais aucun signal ne le mentionne : dit, jamais un ordre inchangé muet.
  const keywordNotice = useMemo(
    () => keywordMatchNotice(visible, activeFilters.keywords),
    [visible, activeFilters.keywords],
  )
  const hiringNotice = useMemo(
    () => (hiringOnly ? hiringScopeNotice(relevanceProfile, hiringScope.hidden) : null),
    [hiringOnly, relevanceProfile, hiringScope.hidden],
  )
  // #3901.p — « N affichées dont M à fort potentiel » : la MÊME liste, M ≤ N toujours.
  // Refonte Théo — la liste se lit par PAGES de douze : tout le chargé est atteignable, le compteur dit tout le chargé.
  // Refonte Théo — « Filtrer les résultats affichés… » : sur le nom, sans accents ni casse. Un filtre d'ÉCRAN.
  // #4419 — l'annonce « N affichées » se calcule sur CETTE liste (`listWindow`), pas sur `visible` : un seul prédicat.
  const listed = useMemo(() => listWindow(visible, textFilter, 1).listed, [visible, textFilter])
  // #4997 — la liste est vide (ou < 3) avec ≥ 2 filtres posés : l'écran DIT lequel la vide, sur les candidats déjà reçus.
  const blocking = useMemo(
    () => blockingFilters(candidates, effectiveFilters, mode, listed.length, Date.now(), knownContactLevels),
    [candidates, effectiveFilters, mode, listed.length, knownContactLevels],
  )
  const freelanceMissing = useMemo(
    () => freelanceSignalMissing(candidates, effectiveFilters),
    [candidates, effectiveFilters],
  )
  const headerTotals = useMemo(() => headerCounts(listed, listed.length), [listed])
  // #4627 — le bandeau de zone se recompte sur les lignes RENDUES, pas sur ce que la collecte a ramené.
  // Intégration XIV (#4631) — « rendues » = `listed` (`listWindow`, filtre d'écran compris) : un seul prédicat.
  const zoneBanner = useMemo(
    () => zoneWideningOfList(data?.zoneWidening, listed, i18n.language),
    [data?.zoneWidening, listed, i18n.language],
  )
  const pageCount = Math.max(1, Math.ceil(listed.length / DISCOVER_LIST_STEP))
  const page = Math.min(pageCount, Math.max(1, Math.ceil(shownCount / DISCOVER_LIST_STEP)))
  const pageStart = (page - 1) * DISCOVER_LIST_STEP
  const pageRows = listed.slice(pageStart, pageStart + DISCOVER_LIST_STEP)
  const pageSelection: 'all' | 'some' | 'none' = pageRows.every(candidate => selected.has(candidate.siren))
    ? pageRows.length > 0
      ? 'all'
      : 'none'
    : pageRows.some(candidate => selected.has(candidate.siren))
      ? 'some'
      : 'none'
  const togglePageSelection = () =>
    setSelected(current => {
      const next = new Set(current)
      for (const candidate of pageRows) {
        if (pageSelection === 'all') next.delete(candidate.siren)
        else next.add(candidate.siren)
      }
      return next
    })
  // #3819.9 — où poser « Sans signal récent » (tous les tris, #4284.15) dans la liste affichée.
  // #5069 — le séparateur « Au-delà » prime : un compte sans signal daté au-delà du rayon n'ouvre pas un second bandeau.
  const undatedRaw = undatedSeparatorIndex(visible)
  const undatedAt = beyondAt >= 0 && undatedRaw >= beyondAt ? -1 : undatedRaw
  // #4761 — dès qu'un compte remonte sur son seul historique, la liste se range en deux blocs plafonnés.
  const historyBlocksMode = useMemo(() => splitDiscoverBlocks(listed).history.total > 0, [listed])

  // #3597.5 — le compteur « Voir 10 de plus » se réinitialise à 10 quand un
  // affinage change la liste (tri, famille, accès, masquages, signaux…) : on
  // ne révèle pas « 30 » d'une liste que l'affinage vient de refaire.
  useEffect(() => {
    setShownCount(DISCOVER_LIST_STEP)
  }, [
    sort,
    family,
    accessClass,
    hideOwned,
    hideWorked,
    roleFamily,
    signalNature,
    directSignalsOnly,
    highPotentialOnly,
    textFilter,
  ])

  // #3597.5 — « Voir 10 de plus » : révèle dix lignes ; quand tout le chargé est
  // déjà visible (et que la recherche peut en rendre plus), relance la requête
  // avec un `limit` plus grand — borné par `DISCOVER_MAX_LIMIT`, sans nouveau contrat d'API.
  // #4016 L7 — sans palier : le volume de capacité n'est qu'un premier lot,
  // la borne (200) est technique, et le registre est lu sur de vraies pages.
  const showMore = useCallback(() => {
    if (shownCount >= visible.length) {
      const requested = effectiveRequest?.query.limit
      if (requested !== undefined) setLimitOverride(nextRequestLimit(requested))
    }
    setShownCount(count => count + DISCOVER_LIST_STEP)
  }, [shownCount, visible.length, effectiveRequest])

  // #2151.32 — combien de candidats VISIBLES ne sont gardés que parce qu'un
  // compte reste INCONNU (jamais parce qu'ils sont réellement observés) :
  // l'écran doit pouvoir le dire, jamais le taire (doctrine c65/GA-259).
  const observedClientsUnknownCount = useMemo(() => {
    if (!observedClientsOnly || activeFilters.entityType !== 'esn') return 0
    return visible.filter(candidate => isObservedClientsUnknown(candidate.name, partnerRelationIndex)).length
  }, [visible, observedClientsOnly, activeFilters.entityType, partnerRelationIndex])

  // #2165.51 — combien de candidats le filtre Expertise a ÉCARTÉS faute de
  // secteur résolu : à la différence des trois chips ci-dessus, ce filtre
  // EXCLUT l'inconnu (un fait direct, pas un agrégat) — le compteur dit donc
  // ce qu'il a RETIRÉ, sur le pool juste avant lui, jamais après (sans quoi
  // il compterait toujours 0 une fois le filtre appliqué).
  const expertiseUnknownCount = useMemo(() => {
    if (!expertiseKnownOnly || activeFilters.entityType !== 'esn') return 0
    return preExpertiseCandidates.filter(candidate => isExpertiseUnknown(candidate)).length
  }, [preExpertiseCandidates, expertiseKnownOnly, activeFilters.entityType])

  // « X masquées » parle de ce que l'utilisateur a masqué (déjà travaillé,
  // écarté) ET, depuis #2614.1, de ce que le conseil de qualification a déjà
  // tranché (verdict EXCLU) — jamais du croisement d'écran, qui resserre la
  // liste sur ses filtres sans rien retirer d'invendable.
  const hiddenCount =
    hiddenBreakdown.excluded + hiddenBreakdown.owned + hiddenBreakdown.worked + hiddenBreakdown.dismissed

  /**
   * #2165.8 / #2165.9 — les deux autres lectures de LA MÊME liste.
   *
   * Elles partent de `visible`, pas de `candidates` : les filtres du rail et
   * de la barre restent donc vrais quel que soit le type affiché. Partir de la
   * réponse brute ferait apparaître, en « Besoins », des entreprises que
   * l'utilisateur vient explicitement de masquer.
   */
  const needsProjection = useMemo(() => needRowsFromCandidates(visible), [visible])
  // #2165.48 — les départements LANCÉS (`activeFilters`, pas le rail encore en
  // édition), déjà parsés une seule fois pour la liste de besoins.
  const needsDepartments = useMemo(() => parseDepartments(activeFilters.department), [activeFilters.department])
  /** Retrouver le candidat d'une ligne projetée — « Qualifier » est l'analyse
   *  du compte porteur, la même que depuis une carte. */
  const candidateBySiren = useMemo(
    () => new Map(visible.map(candidate => [candidate.siren, candidate] as const)),
    [visible],
  )

  /**
   * #2621.1 — le pays du workspace, pour la liste de personnes ci-dessous.
   * `market` est `undefined` tant que la requête n'a pas résolu : aucune
   * contrainte de pays ne part alors (`ContactsResults` ne la pose que si un
   * nom de pays existe).
   */
  const { market: workspaceMarket } = useWorkspaceMarket()
  const workspaceCountryName = contactCountryScope(
    Boolean(callList.byKey),
    workspaceMarket ? MARKET_COUNTRY_NAMES[workspaceMarket.market] : null,
  )

  // #3819 — avec une recherche d'entreprises, « Contacts » lit les personnes DE
  // CES entreprises (source unique, dans l'ordre des comptes affichés) ; sans
  // recherche, la recherche de personnes de l'espace (#2165.7) reste la source.
  const personSource = useMemo(
    () => (callList.byKey ? callListPeople(visible, callList.byKey) : (people.data?.data ?? [])),
    [callList.byKey, visible, people.data],
  )
  const contactRows = useMemo(
    () => filterContactRowsByDecisionLevel(contactRowsFrom(personSource), activeFilters.decisionLevels),
    [personSource, activeFilters.decisionLevels],
  )

  // #3528 (recette 03/10) — ce que dit l'écran quand le niveau de décision vide la
  // liste : le nombre écarté et la raison, jamais un vide muet.
  const decisionLevelNotice = useMemo<DecisionLevelNoticeState>(() => {
    if (!decisionLevelsActive) return { kind: 'off' }
    if (people.isError) return { kind: 'error' }
    if (!people.isSuccess) return { kind: 'loading' }
    if (peopleView) {
      const all = contactRowsFrom(personSource).length
      return { kind: 'ready', unit: 'contacts', removedCount: all - contactRows.length, shown: contactRows.length }
    }
    // Pas d'impact mesuré ⇒ rien à dire (jamais un « 0 » replié).
    if (!decisionLevelRemoved) return { kind: 'off' }
    return {
      kind: 'ready',
      unit: 'accounts',
      removedCount: decisionLevelRemoved.removedCount,
      shown: visible.length,
    }
  }, [
    decisionLevelsActive,
    people.isError,
    people.isSuccess,
    personSource,
    peopleView,
    contactRows,
    decisionLevelRemoved,
    visible,
  ])

  /**
   * #2545.1 / #2545.4 — le tableau d'appels : croise `visible` (les comptes
   * DÉJÀ filtrés à l'écran, #2165.8/.9) avec les contacts de l'espace, et en
   * tire la chute détectés → vérifiés → pertinents → enrichis. Aucun appel
   * réseau de plus que « Comptes » + « Contacts » pris séparément.
   */
  // LUDOVIC-C LC.3 — la liste d'appels suit le pack du profil, sur le MÊME `visible` que Comptes
  // (aucun second moteur) : hors pack écarté et compté, signal dans SES métiers d'abord.
  const callListPack = useMemo(
    () =>
      orderCallListByPack(visible, {
        industrial: offerPortfolio?.company_type === 'industrial_engineering',
        targetSectors: offerPortfolio?.target_application_sectors ?? [],
        relevanceProfile,
      }),
    [visible, offerPortfolio, relevanceProfile],
  )
  const callListProjection = useMemo(
    () => buildCallListRows(callListPack.kept, people.data?.data ?? [], callList.byKey),
    [callListPack, people.data, callList.byKey],
  )
  // Théo A decouvrir.R4 — le comptage des onglets : seulement ce qui est MESURÉ (contacts : une fois la
  // liste d'appels connue ; jamais le résultat d'une requête encore en vol).
  const resultTypeCounts = useMemo<Partial<Record<DiscoverResultType, number>>>(
    () => ({
      // #4631.5 — le badge d'onglet compte les lignes RENDUES, comme l'en-tête et la tuile.
      accounts: listed.length,
      needs: needsProjection.rows.length,
      ...(callList.byKey ? { contacts: contactRows.length, calls: callListProjection.rows.length } : {}),
    }),
    [listed, needsProjection, callList.byKey, contactRows, callListProjection],
  )
  // #5001 — sur combien de comptes (noms distincts) se répartissent les contacts comptés.
  const contactAccounts = useMemo(
    () => new Set(contactRows.map(row => row.company?.trim().toLocaleLowerCase()).filter(Boolean)).size,
    [contactRows],
  )
  const callListFunnelData = useMemo(
    () => callListFunnel(data?.coverage ?? null, callListProjection),
    [data, callListProjection],
  )
  const callListLabels = useMemo(
    () =>
      ({
        company: t('callList.columns.company'),
        website: t('callList.columns.website'),
        reason: t('callList.columns.reason'),
        signal: t('callList.columns.signal'),
        fullName: t('callList.columns.fullName'),
        title: t('callList.columns.title'),
        location: t('callList.columns.location'),
        email: t('callList.columns.email'),
        phone: t('callList.columns.phone'),
        confidence: t('callList.columns.confidence'),
        action: t('callList.columns.action'),
        portfolioState: {
          new: t('portfolio.new'),
          analyzed: t('portfolio.analyzed'),
          watched: t('portfolio.watched'),
          customer: t('portfolio.customer'),
          parked: t('portfolio.parked'),
        },
      }) as DiscoverCallListLabels,
    [t],
  )
  /** #2545.3 — même garde d'offre que l'export « Comptes » : un export est un
   *  export, quelle que soit la liste qu'il quitte. */
  const exportCallList = useCallback(
    (rows: Parameters<typeof discoverCallListCsv>[0]) => {
      if (exportsLock.locked || !dataExit.grant) return
      downloadCSV(
        discoverCallListCsv(rows, callListLabels),
        callListExportFilename(t('callList.exportFilename')),
        dataExit.grant,
      )
    },
    [callListLabels, t, exportsLock.locked, dataExit.grant],
  )

  /** #2375.8 — même garde d'offre que les deux exports ci-dessus : la
   *  checklist de session est déjà composée (CSV + nom de fichier) par le
   *  dialogue, cette fonction ne fait QUE déclencher le téléchargement sous
   *  le même grant. */
  const exportSession = useCallback(
    (csv: string, filename: string) => {
      if (exportsLock.locked || !dataExit.grant) return
      downloadCSV(csv, filename, dataExit.grant)
    },
    [exportsLock.locked, dataExit.grant],
  )

  // Une seule lecture de `degraded[]` pour les trois rendus : panne, borne de
  // couverture, limite de capacité. Elles se distinguent par le champ MACHINE
  // `kind`, jamais par le texte de `reason`.
  // #4677 — « volume demandé atteint » (effort de la recherche) ne cohabite jamais avec « résultats partiels ».
  const degradedSplit = useMemo(
    () =>
      splitDegraded(data?.degraded ?? [], { volumeReached: normalizeSearchEffort(data?.query)?.stoppedBy === 'limit' }),
    [data],
  )
  const unapplied = useMemo(() => unappliedFilters(degradedSplit.capabilities), [degradedSplit])
  // #2550.1 / #3878.1 — pourquoi ZÉRO résultat, quand ce n'est pas une panne
  // (`nothingCouldBeVerified` ci-dessous couvre déjà « source en panne »,
  // un chemin distinct) : secteur non exprimé par le registre, une
  // incohérence RÉELLEMENT détectée entre deux critères (jamais déduite du
  // seul nombre de critères actifs — RÉFUTÉ en recette le 08/10/2026), ou
  // repli honnête « aucune entreprise ne correspond ».
  const emptyReason = useMemo(
    () =>
      discoverEmptyReason({
        unappliedFields: new Set(unapplied.keys()),
        hasInconsistentFilters: detectInconsistentFilters(filters),
        capitalOnly: isCapitalIncreaseOnly(filters),
        hasSkills: skillsText(filters) !== '',
      }),
    [unapplied, filters],
  )
  // #2490 / #2496 — ce que la lecture de la demande en langage naturel a
  // appliqué, et ce qu'elle n'a pas pu appliquer (`query.reading`).
  const requestReading = useMemo(() => requestReadingFrom(data?.query), [data])

  /**
   * #3879.2 — RÉFUTÉ en recette prod le 08/10/2026 : le panneau « Recherche »
   * replié ne disait RIEN des critères actifs (secteur coché invisible sans
   * le rouvrir). Une ligne, visible MÊME repliée (`CollapsedSection.description`,
   * déjà posé pour cet usage ailleurs — jamais un second mécanisme).
   */
  const filterRailSummary = useMemo(() => {
    const summary = activeFiltersSummary(filters)
    if (!summary) return undefined
    const parts = [
      summary.sectorCodes.map(code => applicationSectorLabel(code, i18n.language)).join(', '),
      summary.otherCount > 0
        ? t(refinesWithoutLaunching(filters) ? 'rail.activeCountRefining' : 'rail.activeCount', {
            count: summary.otherCount,
          })
        : null,
    ].filter((part): part is string => Boolean(part))
    return parts.length > 0 ? parts.join(' · ') : undefined
  }, [filters, i18n.language, t])

  /* ---------------- #1766 — le TROISIÈME état ---------------- */
  //
  // Le bandeau « Résultats partiels » était rendu inconditionnellement dès que
  // `data` existait, pendant que `renderResults()` décidait SÉPARÉMENT
  // d'afficher `DiscoverEmpty`. Les deux ne se parlaient pas — d'où, le
  // 09/09/2026 chez un client : « ⚠ Résultats partiels — Les entreprises
  // ci-dessous restent exactes, mais la liste est incomplète » au-dessus de
  // ZÉRO entreprise. Message faux, et rassurant.
  //
  // Il faut donc QUATRE états, pas deux, et ils se décident ICI, en un seul
  // endroit : ce qui empêche de conclure (`unverifiable`) commande à la fois le
  // masquage du bandeau et le contenu rendu à la place de l'état vide.
  const unverifiable = useMemo(() => unverifiableReasons(degradedSplit), [degradedSplit])
  /** Zéro résultat ALORS QU'on n'a rien pu vérifier : « rien ne correspond à tes
   *  filtres » serait faux, « la liste est incomplète » aussi. */
  const nothingCouldBeVerified = candidates.length === 0 && unverifiable.length > 0

  const onAnalyze = useCallback(
    (candidate: DiscoverCandidate) => {
      // Le contexte VOYAGE : id de suggestion + raison, pas seulement le nom.
      // #3819 (lot RBB) — et les critères posés ET satisfaits suivent le compte.
      const analyzeSearch = buildAnalyzeSearch(candidate, discoverOriginCriteriaFor(candidate, activeFilters))
      // #2147.9/.10/.12 (épopée #2785) — la MÊME raison, transportée AUSSI
      // dans l'enveloppe de contexte générique (`ctx=`) : cette continuité
      // reste le producteur de `suggestionId`/`suggestionReason` (searchSchema
      // les lit directement, inchangé), l'enveloppe est un SECOND transport,
      // additif, que `ReturnToConversationBanner` sait lire sur N'IMPORTE
      // quelle continuité — pas seulement celle-ci.
      const envelope = createLauraContextEnvelope({
        sourceSurface: 'discover',
        targetSurface: 'analyze',
        company: analyzeSearch.company,
        suggestionId: analyzeSearch.suggestionId,
        reason: analyzeSearch.suggestionReason ?? null,
      })
      navigate({ to: '/search', search: { ...analyzeSearch, ...lauraContextSearch(envelope) } })
    },
    [navigate, activeFilters],
  )

  /**
   * #2166.32 / #2166.41 — « Qualifier » depuis une ligne de besoin ou de
   * partenaire.
   *
   * Aucun geste nouveau : c'est l'analyse du compte porteur, celle qu'une
   * carte déclenche déjà. Inventer une « qualification » séparée ferait un
   * second chemin pour la même décision, et c'est ce que la loi 1 du tome 7
   * interdit.
   */
  const qualify = useCallback(
    (siren: string) => {
      // #4284.24 (#4279.1) — un SIREN qui n'est plus dans la liste affichée ne reste pas muet : la cause + le geste suivant.
      const outcome = resolveQualifyTarget(candidateBySiren, siren)
      if (outcome.kind === 'missing') {
        toast.error(t('qualifyMissing'))
        return
      }
      onAnalyze(outcome.candidate)
    },
    [candidateBySiren, onAnalyze, t],
  )

  // Construite une seule fois : `exportResults` (liste entière) et
  // #2166.59 (sélection) doivent nommer les colonnes EXACTEMENT pareil —
  // deux constructions divergeraient tôt ou tard.
  const exportLabels = useMemo(
    () =>
      ({
        ...Object.fromEntries(DISCOVER_EXPORT_COLUMNS.map(column => [column, t(`results.exportColumns.${column}`)])),
        yes: t('results.exportYes'),
        no: t('results.exportNo'),
        portfolioState: {
          new: t('portfolio.new'),
          analyzed: t('portfolio.analyzed'),
          watched: t('portfolio.watched'),
          customer: t('portfolio.customer'),
          parked: t('portfolio.parked'),
        },
        // #1912.11 — la colonne Sources portait `pappers` dans le fichier téléchargé.
        dataSourceLabel: (name: string) => dataSourceLabel(t, name),
      }) as DiscoverExportLabels,
    [t],
  )

  // L'export reprend la liste TELLE QU'ELLE EST AFFICHÉE (mêmes filtres, même
  // tri) : un fichier qui contiendrait autre chose que l'écran serait une
  // seconde vérité.
  const exportResults = useCallback(() => {
    // Le CSV est fabriqué dans le navigateur : le refus se dit ici, pas au
    // serveur. Le bouton grisé ouvre l'upsell (`guard` ci-dessous) ; cette garde
    // couvre l'appel programmatique.
    if (exportsLock.locked || !dataExit.grant) return
    downloadCSV(discoverCsv(visible, exportLabels), discoverExportFilename(t('results.exportFilename')), dataExit.grant)
  }, [visible, exportLabels, t, exportsLock.locked, dataExit.grant])

  /* #2166.54 / #2166.55 / #2166.59 / #2166.60 — la sélection de lot. */
  const selectedList = useMemo(() => selectedCandidates(visible, selected), [visible, selected])
  const selectionSplit = useMemo(() => splitSelectionByAccount(selectedList), [selectedList])

  /** #2166.59 — exporte la SÉLECTION, pas la liste entière. */
  const exportSelection = useCallback(() => {
    if (exportsLock.locked || selectedList.length === 0 || !dataExit.grant) return
    downloadCSV(
      discoverCsv(selectedList, exportLabels),
      discoverExportFilename(t('results.exportFilename')),
      dataExit.grant,
    )
  }, [selectedList, exportLabels, t, exportsLock.locked, dataExit.grant])

  /** #2166.60 — masque toute la sélection d'un geste, puis la vide. */
  const dismissSelection = useCallback(() => {
    for (const candidate of selectedList) dismiss(candidate.siren)
    clearSelection()
  }, [selectedList, dismiss, clearSelection])

  /** État vide → « élargir la zone » : on relâche la contrainte la plus étroite. */
  const widenSearch = useCallback(() => {
    // #4433.3 (recette 01/11) — une ville posée MONTE d'un palier (département, puis région), elle n'est plus retirée :
    // l'écran gardait « ?freetext » seul et aucune ligne ne portait « Élargi ». L'effectif, lui, se relâche comme avant.
    const raise = nextZoneRaise(filters, zoneRaise)
    if (raise) {
      setZoneRaise({ city: filters.city, tier: raise })
      if (filters.headcount.length > 0) launch({ ...filters, headcount: [] })
      return
    }
    launch({ ...filters, city: '', department: '', headcount: [] })
  }, [filters, launch, zoneRaise])

  /** #3814.3 — la contrainte RÉELLEMENT posée, responsable d'une sortie maigre
   *  (`IncompleteSearchNotice`) — jamais une cible inventée quand aucune des
   *  trois (zone, effectif, compétence) n'est posée. */
  const widenAxis = suggestedWidenAxis(activeFilters)

  /** Élargit UNIQUEMENT la contrainte nommée par `widenAxis`, jamais les trois
   *  à la fois comme `widenSearch` : une sortie maigre dit PRÉCISÉMENT quoi
   *  relâcher, pas un relâchement généralisé et muet. */
  const widenPreciseAxis = useCallback(() => {
    // #4429.5 (25/10) — UN barreau de zone par geste, jamais ville + département + région d'un coup.
    if (widenAxis === 'zone') {
      // #4433.3 — d'abord MONTER d'un palier (la ville reste, les comptes élargis portent « Élargi ») ; seulement quand
      // il n'y a plus de palier à monter (région atteinte, rayon choisi, aire posée), le geste d'avant.
      const raise = nextZoneRaise(filters, zoneRaise)
      if (raise) setZoneRaise({ city: filters.city, tier: raise })
      else launch(widenZoneOneStep(filters))
    } else if (widenAxis === 'headcount') launch({ ...filters, headcount: [] })
    else if (widenAxis === 'skills') launch({ ...filters, freetext: '', technologiesObserved: '' })
  }, [widenAxis, filters, launch, zoneRaise])

  /** État vide → basculer sur les signaux d'intention en gardant la cible saisie. */
  const enableSignals = useCallback(() => {
    launch({ ...filters, signalSources: [...DEFAULT_SIGNAL_SOURCES] })
  }, [filters, launch])

  /* ---------------- Rendu ---------------- */

  // Avant toute recherche, les deux cartes de la maquette tiennent lieu d'état
  // vide : inutile alors de rappeler la méthode une seconde fois plus haut.
  const showsIdleCards = !showSimilar && !isFetching && !isError && request === null

  // #4761 — UNE seule façon de rendre un compte : la liste paginée et les deux blocs partagent ces props.
  const renderCandidateRow = (candidate: DiscoverCandidate, reason: HistoryReason | null) => (
    <CandidateRow
      candidate={candidate}
      historyReason={reason}
      isFollowed={followed.has(candidate.siren)}
      onToggleFollow={() => toggleFollow(candidate)}
      onDismiss={() => dismiss(candidate.siren)}
      onAnalyze={() => onAnalyze(candidate)}
      selected={selected.has(candidate.siren)}
      onToggleSelected={() => toggleSelect(candidate.siren)}
      partnerComplementarity={complementarityFor(candidate)}
      searchCriteria={activeFilters}
      homonymSirens={homonyms.get(candidate.siren)}
      relevanceProfile={relevanceProfile}
      searchedRadiusKm={searchedRadiusKm}
      layout={listView === 'columns' ? 'tile' : 'row'}
      signalsSearching={jobsSearching}
    />
  )

  function renderResults() {
    if (showSimilar) return <SimilarPanel />
    // #4746.2 — « Autres acteurs » : aucune requête, la lecture de ce que la recherche a déjà rendu.
    if (resultType === 'accounts' && actorsTab === 'others') {
      return <OtherActorsTab rows={otherRows} kinds={otherKinds} onKindsChange={setOtherKindsChoice} />
    }
    // #2165.7 — les personnes ont leur PROPRE moteur : ni le registre ni le
    // signal n'en produit. Cette branche passe donc AVANT les états de la
    // recherche d'entreprises — sinon « aucune entreprise trouvée » prendrait
    // la place d'une liste de personnes parfaitement remplie.
    if (resultType === 'contacts') {
      return (
        <ContactsResults
          rows={contactRows}
          filters={contactFilters}
          searched={contactsSearched}
          isFetching={rawCandidates.length > 0 ? callList.query.isFetching && !callList.byKey : people.isFetching}
          isError={rawCandidates.length > 0 ? callList.query.isError : people.isError}
          onRetry={() => void (rawCandidates.length > 0 ? callList.query.refetch() : people.refetch())}
          workspaceCountryName={workspaceCountryName}
          onWiden={widenAxis === null ? widenSearch : widenPreciseAxis}
          personName={personNameRequest}
        />
      )
    }
    // #3597.5 — « Voir 10 de plus » relance la requête avec un `limit` plus grand : la liste déjà
    // affichée reste, le bouton dit « Chargement… » (jamais un écran de chargement qui la remplace).
    // #4517 — une relecture d'arrière-plan des offres (#4045) ne remet jamais l'écran de chargement sur la liste.
    if (
      showsSearchLoading({
        isFetching,
        hasData: Boolean(data),
        keepsList: limitOverride !== null,
        backgroundRelecture: jobsSearching,
      })
    )
      return <DiscoverLoading onStop={stopSearch} />
    // #4490.2 — arrêtée avant toute réponse : les critères restent, aucune erreur n'est inventée.
    if (searchStopped && !data) return <DiscoverStopped />
    // #2535.1 — l'erreur porte le VRAI code que le serveur a rendu
    // (`discover_timeout` / `discover_upstream_error` / `discover_invalid_filters`) :
    // l'écran nomme la raison plutôt qu'un message générique.
    if (isError && !searchStopped) return <DiscoverError onRetry={() => refetch()} error={searchError} />
    // Avant toute recherche, l'écran n'est plus un cul-de-sac qui exige une
    // idée : la méthode explique comment la recherche se produit. La cible
    // proposée (« Laisse Bellum trouver », profil ou marché) vit désormais
    // dans le point de départ UNIQUE de la colonne de gauche (#2493,
    // `DiscoverSidebar`) — elle n'a plus besoin d'une seconde carte ici.
    if (request === null) {
      return <DiscoverMethod />
    }
    if (candidates.length === 0) {
      // #1766 — « aucune entreprise ne correspond » est une RÉPONSE. Quand rien
      // n'a pu être vérifié, on n'en a pas donné : le dire autrement, et ne
      // surtout pas renvoyer l'utilisateur élargir des filtres qui n'y sont
      // pour rien.
      // #2490 / #2496 — rien de reconnu dans la demande, rien de coché : on n'a
      // rien cherché. Ni « aucune entreprise ne correspond », ni une panne.
      if (requestReading?.unreadable) return <DiscoverUnreadable />
      // Lot 786 (#5203) — le filtre « Besoins connus » a retiré les cartes : c'est une RÉPONSE (le filtre a tout
      // retiré), pas « rien n'a pu être vérifié ». Lot 788 : le filtre de besoins ne produit JAMAIS un bandeau de
      // source (recette 03/11 : « recherche refusée » sous « aucune carte ne porte de besoin ») — le moteur ne reçoit
      // pas ce filtre ; une panne de source reste dite sur la liste non filtrée, pas sous la réponse du filtre.
      if (data?.needsFilteredOut) {
        return (
          <DiscoverEmpty
            onWiden={widenSearch}
            onSwitchToSignals={enableSignals}
            reason="needsFilter"
            needsRemoved={data.needsFilteredOut}
          />
        )
      }
      return nothingCouldBeVerified ? (
        <DiscoverUnverifiable entries={unverifiable} onRetry={() => refetch()} />
      ) : (
        <>
          <DiscoverFunnelLine query={data?.query} widenedCount={zoneBanner?.widening.widenedCount} />
          {/* #4419.6 — ce que la recherche par compétence a retiré, chacun avec son geste. */}
          <SkillSearchNotices
            query={data?.query}
            onShowIntermediaries={showSkillIntermediaries}
            onRemoveHeadcount={removeHeadcount}
            onRetry={() => void refetch()}
          />
          {/* COMPETENCE-TROUVE — un zéro par compétence dit sa cause, et montre les intermédiaires trouvés. */}
          <SkillSearchFooter
            query={data?.query}
            pending={data?.skillPendingEmployers}
            onChooseEmployer={(employerName, candidate) => chooseEmployer.mutate({ employerName, candidate })}
            choosingId={chooseEmployer.isPending ? '*' : null}
          />
          <DiscoverEmpty
            onWiden={widenSearch}
            onSwitchToSignals={enableSignals}
            reason={emptyReason}
            skills={skillsText(filters)}
          />
        </>
      )
    }

    // #2165.8 / #2165.9 — deux autres lectures de la même liste. Elles ont
    // leurs propres commandes (`ProjectionResults`) : la barre des comptes
    // trie par score et exporte des colonnes de compte, rien de tout cela
    // n'a de sens sur un appel d'offres ou sur une ESN.
    if (resultType === 'needs') {
      return (
        <NeedsResults
          projection={needsProjection}
          nature={signalNature}
          directOnly={directSignalsOnly}
          freelanceOnly={needsFreelanceOnly}
          company={needCompany}
          // #2165.44 / #2165.48 — la fenêtre et la zone LANCÉES filtrent
          // enfin les lignes, pas seulement la requête.
          sinceDays={activeFilters.sinceDays}
          departments={needsDepartments}
          onQualify={qualify}
        />
      )
    }
    // #2545.1 — le tableau d'appels : lui aussi dépend de `visible` (comptes
    // déjà filtrés), donc placé ici comme « Besoins »/« Partenaires » ; l'état
    // de chargement des PERSONNES (`people`) est géré à l'intérieur, comme
    // « Contacts ».
    if (resultType === 'calls') {
      return (
        <CallListResults
          rows={callListProjection.rows}
          filters={callListFilters}
          funnel={callListFunnelData}
          truncatedCompanies={callListProjection.truncatedCompanies}
          excludedCompanies={callListProjection.excludedCompanies}
          outOfPackCompanies={callListPack.outOfPack}
          isFetching={callList.query.isFetching && !callList.byKey}
          isError={callList.query.isError}
          onRetry={() => void callList.query.refetch()}
          findPeople={{
            pending: findPeople.pending,
            progress: findPeople.progress,
            onFindForCompany: row =>
              void findPeople.findForCompany({ siren: row.siren, company: row.company, accountId: row.accountId }),
            onFindForAll: rows =>
              void findPeople.findForAll(
                rows.map(row => ({ siren: row.siren, company: row.company, accountId: row.accountId })),
              ),
          }}
          followed={followed}
          onToggleFollow={row => toggleFollow({ siren: row.siren, name: row.company })}
          onDismiss={dismiss}
          onExport={dataExit.allowed ? exportCallList : undefined}
          onExportSelection={dataExit.allowed ? exportCallList : undefined}
          onExportSession={dataExit.allowed ? exportSession : undefined}
        />
      )
    }

    return (
      <div>
        {/* #2166.54 — n'apparaît QUE si une sélection existe : rien de plus
            sur l'écran quand personne n'a coché de case. */}
        {selected.size > 0 && (
          <div className="mb-3">
            <SelectionBar
              count={selected.size}
              onClear={clearSelection}
              onAddToTarget={() => setTargetDialogOpen(true)}
              onExportSelection={dataExit.allowed ? exportsLock.guard(exportSelection) : undefined}
              onDismissSelection={dismissSelection}
              onAssignSelection={() => setAssignDialogOpen(true)}
              onAnalyzeSelection={() => setAnalyzeDialogOpen(true)}
              // #2166.48 — comparer ne porte que sur des comptes déjà en
              // portefeuille (même split que la cible, #2166.55).
              compareEligibleNames={selectionSplit.eligible.map(candidate => candidate.name)}
            />
          </div>
        )}
        <ResultsToolbar
          shown={headerTotals.shown}
          pageRange={pageCount > 1 ? { from: pageStart + 1, to: pageStart + pageRows.length } : undefined}
          hidden={hiddenCount}
          hiddenBreakdown={hiddenBreakdown}
          matched={data?.coverage?.candidatesFound ?? null}
          highPotential={headerTotals.highPotential}
          highPotentialOnly={highPotentialOnly}
          onToggleHighPotential={() => setHighPotentialOnly(value => !value)}
          sort={sort}
          onSortChange={setSortChoice}
          family={family}
          onFamilyChange={setFamily}
          accessClass={accessClass}
          onAccessClassChange={setAccessClass}
          hideOwned={hideOwned}
          onHideOwnedChange={setHideOwned}
          hideWorked={hideWorked}
          onHideWorkedChange={setHideWorked}
          roleFamily={roleFamily}
          onRoleFamilyChange={setRoleFamily}
          signalNature={signalNature}
          onSignalNatureChange={setSignalNature}
          directSignalsOnly={directSignalsOnly}
          onDirectSignalsOnlyChange={setDirectSignalsOnly}
          dismissedCount={dismissed.size}
          onRestoreDismissed={() => restoreAllDismissed(candidates.map(c => c.siren))}
          // Refonte Théo — « Exporter » vit dans l'en-tête « Ton marché » (verrouillé ≠ désactivé : l'upsell s'ouvre).
          canExport={visible.length > 0 || exportsLock.locked}
          textFilter={textFilter}
          onTextFilterChange={setTextFilter}
          pageSelection={pageSelection}
          onTogglePageSelection={togglePageSelection}
        />

        {exportsLock.dialog}

        <AddToTargetListDialog
          open={targetDialogOpen}
          onOpenChange={setTargetDialogOpen}
          eligible={selectionSplit.eligible}
          ineligibleCount={selectionSplit.ineligible.length}
          onDone={clearSelection}
        />

        <AssignSelectionDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          eligible={selectionSplit.eligible}
          ineligibleCount={selectionSplit.ineligible.length}
          onDone={clearSelection}
        />

        {/* #2166.56 — analyser TOUTE la sélection, pas seulement les comptes déjà
            en portefeuille : `/analysis/start` accepte n'importe quel candidat de
            marché (siren + nom), pas de split éligible/inéligible ici. */}
        <AnalyzeSelectionDialog
          open={analyzeDialogOpen}
          onOpenChange={setAnalyzeDialogOpen}
          candidates={selectedList}
          onDone={clearSelection}
          source={(appliedSavedSearchId ? 'saved_search' : 'discover') satisfies AnalysisBatchSource}
          searchCriteria={activeFilters}
        />

        {listed.length === 0 ? (
          // #2550.1 — ici, `candidates.length > 0` par construction (branché
          // après le cas `candidates.length === 0` plus haut) : les résultats
          // EXISTENT, ce sont les affinages client (fit, famille, classe…) qui
          // les masquent tous. C'est un FAIT certain, pas une déduction —
          // toujours « filtersNarrow ».
          <DiscoverEmpty
            onWiden={widenSearch}
            onSwitchToSignals={enableSignals}
            reason={
              isCapitalIncreaseOnly(filters)
                ? 'noCapitalIncrease'
                : // #4627 — tous écartés par la qualification ≠ « trop de filtres » : la cause se lit sur les comptes.
                  emptyListReason({ crossed: crossed.length, kept: kept.length })
            }
            skills={skillsText(filters)}
            blocking={blocking}
            freelanceMissing={freelanceMissing}
          />
        ) : (
          /* #3597.1 — UNE seule liste, une ligne compacte par compte (décision
             Louis 04/10/2026 : plus de panneau prioritaires, plus de passe
             rapide séparée, plus de carte pleine largeur, plus de bascule
             liste/cartes). #3597.5 — dix comptes d'abord, « Voir 10 de plus »
             en révèle dix autres. */
          <>
            <HiringDomainNoticeLine notice={hiringNotice} />
            <BlockingFiltersNote blocking={blocking} />
            {freelanceMissing ? (
              <p
                data-testid="freelance-signal-missing"
                className="mb-2 text-xs leading-snug"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('rail.freelanceMissing')}
              </p>
            ) : null}
            {keywordNotice ? (
              <p
                data-testid="keyword-no-signal-notice"
                className="mb-2 text-xs leading-snug"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('card.keywordNoSignal', { keyword: keywordNotice.keyword })}
              </p>
            ) : null}
            {historyBlocksMode ? (
              <DiscoverHistoryBlocks
                rows={listed}
                windowDays={activeFilters.sinceDays}
                subject={historySubject({
                  skills: skillsText(filters),
                  keywords: activeFilters.keywords,
                  freetext: activeFilters.freetext,
                })}
                renderRow={renderCandidateRow}
              />
            ) : (
              <>
                <div
                  data-testid="discover-account-list"
                  data-view={listView}
                  className={listView === 'columns' ? 'grid grid-cols-1 gap-3 lg:grid-cols-2' : 'flex flex-col gap-2'}
                >
                  {pageRows.map((candidate, offset) => (
                    <Fragment key={candidate.siren}>
                      {pageStart + offset === beyondAt && !textFilter.trim() && searchedRadiusKm ? (
                        <div
                          role="separator"
                          data-testid="discover-beyond-radius-separator"
                          className="col-span-full mt-2 border-t pt-2 text-xs font-medium"
                          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                        >
                          {t('list.beyondRadiusSeparator', { km: searchedRadiusKm })}
                        </div>
                      ) : null}
                      {pageStart + offset === undatedAt && !textFilter.trim() ? (
                        // #3819.9 — séparateur des comptes sans signal daté (tris Score / Fraîcheur).
                        <div
                          role="separator"
                          data-testid="discover-undated-separator"
                          className="col-span-full mt-2 border-t pt-2 text-xs font-medium"
                          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}
                        >
                          {t('list.undatedSeparator')}
                        </div>
                      ) : null}
                      {renderCandidateRow(candidate, null)}
                    </Fragment>
                  ))}
                </div>
                {/* Refonte Théo — « 1–12 sur 97 comptes » et les pages ; au bout du chargé, la recherche en rend
                d'autres (#3597.5 / #4016 L7 : `limit` élargi, borné par `DISCOVER_MAX_LIMIT`). */}
                <DiscoverPager
                  page={page}
                  pageCount={pageCount}
                  total={listed.length}
                  pageSize={DISCOVER_LIST_STEP}
                  onPage={number => setShownCount(number * DISCOVER_LIST_STEP)}
                  canLoadMore={
                    page >= pageCount &&
                    !textFilter.trim() &&
                    // #4419.8 — une source qui n'a pas abouti laisse « en rendre d'autres » ouvert.
                    canRequestMore(
                      effectiveRequest?.query.limit ?? candidates.length,
                      candidates.length,
                      readSkillSearch(data?.query)?.more === true,
                    )
                  }
                  onLoadMore={showMore}
                  loadingMore={isFetching}
                />
              </>
            )}
            {/* #4746.2 — le bloc « Cabinets et ESN qui recrutent » est devenu l'onglet « Autres acteurs » (Louis 31/10). */}
            <SkillSearchFooter
              query={data?.query}
              pending={data?.skillPendingEmployers}
              onChooseEmployer={(employerName, candidate) => chooseEmployer.mutate({ employerName, candidate })}
              choosingId={chooseEmployer.isPending ? '*' : null}
            />
          </>
        )}
      </div>
    )
  }

  const presetById = (id: string) => presets.find(preset => preset.id === id)
  /**
   * #4493 — TROIS pistes illustrées, tirées de ce que l'espace a DÉCLARÉ (jamais une donnée inventée) :
   * un territoire (secteurs + zone de l'offre), une expertise (la première déclarée, posée dans le brouillon
   * de « Cadrer la recherche »), un type de client (les secteurs de tes meilleures références).
   * Une piste sans donnée déclarée dit ce qu'il faut renseigner, elle ne part pas à vide.
   */
  const presetTrack = (
    id: string,
    preset: DiscoverPreset | undefined,
    eyebrow: string,
    title: string,
    hint: string,
  ): DiscoverTrack => ({
    id,
    eyebrow,
    title,
    hint,
    art: monogram(title),
    disabledReason: preset?.disabledReason ? t(`presets.disabledReason.${preset.disabledReason}`) : undefined,
    onSelect: () => {
      if (!preset) return
      // #4530.3 — re-clic sur une carte ACTIVE : elle retire son critère (bascule), le rail revient à ce qu'il était.
      if (isPresetActive(preset, filters)) {
        launch(withoutPreset(preset, filters), undefined, true)
        return
      }
      applyPreset(preset)
    },
  })
  // #4572.5 — un clic sur la carte Territoire pose UNE région (revient sur #4572, qui gardait l'union).
  const rawOfferPreset = presetById('compatibleWithOffer')
  const offerPreset = rawOfferPreset ? withSingleRegion(rawOfferPreset) : undefined
  // #4572.6 — le titre dit ce que le clic POSE : le premier secteur et « +N » pour les autres, comme la puce.
  const offerSectorCodes = offerPreset?.patch.sectors ?? []
  const offerSectorLabel = offerSectorCodes[0]
  const offerSectorTitle = offerSectorLabel
    ? offerSectorCodes.length > 1
      ? t('chips.firstAndMore', {
          first: applicationSectorLabel(offerSectorLabel, i18n.language),
          count: offerSectorCodes.length - 1,
        })
      : applicationSectorLabel(offerSectorLabel, i18n.language)
    : null
  const offerRegionLabel =
    (offerPreset?.patch.region ?? [])
      .map(code => REGISTRY_REGIONS.find(region => region.code === code)?.label)
      .filter(Boolean)
      .join(', ') || undefined
  const declaredExpertise = [...(esnAnswers?.priority_expertise ?? []), ...(esnAnswers?.expertise_areas ?? [])][0]
  const referencePreset = presetById('likeReferences')
  const referenceSector = (referencePreset?.patch.sectors ?? [])[0]
  const tracks: DiscoverTrack[] = [
    presetTrack(
      'territory',
      offerPreset,
      t('overview.trackTerritory'),
      [offerSectorTitle, offerRegionLabel].filter(Boolean).join(' · ') || t('presets.compatibleWithOffer.label'),
      // #4572.6 — l'indice suit ce que le clic pose (zone seule, secteurs seuls, ou les deux).
      t(`overview.${territoryTrackHintKey(offerPreset?.patch ?? {})}`),
    ),
    {
      id: 'expertise',
      eyebrow: t('overview.trackExpertise'),
      title: declaredExpertise ? expertiseHeadline(declaredExpertise) : t('overview.trackExpertiseEmpty'),
      hint: t('overview.trackExpertiseHint'),
      art: declaredExpertise ? monogram(expertiseHeadline(declaredExpertise)) : '',
      onSelect: () =>
        setFramingRequest({
          section: 'expertise',
          patch: declaredExpertise ? withSkills(filters, expertiseHeadline(declaredExpertise)) : undefined,
          // Chaque clic est une demande neuve : l'horodatage suffit (jamais deux clics dans la même milliseconde).
          nonce: Date.now(),
        }),
    },
    presetTrack(
      'client',
      referencePreset,
      t('overview.trackClient'),
      referenceSector ? applicationSectorLabel(referenceSector, i18n.language) : t('presets.likeReferences.label'),
      t('overview.trackClientHint'),
    ),
  ]
  // #4631.5 — les compteurs de tête se calculent sur les lignes RENDUES, comme l'en-tête.
  const counters = overviewCounters(listed)
  const phoneReachable = contactRows.filter(row => row.channels.phone).length
  // Un indicateur non mesuré ne s'affiche pas : jamais « 0 » à la place d'un « on ne sait pas » (GA-18/19).
  const kpis: DiscoverKpi[] = [
    {
      key: 'accounts',
      label: t('overview.kpiAccounts'),
      // #4631.5 — les lignes RENDUES (`listed`, filtre d'écran compris), pas ce que la collecte a ramené.
      value: listed.length,
      hint: counters.newForWorkspace > 0 ? t('overview.kpiNewForYou', { count: counters.newForWorkspace }) : null,
      onOpen: () => setResultType('accounts'),
    },
    ...(counters.knownNeeds !== null
      ? [
          {
            key: 'needs',
            label: t('overview.kpiNeeds'),
            value: counters.knownNeeds,
            hint: t('overview.kpiNeedsHint'),
            onOpen: () => setResultType('needs' as const),
          },
        ]
      : []),
    ...(counters.historicalNeeds !== null
      ? [
          {
            key: 'historical',
            label: t('overview.kpiHistorical'),
            value: counters.historicalNeeds,
            hint: t('overview.kpiHistoricalHint'),
            onOpen: () => setResultType('needs' as const),
          },
        ]
      : []),
    ...(callList.byKey
      ? [
          {
            key: 'contacts',
            label: t('overview.kpiContacts'),
            value: contactRows.length,
            hint:
              phoneReachable > 0
                ? t('overview.kpiContactsPhone', { count: phoneReachable })
                : t('overview.kpiContactsHint'),
            onOpen: () => setResultType('contacts' as const),
          },
        ]
      : []),
  ].filter(kpi => kpi.value > 0)
  const breakdown = marketBreakdown(visible)

  // #2157.57 — l'aperçu avant versement ne vit que dans la vue Historique (seul endroit où l'on crée une cible depuis une recherche).
  if (showHistory) {
    return (
      <>
        <DiscoverHistory
          history={searchHistory}
          searches={searches}
          savedStatus={savedStatus}
          onBack={closeHistory}
          onReplayHistory={entry => launch(entry.filters)}
          onApplySearch={applySavedSearch}
          onDeleteSearch={remove}
          onCreateTarget={createTargetFromSavedSearch}
        />
        <CreateTargetListFromSavedSearchDialog
          search={targetPreviewSearch}
          onOpenChange={open => {
            if (!open) setTargetPreviewSearch(null)
          }}
        />
      </>
    )
  }

  return (
    <div className="space-y-5">
      {/* ⚠️ AUCUN paragraphe d'introduction (Louis, 01/09/2026) : « ça prend de
          la place pour rien ». Trois lignes expliquaient le rail avant qu'on
          puisse le voir, et répétaient « Explorer ne consomme aucun crédit » —
          déjà écrit dans la carte « Notre méthode », à deux cents pixels de là.
          L'écran s'ouvre donc sur ses COMMANDES. La promesse de gratuité n'est
          pas perdue pour autant : `Discover.test.tsx` garde qu'elle est dite
          une fois, et pas zéro. */}

      {/* #2456 — LE TITRE DE L'ÉCRAN, et il manquait à tout le document.
          Mesuré en production au SHA `3993b432b` le 16/09/2026 à 10 h 04 :
          `document.querySelectorAll('h1').length` rendait **0** sur 255
          éléments lus. Qui demande « lis-moi le titre de cette page » n'avait
          rien ; le plan de titres commençait au niveau 2, sur « TA CIBLE » —
          un libellé de BLOC, pas le sujet de l'écran.

          Pourquoi il n'y en avait pas : `PageHeader` porte bien un `h1`, mais
          il ne le rend pas quand la barre d'onglets nomme déjà l'endroit
          (`nameLivesInTabs`, loi 4 du tome 7) — et `/discover` est un onglet de
          la section Comptes. L'entête se tait, et personne ne reprenait le
          relais.

          Le libellé n'est pas neuf : c'est celui du `document.title`, lu à SA
          source (`routes:discover.pageTitle`) et non recopié — un réglage vit
          à un seul endroit. Il ne répète pas non plus l'onglet actif, qui dit
          « Découvrir » : celui-ci dit le SUJET. */}
      <DiscoverHeader onOpenHistory={openHistory} onNewSearch={resetAllFilters} />

      {/* #2481 / #2485 / #2486 / #2503 / #2504 — LA ZONE DE COMMANDE, EN DEUX NIVEAUX.

          Mesuré en production le 16/09/2026 : QUATRE rangées de puces du même
          poids visuel avant le moindre résultat — cinq préréglages, cinq
          bascules, « Quelques exemples », « Par exemple ». Le retour tient en
          une phrase : « c'est le bordel, organise ça mieux, faut que ce soit
          lisible » (#2481).

          Ce qui range n'est pas une rangée de moins, c'est une HIÉRARCHIE :
            1. DIRE ce qu'on cherche — la saisie libre, et son alternative
               (« laisse Bellum proposer ») À CÔTÉ d'elle, avec les PISTES
               RAPIDES sur la MÊME ligne (elles pré-remplissent le rail) ;
            2. les LECTURES — elles ouvrent un panneau, elles ne filtrent rien.
          Les rangées de puces sans libellé se lisaient comme une seule
          bouillie : chacune porte désormais son nom (loi 4 du tome 7).

          #2485 — la rangée « Par exemple » (`DiscoverExampleChips`) est
          retirée : elle remplissait le MÊME champ que celle d'ici, avec quatre
          autres phrases. Garde :
          `architecture/decouvrir-ne-dit-ses-exemples-quune-fois.test.ts`.

          #2503 (17/09/2026) — « supprimer les quelques exemples » : la rangée
          de phrases d'exemple sous la saisie (`freetext.examples`) est retirée
          à son tour. Découvrir ne porte donc plus AUCUNE rangée d'exemples.

          #2504 (17/09/2026) — « supprimer les pistes rapides ou les rendre
          déployables dans une modale, et caler le bouton en haut sur la même
          ligne que le champ de recherche pour gagner de la place » : la
          rangée de cinq pastilles devient UN bouton, sur la ligne de la
          saisie, qui ouvre `DiscoverQuickPresetsDialog` — chaque piste y est
          nommée ET expliquée en texte visible (le `title` HTML ne l'était
          qu'au survol). */}
      <DiscoverSearchCard
        context={
          <MyTargetToggle
            pressed={myTargetOn}
            disabled={profileLoading || portfolioPending}
            onToggle={toggleMyTarget}
          />
        }
      >
        <div className="flex flex-col gap-3">
          {/* Refonte Théo (23/10) — la rangée des critères (Territoire · Secteurs · Tailles · Expertises ·
              Besoins & signaux · Tous les filtres) : le rail de recherche, en puces, dans la carte. */}
          <div {...guideAnchorProps('decouvrir.recherche')}>
            <FilterRail
              filters={filters}
              onChange={onRailChange}
              onReset={resetAllFilters}
              onSubmit={runSearch}
              onApply={applyFraming}
              loading={isFetching}
              extras={framingExtras}
              countFor={framingCountFor}
              partnerFilters
              consultantOptions={consultantOptions}
              unapplied={unapplied}
              listEmpty={Boolean(data) && visible.length === 0}
              observedClientsUnknownCount={observedClientsUnknownCount}
              // #2165.51 — filtre Expertise, panneau Partenaires.
              expertiseUnknownCount={expertiseUnknownCount}
              contractRecourseImpact={contractRecourseRemoval}
              // #2165.55 — filtre Complémentarité, panneau Partenaires.
              complementarityUnknownCount={complementarityUnknownCount}
              resultType={resultType}
              onOpenSimilar={() => setShowSimilar(true)}
              openRequest={framingRequest}
              onboardingSectors={onboardingSectors}
            />
          </div>
          {/* #4998.1 — la demande se LIT avant d'être lancée (zone, mots-clés, zone inconnue dite). */}
          <PreLaunchReading
            city={filters.city}
            region={filters.region}
            department={filters.department}
            keywords={filters.keywords}
            freetext={filters.freetext}
          />

          {/* #4634 (décision Louis 26/10/2026) — les critères de Contacts, Besoins et Liste d'appels rejoignent le
              volet : rendus ICI, une fois, pour la seule projection affichée — plus aucun sous les résultats. */}
          {!showSimilar ? (
            <ProjectionSearchFields
              resultType={resultType}
              contacts={{
                filters: contactFilters,
                onChange: setContactFilters,
                workspaceCountryName,
                searched: contactsSearched,
              }}
              calls={{ filters: callListFilters, onChange: setCallListFilters }}
              needs={{
                company: needCompany,
                onCompanyChange: setNeedCompany,
                nature: signalNature,
                onNatureChange: setSignalNature,
                directOnly: directSignalsOnly,
                onDirectOnlyChange: setDirectSignalsOnly,
                freelanceOnly: needsFreelanceOnly,
                onFreelanceOnlyChange: setNeedsFreelanceOnly,
              }}
            />
          ) : null}

          {demoProposal && !request ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={playDemoProposal}>
                {t('lastSearch.demoPlay', { label: demoProposal.label })}
              </Button>
              <span>{t('lastSearch.demoHint')}</span>
            </div>
          ) : null}

          {resumableSearch && !request ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={resumeLastSearch}>
                {t('lastSearch.resume')}
              </Button>
              <span>{t('lastSearch.resumeHint')}</span>
            </div>
          ) : null}

          {myTargetOn && myTargetTrim ? (
            <p className="text-sm text-[var(--bellum-text-secondary)]" data-testid="discover-my-target-trim">
              {t('overview.myTargetTrim', { kept: myTargetTrim.kept, total: myTargetTrim.total })}{' '}
              <button
                type="button"
                className="min-h-11 underline"
                onClick={() => document.querySelector<HTMLElement>('[data-testid="discover-chip-sectors"]')?.click()}
              >
                {t('overview.myTargetAdjust')}
              </button>
            </p>
          ) : null}
          {pendingPreset ? (
            <TargetSectorChoiceDialog
              sectors={pendingPreset.patch.sectors ?? []}
              onConfirm={chosen => applyPreset(pendingPreset, chosen)}
              onCancel={() => setPendingPreset(null)}
            />
          ) : null}
          <DiscoverQuickPresetsDialog
            open={quickPresetsOpen}
            onOpenChange={setQuickPresetsOpen}
            onApply={applyPreset}
            presets={presets}
            radarTechnology={radarTechnologyFromFilters(filters)}
          />
        </div>
      </DiscoverSearchCard>

      <DiscoverTracks
        tracks={tracks}
        more={
          /* #2504 — toutes les pistes, nommées et expliquées, dans `DiscoverQuickPresetsDialog`. */
          <button
            type="button"
            onClick={() => setQuickPresetsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={quickPresetsOpen}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-[var(--bellum-text-accent)] pointer-coarse:min-h-11"
          >
            <Zap className="size-3.5" aria-hidden="true" />
            {t('commands.presetsLabel')}
          </button>
        }
      />
      {!showSimilar && request !== null && data && (
        <>
          <DiscoverKpis items={kpis} />
          <DiscoverBreakdown
            breakdown={breakdown}
            total={visible.length}
            storageKey={discoverStorageKey('breakdown-open', historyUserId ?? 'anonymous')}
          />
        </>
      )}

      {/* #4300 — UNE colonne de lecture : la recherche et les résultats s'alignent avec le titre ;
          « Ta cible » (profil, historique, recherches) passe dessous. */}
      <div className="grid grid-cols-1 gap-5">
        <div {...guideAnchorProps('decouvrir.resultats')} className="min-w-0 space-y-5">
          {/* Rappelée à la demande, et systématiquement quand aucune recherche
              n'a encore tourné (voir `renderResults`). */}
          {showMethod && !showsIdleCards && <DiscoverMethod onClose={() => setShowMethod(false)} />}

          {/* #1796.1 — « tout ce qui concerne la recherche doit être dans un
              truc qui se déplie/replie », et se replie tout seul au
              lancement. `CollapsedSection` en mode CONTRÔLÉ (`open` +
              `onOpenChange`) : `runSearch` referme sans clic sur l'en-tête,
              et l'en-tête reste le seul autre endroit qui bascule l'état. */}
          {/* #1903.23 / #1933.7 — la provenance, indépendante du repli du rail :
              se replier ne doit pas faire disparaître d'où vient la recherche
              en cours. */}
          {/* #4493 — le texte libre (même d'une recherche ANCIENNE : URL, enregistrée) se lit et se retire DANS le
              champ de la barre : plus de bandeau à part (#3646, revenu sur le 24/10). */}
          {preparedByLaura ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3 py-2 text-xs text-[var(--bellum-text-secondary)]">
              <Sparkles className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
              {t('preparedByLaura')}
            </div>
          ) : null}

          {/* #2165.61 — le type de résultat est LISIBLE au-dessus de la liste,
              et il se change d'un geste. Rendu même avant la première
              recherche : choisir ce qu'on cherche vient avant de chercher. */}
          {!showSimilar && (
            <ResultTypeSelector
              value={resultType === 'accounts' && actorsTab === 'others' ? 'others' : resultType}
              onChange={next => {
                if (next === 'others') {
                  if (resultType !== 'accounts') setResultType('accounts')
                  setActorsTabChoice('others')
                  setOthersOpened(true)
                  return
                }
                if (next === 'accounts') setActorsTabChoice('accounts')
                setResultType(next)
              }}
              counts={resultTypeCounts}
              othersCount={othersOpened || actorsTab === 'others' ? otherRows.length : undefined}
              contactAccounts={contactAccounts}
            />
          )}

          <DiscoverMarketToolbar
            view={listView}
            onViewChange={setListView}
            actions={
              <>
                {!showSimilar && (
                  <MarketToolbarButton
                    icon={<Bookmark className="size-3.5" aria-hidden="true" />}
                    onClick={() => setSaveDialogOpen(true)}
                    aria-haspopup="dialog"
                  >
                    {t('market.save')}
                  </MarketToolbarButton>
                )}
                {!showSimilar && resultType === 'accounts' && dataExit.allowed && (
                  <MarketToolbarButton
                    icon={<Download className="size-3.5" aria-hidden="true" />}
                    onClick={exportsLock.guard(exportResults)}
                    disabled={!(visible.length > 0 || exportsLock.locked)}
                    title={exportsLock.locked ? tCommon('planFeatures.locked.navLocked') : t('results.exportHint')}
                    className={exportsLock.locked ? 'opacity-50' : undefined}
                  >
                    {t('results.export')}
                  </MarketToolbarButton>
                )}
                {/* Les LECTURES (#2486) : chacune ouvre un panneau sous les résultats, aucune ne filtre.
                      « Territoire » en est sorti (Louis, 16/09/2026 — garde `Discover.commandes.test.tsx`), puis
                      « Contexte marché » (#4632, 26/10/2026 : ses critères ont rejoint « Tous les filtres »). La méthode
                      n'apparaît que lorsqu'elle a quelque chose à ouvrir (à l'arrivée, elle est déjà dépliée). */}
              </>
            }
            menu={
              <>
                <DropdownMenuCheckboxItem checked={showSimilar} onCheckedChange={setShowSimilar}>
                  {t('rail.similarToggle')}
                </DropdownMenuCheckboxItem>
                {!showsIdleCards && (
                  <DropdownMenuCheckboxItem checked={showMethod} onCheckedChange={setShowMethod}>
                    {t('topbar.explainMethod')}
                  </DropdownMenuCheckboxItem>
                )}
                <DropdownMenuItem asChild>
                  <Link to="/discover/radar">{t('market.viewRadar')}</Link>
                </DropdownMenuItem>
              </>
            }
          />
          <SaveSearchDialog
            open={saveDialogOpen}
            onOpenChange={setSaveDialogOpen}
            onSave={saveCurrentSearch}
            proposedLabel={filterRailSummary ?? ''}
          />

          {!showSimilar && data && (
            /* Refonte Théo (23/10) — UN repli « Ce qu'il faut savoir sur cette recherche » au-dessus de la
               liste, jamais une pile de bandeaux. Les avis sont ceux d'avant, tels quels ; chacun se tait sans
               objet, et le repli disparaît quand aucun ne parle. #4639 (Louis, 27/10) — une panne de source ne l'ouvre plus
               d'office : elle n'est plus montrée ici (le contrat `degraded` serveur, lui, ne change pas). */
            <DiscoverQualityNotes>
              {/* #4639 — Quatre affirmations, quatre rendus : ce qu'on n'a pas su IDENTIFIER (neutre, #1766) ;
                  ce qui n'a pas été REGARDÉ (neutre) ; ce que le registre n'a pas su EXPRIMER (neutre aussi) ;
                  les offres non lues (#4045). Les pannes de source (ambre) ne sont plus montrées. */}
              {/* #1766 — au-dessus de ZÉRO résultat, ces deux-là mentent : ce
                  qu'ils ont à dire est repris par `DiscoverUnverifiable`, qui
                  prend la place de l'état vide. */}
              {!nothingCouldBeVerified && (
                <>
                  <SecondPassNotice scope={secondPassScope(completeData)} />
                  <DegradedBanner
                    degraded={[]}
                    jobsSearching={jobsSearching}
                    jobsFaults={degradedSplit.jobsFaults}
                    cardFaults={degradedSplit.cardFaults}
                    ambiguities={degradedSplit.ambiguities}
                  />
                  {/* #4639 — sans bandeau de panne, les homonymes ne vivent plus « dedans » : toujours ici. */}
                  <AmbiguityNotice ambiguities={degradedSplit.ambiguities} />
                  {/* #4746.6 — ce que « Clients finaux » a retiré, dit sur la liste. */}
                  <EntityTypeFilteredNotice
                    removed={data.coverage?.filteredByEntityType}
                    entityType={activeFilters.entityType}
                  />
                </>
              )}
              {/* #2291.9 — le volume proposé, avec la règle qui l'a produit.
                  « Comptes » seulement : Contacts/Partenaires/Liste d'appels
                  lisent le MÊME `limit`, mais ne parlent pas de « comptes ». */}
              {resultType === 'accounts' &&
                !isNeutralContext &&
                volumeNoticeApplies(
                  proposedVolume,
                  matchedCandidatesCount(data.coverage?.candidatesFound, candidates.length),
                  visible.length,
                ) && (
                  // #3866 R25 — UNE source pour le compteur : ce que la liste MONTRE (10 cartes), pas le
                  // volume demandé (25) — « 25 comptes proposés » au-dessus de 10 cartes se contredisait.
                  <ProposedVolumeNotice
                    volume={{ ...proposedVolume, count: displayedCount(visible.length, visible.length) }}
                  />
                )}
              {/* #2804 (#2291.2) — capacité de livraison DÉCLARÉE, verbatim :
                  un rappel, jamais un filtre sur les comptes ci-dessous. */}
              {/* G-FIX #4319 — « planning plein » ne sert qu'à juger des comptes À livrer : sans compte affiché, aucun bandeau. */}
              {resultType === 'accounts' && !isNeutralContext && visible.length > 0 && (
                <DeliveryCapacityNotice notice={deliveryCapacity} />
              )}
              {/* #4490.2 */}
              {searchStopped && <DiscoverStoppedPartial />}
              {/* #4588.4 — liste VIDE : le panneau entier se tait sur la couverture (« élargi », « sources interrogées »,
                  « couverture ») — il n'affirme rien sur ce qui n'a rien ramené. `DiscoverUnverifiable` / l'état vide parlent. */}
              {visible.length > 0 && (
                <CoverageNotice
                  coverage={data.coverage}
                  notExamined={degradedSplit.notExamined}
                  shown={visible.length}
                />
              )}
              {/* #2614.2 — un ou deux comptes trouvés n'est ni une panne ni le
                  vide : Laura le dit et propose d'élargir. `matched` vient du
                  total réel de la recherche (`coverage`, comme `CoverageNotice`
                  au-dessus), jamais des lignes affichées — donc valable quelle
                  que soit la projection (comptes/contacts/besoins/partenaires),
                  toutes lues sur la MÊME recherche.
                  Mesuré en prod le 21/09/2026 : `coverage` n'existe QUE sur le
                  chemin borné (`/discover/signals`) — `/discover/registry`,
                  celui de toute recherche en texte libre, ne le porte jamais.
                  `matched` valait donc TOUJOURS `null` sur ce chemin, quel que
                  soit le nombre réel trouvé — la CONDITION était fausse, pas le
                  texte. `matchedCandidatesCount` se replie sur
                  `candidates.length` (le compte brut, avant tout filtre
                  d'écran) quand `coverage` est absent. */}
              <ProfileSizeNotice
                proposed={profileSizeProposed}
                onApply={applyProposedProfileSize}
                onDismiss={dismissProfileSize}
              />
              {/* #4419.6 — cabinets/ESN à part, hors taille, non identifiés, coupure par le délai : dits, avec leur geste. */}
              {resultType === 'accounts' && (
                <DiscoverFunnelLine query={data.query} widenedCount={zoneBanner?.widening.widenedCount} />
              )}
              {resultType === 'accounts' && (
                <SkillSearchNotices
                  query={data.query}
                  onShowIntermediaries={showSkillIntermediaries}
                  onRemoveHeadcount={removeHeadcount}
                  onRetry={() => void refetch()}
                />
              )}
              <IncompleteSearchNotice
                // #4429.4 — jamais « N trouvés » au-dessus d'une liste de 0 : les masqués ne comptent pas.
                matched={incompleteSearchMatched(
                  matchedCandidatesCount(data.coverage?.candidatesFound, candidates.length),
                  hiddenCount,
                  Boolean(data.zoneWidening),
                  widenAxis,
                )}
                axis={widenAxis}
                // #4420.4 — ce que la taille et le secteur ont écarté, COMPTÉ par la recherche ; absent = « non mesuré ».
                discarded={{
                  headcount: readSkillSearch(data?.query)?.outsideHeadcount,
                  sector: readSkillSearch(data?.query)?.outsideSector,
                }}
                onWiden={widenAxis === null ? widenSearch : widenPreciseAxis}
              />
              {/* #2489.3/D1 — la cible déclarée filtre par défaut, un bouton
                  visible l'ignore ; le compteur n'est jamais décoratif. */}
              {/* #4429.6 — la commune corrigée, l'homonyme ou l'absence de commune : dits avant la liste. */}
              <PlaceResolutionNotice resolution={normalizePlaceResolution(data.query)} />
              {/* #4305.2 — l'effort de la recherche (sources interrogées, ce qui l'a arrêtée) : ni crédit, ni fournisseur. */}
              {/* #4588.4 — liste vide : ni « sources interrogées » ni « élargi » (un élargissement qui ne ramène rien n'a rien réussi). */}
              {/* … sauf ce qui a ARRÊTÉ la recherche (délai, plafond) : c'est la raison du vide, pas une couverture. */}
              {(visible.length > 0 || normalizeSearchEffort(data.query)?.stoppedBy === 'time') && (
                <SearchEffortNotice
                  // #4627 — jamais « volume demandé atteint » à côté de « Résultats partiels » : une seule lecture des pannes.
                  effort={effortConsistentWithFaults(normalizeSearchEffort(data.query), degradedSplit.faults.length)}
                  // #4677.4 — le temps imparti aux signaux, quand il a coupé la recherche de N cartes, est nommé.
                  signalsCut={visible.length > 0 ? signalsBudgetCut(data.degraded) : undefined}
                  // #4706.1 — la liste coupée à la limite se dit : « N affichés sur au moins M trouvés ».
                  listCut={visible.length > 0 ? normalizeListCut(data.query) : undefined}
                />
              )}
              {/* #4433 / #4429.4 — sous 10 exacts, la liste s'ouvre aux voisins (critères, zone) : UN bandeau, un geste strict par axe. */}
              {/* #4429.4 (re-recette 26/10) — un geste de retour posé garde son bandeau même à 0 ligne : sinon le geste
                  inverse disparaît avec la liste. */}
              {(visible.length > 0 || zoneStrictPlace || zoneCeilingStep) && (
                <WideningBanner
                  criteria={wideningOf(data.query)}
                  strict={strictCriteria}
                  onStrictChange={setStrictCriteria}
                  zone={zoneBanner?.widening}
                  zoneAllLabelled={zoneBanner?.allLabelled}
                  onZoneRevert={place => {
                    setZoneRaise(null)
                    setZoneStep(null)
                    setZoneStrictCity(place)
                  }}
                  onZoneStepBack={(place, ceiling, radiusKm) => setZoneStep({ city: place, ceiling, radiusKm })}
                  zoneRadiusKm={
                    effectiveRequest?.mode === 'registry' ? effectiveRequest.query.filters.radiusKm : undefined
                  }
                  zoneStrictPlace={zoneStrictPlace}
                  zoneCeilingStep={zoneCeilingStep}
                  onZoneWiden={() => {
                    setZoneStrictCity(null)
                    setZoneStep(null)
                    setZoneRaise(null)
                  }}
                />
              )}
              <TargetSectorFilterNotice filter={data.targetSectorFilter} onToggle={setIncludeOutOfTarget} />
              {/* #4361.2 — « Exclure les sociétés cotées » : retirées, et cotations non établies (restées). */}
              <ListingFilterNotice filter={data.listingFilter} />
              {/* #3983.1 — la holding écartée au profit de sa filiale est nommée, avec sa raison. */}
              <DiscardedHoldingsNotice candidates={crossed} />
              <CapabilityNotice capabilities={unnamedCapabilities(degradedSplit.capabilities)} shown={visible.length} />
              {/* #3528 — pourquoi la liste se vide quand un niveau de décision est coché. */}
              <DecisionLevelNotice state={decisionLevelNotice} />
              {/* #2613 — le bandeau « des comptes écartés faute de donnée
                  mémoire marché » (#2165.28 / #2165.30) est RETIRÉ : c'était
                  un énoncé dont le seul contenu était une absence, au-dessus
                  d'une liste. Décision de Louis du 20/09/2026 — on affiche ce
                  qu'on sait. Le tri lui-même reste (`degradedSplit.unmeasured`
                  absorbe ces entrées pour qu'elles ne soient PAS peintes en
                  panne, GA-259). */}
              {/* #2165.11 — Laura propose de diviser une demande trop large,
                  APRÈS les bandeaux d'état (ce qui a été trouvé prime sur ce
                  qu'on pourrait chercher différemment). */}
              {splitSuggestion && (
                <DiscoverSplitSuggestionNotice suggestion={splitSuggestion} onApply={applySplitSearch} />
              )}
              {/* #2490 / #2496 — sur QUOI la liste est filtrée, ce qui ne l'a
                  pas filtrée, et l'angle coupé par le temps (pas une panne). */}
              {!requestReading?.unreadable && (
                <SearchReadingNotice
                  reading={requestReading}
                  freetext={activeFilters.freetext}
                  keptCriteria={keptCriteriaLabels(activeFilters)}
                  onClearKept={() => runSearchWith(withoutKeptCriteria(filters), sectorsCleared)}
                  onSuggestCity={city =>
                    runSearchWith(
                      {
                        ...filters,
                        freetext: '',
                        keywords: filters.freetext.trim().slice(0, -city.length).trim(),
                        city,
                      },
                      sectorsCleared,
                    )
                  }
                />
              )}
              {/* #4358.3 — un secteur sans donnée suffisante le dit, sous la liste. */}
              {resultType === 'accounts' && !isNeutralContext && visible.length > 0 && (
                <SectorCoverageNotice reading={sectorCoverageReading(activeFilters.sectors, candidates)} />
              )}
            </DiscoverQualityNotes>
          )}

          {renderResults()}
        </div>
      </div>
    </div>
  )
}
