import {
  activeNeedFilterCount,
  emptyNeedFilters,
  needFiltersToQuery,
  type NeedFilters,
  type OpenNeedRow,
  type OpenNeedsQuery,
  type ProjectNeed,
} from '@bellum/contracts'
import {
  Box,
  Button,
  chipClassName,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  SearchInput,
  Text,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { ListFilter, Plus, Search, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { RecordPanel } from '@/features/records/RecordPanel'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDebounce } from '@/hooks/useDebounce'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { AffairesTabs } from '@/features/projects/view/AffairesTabs'
import { IntakeQueueLink } from '@/features/projects/view/IntakeQueueLink'
import { PipelineViewSwitch } from '@/features/projects/view/PipelineToolbarControls'
import { HygieneBadge } from '@/components/hygiene/HygieneBadge'
import { useFinanceAccess } from '@/features/propagation/api'
import { formatCents } from '@/lib/money'
import { useCrmCounters } from '@/features/crm-counters/useCrmCounters'
import { useOpenNeeds } from '../hooks/useOpenNeeds'
import { CreateNeedDialog } from './CreateNeedDialog'
import { ImportNeedsDialog } from './ImportNeedsDialog'
import { NeedConsultantDoor } from './NeedConsultantDoor'
import { NeedFromRfpPreview } from './NeedFromRfpPreview'
import { NeedProposalsPanel } from './NeedProposalsPanel'
import { OpenNeedsTable } from './OpenNeedsTable'
import { NeedsKanban, NeedsLauraRail } from './NeedsKanban'
import { NeedsFilterDrawer } from './NeedsFilterDrawer'
import { NeedsExportButton } from './NeedsExportButton'
import { NeedsSelectionBar } from './NeedsSelectionBar'
// La porte de l'état vide FILTRÉ vit dans son propre module : trois écrans
// rendent le même état, et la réécrire ici la ferait diverger à la première
// retouche.
import { ClearFiltersAction } from '../../portfolio/view/EmptyStateActions'
import { MatchDrawer } from '@/features/matching/view/MatchDrawer'
import { useRunMatch } from '@/features/matching/hooks'
import { useTalentSearch } from '@/features/consultants/hooks'
import { Route } from '@/routes/projects/needs'

const PAGE_SIZE = 50

/**
 * « Tous les rôles que tes clients cherchent en ce moment » (PDF 2 §7.5,
 * ticket BEL-CRM-101). L'écran d'entrée du recruteur.
 *
 * Le problème qu'il ferme : les besoins étaient enterrés dans le tiroir de
 * chaque projet. Il fallait ouvrir compte par compte pour savoir sur quoi
 * travailler — donc on travaillait sur ce qu'on avait sous les yeux, pas sur ce
 * qui pressait.
 *
 * Les quatre états de l'écran sont DISTINCTS, et c'est délibéré : « aucun
 * besoin ouvert » et « je n'ai pas pu charger » ne se racontent pas de la même
 * façon. Confondre les deux fait lire une panne comme un fait.
 */
export function OpenNeedsPage() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const routeSearch = Route.useSearch()
  // `?q=` — l'amorce venue du lanceur (`⌘K` → « Besoin »). `useState` prend sa
  // valeur au PREMIER rendu seulement : arriver avec `?q=Java` remplit le
  // champ, et le vider ensuite ne le fait pas revenir tout seul.
  const [search, setSearch] = useState(routeSearch.q ?? '')
  const [debounced] = useDebounce(search, 250)
  // Les neuf autres critères du contrat serveur (I-34). Ils vivent dans UN
  // objet et non dans neuf `useState` : la traduction en requête est une
  // fonction pure et testée (`needFiltersToQuery`), et neuf états séparés
  // finiraient par diverger de ce qu'elle attend.
  // `?account_id=` — l'amorce venue du dossier compte (#2777) : même patron
  // que `q` juste au-dessus, prise au PREMIER rendu seulement.
  const [filters, setFilters] = useState<NeedFilters>(() => ({
    ...emptyNeedFilters(),
    account_id: routeSearch.account_id ?? '',
  }))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const withoutShortlist = filters.without_shortlist
  const deadlinePassed = filters.deadline_passed
  const setWithoutShortlist = (next: (value: boolean) => boolean) =>
    setFilters(current => ({ ...current, without_shortlist: next(current.without_shortlist) }))
  const setDeadlinePassed = (next: (value: boolean) => boolean) =>
    setFilters(current => ({ ...current, deadline_passed: next(current.deadline_passed) }))
  /**
   * #1334 (7/9) — les filtres rapides que Louis demande : « À traiter · Sans
   * profil · Démarrage proche · À qualifier ».
   *
   * Trois des quatre existent dans le contrat serveur et sont branchés ici.
   *
   * ⚠️ « À traiter » n'en fait PAS partie, et ce n'est pas un oubli : c'est
   * l'état par défaut de cet écran — les besoins ouverts, sans filtre. Une
   * pastille qui ne filtre rien ferait chercher un effet qu'elle n'a pas.
   *
   * ⚠️ Trente jours et non un autre nombre : c'est la fenêtre que Louis nomme
   * lui-même en 8/9 — « 2 démarrent dans moins de 30 jours ».
   */
  const STARTING_SOON_DAYS = 30
  const startingSoon = filters.starting_within_days === STARTING_SOON_DAYS
  const toQualify = filters.status === 'to_qualify'
  const toggleStartingSoon = () =>
    setFilters(current => ({
      ...current,
      // `null` et non `0` : zéro voudrait dire « ceux qui démarrent
      // aujourd'hui », une tout autre question. Le contrat le dit déjà.
      starting_within_days: current.starting_within_days === STARTING_SOON_DAYS ? null : STARTING_SOON_DAYS,
    }))
  const toggleToQualify = () =>
    setFilters(current => ({ ...current, status: current.status === 'to_qualify' ? '' : 'to_qualify' }))
  // #2173.16 — Vue rapide : « En attente client ». Le statut stocké
  // `client_review` existe déjà (`NEED_STATUS_VARIANT`, `OpenNeedsTable.tsx`) ;
  // seule la pastille manquait. MÊME champ `status` que « À qualifier » : les
  // deux sont mutuellement exclusives, un besoin n'a qu'un statut à la fois.
  const clientReview = filters.status === 'client_review'
  const toggleClientReview = () =>
    setFilters(current => ({ ...current, status: current.status === 'client_review' ? '' : 'client_review' }))
  /**
   * #2173.49 — la vue « Archivés ». Un rangement, pas un statut (décision
   * Louis 17/09/2026) : composée comme les autres pastilles, elle bascule le
   * SEUL critère qui montre ce que la liste par défaut exclut toujours.
   */
  const archived = filters.archived
  const toggleArchived = () => setFilters(current => ({ ...current, archived: !current.archived }))
  const [offset, setOffset] = useState(0)
  // Liste ou kanban. Deux LECTURES du même stock : la liste répond « lequel »,
  // le kanban répond « où ça s'accumule ». Aucune ne remplace l'autre.
  const [view, setView] = useState<'list' | 'kanban'>('list')

  const query = useMemo<OpenNeedsQuery>(() => {
    const base = needFiltersToQuery({ ...filters, q: debounced }, { offset, limit: PAGE_SIZE })
    // Théo C projects-besoins.R3 — le kanban a une colonne « Couvert » : il lit
    // aussi les besoins pourvus (les perdus/annulés n'y ont pas de colonne).
    return view === 'kanban' && !base.status && !base.theo_status ? { ...base, include_closed: true } : base
  }, [filters, debounced, offset, view])
  const activeFilters = useMemo(() => activeNeedFilterCount({ ...filters, q: debounced }), [filters, debounced])

  const { data, isLoading, isError, refetch } = useOpenNeeds(query)
  // #4193 — le total « besoins ouverts » : `needs_open` de `GET /crm-counters`.
  const { data: crmCounters } = useCrmCounters()
  // Le droit financier — voir NeedsKanban.tsx pour la doctrine complète
  // (revirement du 31/08/2026, `c53_montant_du_pipe`). Lu ICI aussi : le
  // bandeau de tête affiche « CA potentiel », qui est le MÊME cumul agrégé
  // que la colonne du kanban, juste sommé sur toutes les colonnes.
  const { canReadPipeAmounts } = useFinanceAccess()
  // Le vivier, juste pour savoir s'il est VIDE : une page suffit, on ne charge
  // pas trois mille fiches pour décider de l'état d'un bouton.
  const pool = useTalentSearch({ page: 1, limit: 1 })
  const runMatch = useRunMatch()
  const openMatch = (needId: string) => {
    void navigate({ to: '/projects/needs', search: { match: needId } })
  }

  /**
   * LA TROISIÈME PORTE, montée UNE fois pour tout l'écran (§3.1).
   *
   * Une par ligne monterait cinquante formulaires — avec leurs minuteurs de
   * saisie et leur recherche de doublon — pour n'en ouvrir jamais qu'un. L'état
   * est donc ici, et la ligne ne fait que le poser : c'est la même règle que la
   * sélection, dont deux états divergeraient.
   *
   * ⚠️ Elle n'ouvre RIEN d'autre : la route ne change pas, la liste, les
   * filtres et la position restent. C'est le point entier de la correction —
   * la porte existait et NAVIGUAIT vers le vivier.
   */
  const [addConsultantFor, setAddConsultantFor] = useState<OpenNeedRow | null>(null)

  /**
   * LE GESTE MANQUANT (#1097 bis) — créer un besoin sans passer par le tiroir
   * d'un projet déjà ouvert. Voir `CreateNeedDialog` pour ce qu'il ferme et ce
   * qu'il refuse de faire (créer un projet à la volée).
   *
   * ⚠️ Le geste qui SUIT n'est PAS un rafraîchissement de cette liste : le
   * dialogue ne capture que le titre et le projet, tout le reste (compétences,
   * TJM, urgence…) manque encore, et c'est la fiche du besoin qui les recueille.
   * Rester sur la liste courante risquerait en plus de cacher le besoin neuf
   * sous un filtre actif (recherche, urgence…) qu'il ne remplit pas forcément.
   */
  const [createNeedOpen, setCreateNeedOpen] = useState(false)
  // #4194 (L3) — la ligne ouvre le panneau latéral UNIQUE ; la fiche du besoin est sa porte « Ouvrir la fiche complète ».
  const [panelNeedId, setPanelNeedId] = useState<string>()
  const handleNeedCreated = (need: ProjectNeed) => {
    setCreateNeedOpen(false)
    void navigate({ to: '/projects/needs/$needId', params: { needId: need.id } })
  }

  /**
   * #2173.56 — L'IMPORT EN MASSE, TRANCHÉ (18/09/2026 au soir, QCM). Voir
   * `ImportNeedsDialog.tsx` pour la doctrine complète : plusieurs fiches de
   * poste d'un coup, le MÊME moteur d'extraction que l'assistant, rien n'est
   * créé sans relecture cochée.
   */
  const [importNeedsOpen, setImportNeedsOpen] = useState(false)

  /**
   * C'est l'URL qui lance le classement, pas le bouton.
   *
   * Trouvé en recette : le bouton lançait le calcul ET naviguait, si bien qu'un
   * lien `?match=…` collé dans un message — la promesse même du panneau
   * partageable — ouvrait un tiroir bloqué sur « Je compare les profils… », et
   * qu'arriver depuis le tiroir d'un projet donnait le même écran mort. Un
   * paramètre d'URL qui n'entraîne aucune lecture n'est pas un lien partageable,
   * c'est une décoration.
   *
   * La garde contre la boucle est le `ref` : la mutation change `runMatch.data`,
   * ce qui re-rend l'écran, et sans mémoire du besoin déjà demandé on
   * relancerait un calcul — et une ligne de journal — à chaque rendu.
   */
  const launchedFor = useRef<string | null>(null)
  useEffect(() => {
    const needId = routeSearch.match
    if (!needId) {
      launchedFor.current = null
      return
    }
    if (launchedFor.current === needId) return
    launchedFor.current = needId
    runMatch.mutate(needId, { onError: error => toast.error(error.message) })
  }, [routeSearch.match, runMatch])
  // Les noms viennent de la RÉPONSE : le moteur ne les a jamais reçus, et
  // l'écran doit pourtant désigner des personnes.
  const identities = useMemo(
    () =>
      new Map(
        (runMatch.data?.identities ?? []).map(entry => [
          entry.consultantId,
          { fullName: entry.fullName, title: entry.title },
        ]),
      ),
    [runMatch.data],
  )
  // Mémoïsé parce que `?? []` fabrique un tableau NEUF à chaque rendu : la
  // sélection résolue plus bas en dépend, et un tableau qui change d'identité à
  // chaque rendu annule la mémoïsation qu'elle cherche.
  const rows = useMemo(() => data?.data ?? [], [data])
  const total = data?.pagination.totalItems ?? 0
  const filtered = activeFilters > 0

  /**
   * LE BANDEAU DE TÊTE (04-kanban-besoins.png).
   *
   * La maquette montre cinq tuiles dont trois (« Missions en cours »,
   * « Présentations », « À facturer ») viennent d'un AUTRE domaine (missions,
   * facturation — `apps/web/src/features/missions/**`, hors périmètre de ce
   * lot) avec des DELTAS hebdo/mensuel qu'aucune infrastructure de ce dépôt ne
   * mesure aujourd'hui (aucun instantané historique de ces compteurs
   * n'existe). Cinq tuiles restent, RENOMMÉES pour rester VRAIES sur ce que
   * cet écran peut réellement compter :
   *
   *  · « Besoins ouverts » — `counters.total`, compté par le SERVEUR sur le
   *    filtre entier (comme les cinq compteurs existants juste en dessous) ;
   *  · « Matching à traiter » / « Présentations en cours » — comptés sur la
   *    PAGE chargée (`rows`), la même limite que `NeedsKanban` porte déjà pour
   *    son cumul par colonne ;
   *  · « Sans profil positionné » — `counters.withoutShortlist`, déjà affiché
   *    plus bas comme filtre cliquable ; répété ici SOUS LA MÊME FORME
   *    serait la loi 4 du tome 7 — cette tuile-ci n'est donc PAS un doublon,
   *    elle porte le TOTAL du filtre, pas un bouton de filtre ;
   *  · « CA potentiel » — le cumul déjà calculé par `NeedsKanban`, sommé sur
   *    TOUTES les colonnes. Derrière le droit financier depuis le 31/08/2026
   *    (revirement de Louis, `c53_montant_du_pipe`) : RETIRÉ, jamais à 0, sans
   *    `canReadPipeAmounts` (rouvert au commercial `finance:read:own`, #4016.8e).
   *
   * Chaque delta est « non mesuré » — jamais un delta inventé : aucune table
   * de ce dépôt ne conserve un instantané hebdomadaire ou mensuel de ces
   * compteurs, donc aucun delta n'est CALCULABLE, et « non mesuré » est la
   * seule réponse vraie.
   */
  const matchingToTreat = rows.filter(row => row.status === 'to_match' || row.status === 'matching').length
  const presenting = rows.filter(
    row => row.status === 'shortlist_ready' || row.status === 'submitted' || row.status === 'client_review',
  ).length
  const potentialWithRate = rows.flatMap(row =>
    row.target_tjm_cents === null ? [] : [row.target_tjm_cents * row.headcount],
  )
  const potentialDailyCents = potentialWithRate.reduce((sum, cents) => sum + cents, 0)

  /**
   * Le geste que l'état vide filtré NOMMAIT sans l'offrir (« Assouplis un
   * filtre »). Il repose les trois réglages qui composent la requête — et les
   * trois seulement, parce que `query` est mémoïsé sur eux : en oublier un
   * laisserait la liste filtrée sous un message qui promet le contraire.
   */
  const clearFilters = () => {
    setSearch('')
    setFilters(emptyNeedFilters())
    setOffset(0)
  }

  /**
   * Les besoins cochés.
   *
   * L'état vit ICI et pas dans le tableau : la barre d'actions est au-dessus de
   * lui, et deux états de sélection — l'un dans le tableau, l'autre dans la
   * barre — divergeraient au premier changement de page.
   *
   * ⚠️ La sélection se vide quand le filtre, la recherche ou la page changent.
   * Sans ça, un besoin coché puis sorti du filtre resterait dans la sélection
   * INVISIBLE, et le geste de masse suivant l'emporterait sans que personne
   * l'ait vu.
   */
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  useEffect(() => setSelectedIds([]), [query])
  /**
   * Les lignes cochées, résolues sur la PAGE affichée.
   *
   * Le menu a besoin de l'état et des compétences de chaque besoin pour ne
   * proposer que ce que le serveur accepterait. Résoudre ici plutôt que dans la
   * barre garde la sélection et son contenu au même endroit — deux sources qui
   * répondent « qui est coché ? » divergent au premier changement de page.
   */
  const selectedNeeds = useMemo(() => rows.filter(row => selectedIds.includes(row.id)), [rows, selectedIds])
  const clearSelection = () => setSelectedIds([])
  const toggleOne = (needId: string) =>
    setSelectedIds(current => (current.includes(needId) ? current.filter(id => id !== needId) : [...current, needId]))
  // « Tout » = la PAGE affichée, jamais les cinq cents besoins du filtre :
  // cocher ce qu'on ne voit pas est le geste qu'on regrette.
  const toggleAllOnPage = () =>
    setSelectedIds(current => (rows.every(row => current.includes(row.id)) ? [] : rows.map(row => row.id)))

  // #3822.D (recette prod 08/10) — `min-h-full` et non `h-full` : la réserve de la bulle de Laura se pose
  // après le contenu réel (`CustomerPageContent.tsx`, #3480).
  //
  // REFONTE THÉO C (23/10/2026, maquette `projects-besoins`) — dans l'ordre de la maquette : l'en-tête
  // (« Besoins », sa phrase, Exporter · Ajouter un besoin), le guide de la coque, la ligne de la chaîne,
  // la barre Pipeline · Besoins · Présentations, la barre d'outils (recherche · Filtres · N demandes ·
  // Kanban/Liste), la ligne de résumé, puis la liste (ou le Kanban) et la barre de sélection.
  return (
    <CustomerPage titleInScreen pageTitle={t('openNeeds.title')} contentClassName="flex min-h-full flex-col px-0 py-0">
      <Box className="flex min-h-full w-full flex-1 flex-col">
        {/* ⚠️ Plus de barre de lentilles ici (recette live 27/08/2026) : une seule barre d'onglets, celle
            d'Affaires. */}
        <Box className={`min-w-0 flex-1 space-y-4 pb-6 ${PAGE_GUTTER_X}`}>
          {/* Théo `.bo11-head` — « Besoins », sa phrase, Exporter · Ajouter un besoin à droite. Le h1 vient du
              rôle `pageTitle` par `ScreenIntro` (F2-FIX #4332, GA-347). */}
          <ScreenIntro
            title={t('page.needsIntroTitle')}
            titleWithoutName={t('page.needsIntroTitleWithoutName')}
            subtitle={t('page.needsIntroSubtitle')}
            action={
              <Box display="flex" className="flex-wrap items-center gap-2">
                {/* #4295.14 — l'export des besoins visibles, à côté de la création. */}
                <NeedsExportButton needIds={rows.map(row => row.id)} />
                {/* LA PORTE MANQUANTE (#1097 bis) : un besoin se crée depuis la liste, pas seulement d'un projet. */}
                <Button size="sm" onClick={() => setCreateNeedOpen(true)} className="gap-1.5 pointer-coarse:min-h-11">
                  <Plus className="size-4" aria-hidden />
                  {t('openNeeds.createNeed.addTrigger')}
                </Button>
              </Box>
            }
          />
          {/* Théo `.v18-match-entry` — le repère permanent de la chaîne (C projects-besoins.N3 / R7), et
              Laura sur la vue liste aussi (#1334 8/9 : un LIEN qui pré-remplit la question, jamais un envoi). */}
          <Box
            display="flex"
            className="flex-wrap items-center gap-2 rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-3.5 py-2.5"
          >
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="needs-chain">
              {t('openNeeds.chain')}
            </Text>
            <span className="flex-1" />
            <AskLaura label={t('page.needsAskLauraLabel')} question={t('page.needsAskLauraQuestion')} />
          </Box>
          <AffairesTabs active="needs" />
          {/* #4499 — la file de qualification, qui a quitté le Pipeline avec ses quatre cartes. */}
          <IntakeQueueLink />

          {/* Théo `.bo11-toolbar` — recherche · Filtres · (espace) · N demandes · Kanban/Liste. */}
          <Box data-testid="needs-toolbar" display="flex" className="min-w-0 flex-wrap items-center gap-2">
            <SearchInput
              size="sm"
              value={search}
              onChange={value => {
                setSearch(value)
                setOffset(0)
              }}
              placeholder={t('openNeeds.searchPlaceholder')}
              className="w-full md:w-64 md:shrink-0"
              inputClassName="w-full lg:w-full"
            />
            {/* #1334 (7/9) — les filtres rapides, cochables ensemble (multi-sélection), dans un menu
                « Filtres » comme la maquette ; « Plus de filtres » ouvre les neuf autres critères du
                contrat serveur (I-34) et dit COMBIEN sont posés. */}
            <NeedsFiltersMenu
              options={[
                { value: 'without_shortlist', label: t('openNeeds.filters.withoutShortlist'), on: withoutShortlist },
                {
                  value: 'starting_soon',
                  label: t('openNeeds.filters.startingSoon', { days: STARTING_SOON_DAYS }),
                  on: startingSoon,
                },
                { value: 'to_qualify', label: t('openNeeds.filters.toQualify'), on: toQualify },
                { value: 'stale', label: t('openNeeds.stale.filter'), on: filters.stale },
                { value: 'client_review', label: t('openNeeds.filters.clientReview'), on: clientReview },
                { value: 'deadline_passed', label: t('openNeeds.filters.deadlinePassed'), on: deadlinePassed },
                { value: 'archived', label: t('openNeeds.filters.archived'), on: archived },
              ]}
              onToggle={value => {
                if (value === 'without_shortlist') setWithoutShortlist(current => !current)
                if (value === 'starting_soon') toggleStartingSoon()
                if (value === 'to_qualify') toggleToQualify()
                if (value === 'stale') setFilters(current => ({ ...current, stale: !current.stale }))
                if (value === 'client_review') toggleClientReview()
                if (value === 'deadline_passed') setDeadlinePassed(current => !current)
                if (value === 'archived') toggleArchived()
                setOffset(0)
              }}
              moreLabel={
                activeFilters > 2
                  ? t('openNeeds.filters.moreActive', { count: activeFilters })
                  : t('openNeeds.filters.more')
              }
              onMore={() => setDrawerOpen(true)}
            />
            <span className="hidden flex-1 md:block" />
            {total > 0 && (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('openNeeds.count', { count: total })}
              </Text>
            )}
            <PipelineViewSwitch
              value={view === 'kanban' ? 'kanban' : 'table'}
              onChange={next => setView(next === 'kanban' ? 'kanban' : 'list')}
            />
          </Box>

          {/* Théo `.bo11-summary` — les chiffres de tête en UNE ligne. Chacun dit sur quoi il est compté
              (au survol) : deux sont comptés par le serveur sur le filtre, deux sur la page chargée. Les
              compteurs qui ont un filtre serveur restent des boutons (un compteur qui ne mène nulle part
              est une décoration) ; une absence ne fait aucun segment. */}
          {data?.counters ? (
            <Box
              data-testid="needs-summary"
              role="group"
              aria-label={t('openNeeds.summaryLabel')}
              display="flex"
              className="flex-wrap items-center gap-x-5 gap-y-2 text-xs text-[var(--bellum-text-secondary)]"
            >
              {crmCounters && crmCounters.counters.needs_open.value !== null ? (
                <SummaryFigure
                  value={String(crmCounters.counters.needs_open.value)}
                  label={t('needsKanban.band.openNeeds')}
                  hint={t('needsKanban.band.onFilter')}
                />
              ) : null}
              <SummaryFigure
                value={String(matchingToTreat)}
                label={t('needsKanban.band.matching')}
                hint={t('needsKanban.band.onPage', { count: rows.length })}
              />
              <SummaryFigure
                value={String(presenting)}
                label={t('needsKanban.band.presenting')}
                hint={t('needsKanban.band.onPage', { count: rows.length })}
              />
              <Counter
                label={t('openNeeds.counters.withoutShortlist')}
                value={data.counters.withoutShortlist}
                active={withoutShortlist}
                onClick={() => {
                  setWithoutShortlist(value => !value)
                  setOffset(0)
                }}
              />
              <Counter
                label={t('openNeeds.counters.deadlinePassed')}
                value={data.counters.deadlinePassed}
                active={deadlinePassed}
                onClick={() => {
                  setDeadlinePassed(value => !value)
                  setOffset(0)
                }}
              />
              <Counter label={t('openNeeds.counters.startingSoon')} value={data.counters.startingSoon} />
              <Counter label={t('openNeeds.counters.notStaffable')} value={data.counters.notStaffable} />
              {/* ⚠️ Derrière le droit financier (`c53_montant_du_pipe`) : RETIRÉ sans le droit — jamais un
                  « CA potentiel » à 0 €. Un PLANCHER quand des besoins n'ont pas de TJM. */}
              {canReadPipeAmounts ? (
                <SummaryFigure
                  value={potentialWithRate.length > 0 ? formatCents(potentialDailyCents) : t('needsKanban.noRate')}
                  label={t('needsKanban.band.potential')}
                  hint={
                    rows.length - potentialWithRate.length > 0
                      ? t('needsKanban.withoutRate', { count: rows.length - potentialWithRate.length })
                      : t('needsKanban.band.onPageAmount', { count: rows.length })
                  }
                />
              ) : null}
              {/* Le contrôle de qualité du cockpit, descendu là où il se RÉPARE (compté par
                  `/pilotage/hygiene`, sur l'espace). */}
              <HygieneBadge
                check="needs_without_skills"
                label={t('openNeeds.hygiene.withoutSkills')}
                hint={t('openNeeds.hygiene.withoutSkillsHint')}
              />
            </Box>
          ) : null}

          {/* #2571 — un appel d'offres transféré amorce ICI sa prévisualisation (aucune écriture avant
              confirmation explicite). */}
          {routeSearch.fromRfp ? (
            <NeedFromRfpPreview
              rfpId={routeSearch.fromRfp}
              onDismiss={() =>
                void navigate({
                  to: '/projects/needs',
                  search: prev => ({ ...prev, fromRfp: undefined, onglet: 'besoins' }),
                })
              }
            />
          ) : null}

          {/* Ce que l'analyse a VU, et qui n'est pas encore un besoin — séparé de la liste. */}
          <NeedProposalsPanel />

          {/* LA TROISIÈME PORTE (§3.1) — le panneau « et maintenant ? » EN HAUT de la liste, là où l'œil est. */}
          <NeedConsultantDoor need={addConsultantFor} onClose={() => setAddConsultantFor(null)} onMatch={openMatch} />

          {isError ? (
            <EmptyState
              size="md"
              align="center"
              icon={<TriangleAlert className="h-10 w-10" />}
              title={t('openNeeds.error.title')}
              description={t('openNeeds.error.description')}
              action={
                <Button size="sm" onClick={() => void refetch()}>
                  {t('openNeeds.error.retry')}
                </Button>
              }
            />
          ) : isLoading ? (
            <Text size="sm" color="text-[var(--bellum-text-muted)]">
              {t('openNeeds.loading')}
            </Text>
          ) : rows.length === 0 ? (
            <EmptyState
              size="md"
              align="center"
              icon={<Search className="h-10 w-10" />}
              title={filtered ? t('openNeeds.emptyFiltered.title') : t('openNeeds.empty.title')}
              description={filtered ? t('openNeeds.emptyFiltered.description') : t('openNeeds.empty.description')}
              // Deux vides, deux gestes — et chacun est celui que sa phrase
              // désigne. « Assouplis un filtre » sans moyen de le faire est pire
              // qu'un silence : ça prouve qu'on savait quoi proposer. Trente
              // lignes plus bas, les cinq compteurs de tête sont déjà des
              // filtres cliquables « parce qu'un compteur qui ne mène nulle part
              // est une décoration » — la contradiction était interne au fichier.
              action={
                filtered ? (
                  <ClearFiltersAction onClear={clearFilters} />
                ) : (
                  // Le vide « pour de bon » : un besoin naît d'un projet qui
                  // avance, donc le chemin qui l'alimente est le pipe.
                  // `/projects` existe (`apps/web/src/routes/projects/index.tsx`).
                  <Box display="flex" className="flex-wrap justify-center gap-2">
                    <Button asChild className="pointer-coarse:min-h-11">
                      <Link to="/projects">{t('openNeeds.empty.action')}</Link>
                    </Button>
                    {/* #2173.56 — « Importer mes besoins » (issue 2173.56) menait
                        vers RIEN jusqu'au 18/09 au soir : seul le dépôt d'UNE
                        fiche de poste existait (`CreateNeedDialog`). Décision
                        de Louis (QCM, 18/09 au soir) : l'import de masse est le
                        dépôt de PLUSIEURS fiches de poste D'UN COUP — jamais un
                        tableur. `ImportNeedsDialog` réutilise le MÊME moteur
                        d'extraction que l'assistant (`rfpApi.create`), une fois
                        par fichier. */}
                    <Button
                      variant="outline"
                      className="pointer-coarse:min-h-11"
                      onClick={() => setImportNeedsOpen(true)}
                    >
                      {t('openNeeds.importNeeds.cta')}
                    </Button>
                  </Box>
                )
              }
            />
          ) : (
            <>
              {/* Les sept gestes de masse. La barre n'existe que quand
                  quelque chose est coché — une barre d'actions permanente sur
                  une sélection vide propose des gestes qui ne font rien.

                  ⚠️ Ce sont les LIGNES cochées qui descendent, pas leurs
                  identifiants : le menu a besoin de l'état et des compétences
                  pour ne proposer que ce que le serveur accepterait.

                  Montée dans les DEUX vues depuis ce lot : les sept gestes
                  existaient déjà en vue liste et n'étaient accessibles nulle
                  part en kanban — la sélection est le MÊME état
                  (`selectedIds`) quelle que soit la vue. */}
              <NeedsSelectionBar needs={selectedNeeds} onClear={clearSelection} />

              {view === 'kanban' ? (
                <Box display="flex" className="flex-col-reverse items-start gap-3 lg:flex-row">
                  <Box className="min-w-0 flex-1">
                    <NeedsKanban rows={rows} onOpen={openMatch} selectedIds={selectedIds} onToggle={toggleOne} />
                  </Box>
                  <NeedsLauraRail
                    rows={rows}
                    // Les ISSUES — comptées par le SERVEUR sur le même filtre
                    // que la liste, jamais sur la page : c'est ce qui donne
                    // enfin un dénominateur au taux de conversion, que cet
                    // écran ne pouvait pas mesurer tant qu'il ne chargeait que
                    // des besoins ouverts (revirement du 31/08/2026).
                    outcomes={data?.counters.outcomes}
                    onSelect={ids => setSelectedIds([...ids])}
                    onOpenAllActions={() => setSelectedIds(rows.map(row => row.id))}
                  />
                </Box>
              ) : (
                <OpenNeedsTable
                  rows={rows}
                  // ⚠️ La ligne ouvre le BESOIN (jamais la liste des projets sans dire
                  // lequel) — #4194 : dans le panneau latéral unique, la fiche
                  // complète en est la porte.
                  onOpenNeed={setPanelNeedId}
                  onMatch={openMatch}
                  onAddConsultant={setAddConsultantFor}
                  poolIsEmpty={pool.isSuccess && (pool.data?.total ?? 0) === 0}
                  selectedIds={selectedIds}
                  onToggle={toggleOne}
                  onToggleAll={toggleAllOnPage}
                />
              )}
              {total > PAGE_SIZE && (
                <Box display="flex" className="items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}
                  >
                    {t('openNeeds.previous')}
                  </Button>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('openNeeds.page', {
                      current: data?.pagination.currentPage ?? 1,
                      total: data?.pagination.totalPages ?? 1,
                    })}
                  </Text>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!data?.pagination.hasNext}
                    onClick={() => setOffset(value => value + PAGE_SIZE)}
                  >
                    {t('openNeeds.next')}
                  </Button>
                </Box>
              )}
            </>
          )}
        </Box>
      </Box>

      {/* Les neuf critères que le contrat serveur exposait sans qu'aucune
          interface ne les atteigne (I-34). */}
      <NeedsFilterDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        filters={filters}
        searchTerm={search}
        onApply={next => {
          // `q` vit dans la barre de recherche et NULLE PART ailleurs (le
          // rendu lit `{ ...filters, q: debounced }`) : le reposer dans
          // `filters` créerait un second réglage pour la même chose, et c'est
          // celui qu'on oublierait de mettre à jour. Le tiroir le porte le
          // temps d'un aller-retour parce qu'une vue enregistrée doit le
          // garder ; il redescend ici dans son unique domicile.
          setSearch(next.q)
          setFilters({ ...next, q: '' })
          setOffset(0)
        }}
      />

      {/* Le panneau est piloté par l'URL (`?match=`) : le lien se colle dans un
          message, et le recruteur d'à côté ouvre exactement le même classement. */}
      <MatchDrawer
        run={runMatch.data ?? null}
        needId={routeSearch.match ?? ''}
        identities={identities}
        // #2178.20/.21 — le geste « Refuser le besoin » du panneau
        // zéro-résultat a besoin du statut/compétences du besoin ouvert ;
        // `rows` (cette page) les porte déjà. `undefined` si la ligne n'est
        // plus dans la page courante (filtre changé pendant que le tiroir
        // reste ouvert) : le geste se grise plutôt que de deviner.
        need={rows.find(row => row.id === routeSearch.match)}
        open={Boolean(routeSearch.match)}
        onOpenChange={open => {
          // #4499 — `onglet` reste posé : l'URL nue redirige vers le Pipe, fermer le panneau y renvoyait.
          if (!open) void navigate({ to: '/projects/needs', search: { onglet: 'besoins' } })
        }}
      />

      <CreateNeedDialog open={createNeedOpen} onOpenChange={setCreateNeedOpen} onCreated={handleNeedCreated} />
      {/* Monté SEULEMENT à l'ouverture : `ImportNeedsDialog` lit `useAccounts`
          (donc la session) dès son rendu, et cet écran est atteint par des
          parcours qui n'en ont pas besoin tant que personne n'a cliqué. */}
      {importNeedsOpen ? <ImportNeedsDialog open onOpenChange={setImportNeedsOpen} /> : null}
      <RecordPanel
        target={panelNeedId ? { kind: 'need', id: panelNeedId } : null}
        onClose={() => setPanelNeedId(undefined)}
      />
    </CustomerPage>
  )
}

/**
 * Un compteur de tête.
 *
 * `<button>` et non un `<div onClick>` quand il filtre : ce qui se clique se
 * tabule (GA-35). Les deux compteurs qui n'ont PAS de filtre serveur restent
 * des textes — un bouton qui ne fait rien est pire qu'un chiffre.
 */
function Counter({
  label,
  value,
  active,
  onClick,
}: {
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  const body = (
    <>
      <Text element="span" size="xs" weight="semibold">
        {value}
      </Text>{' '}
      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
    </>
  )
  // Même langage que les autres pastilles, cliquable ou non : une tuile qui
  // ressemble à une pastille sans en être une fait chercher un clic qui
  // n'existe pas — ici c'est bien la MÊME famille, avec ou sans `onClick`.
  const className = chipClassName({ active: active === true, size: 'sm' })
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <span className={className}>{body}</span>
  )
}

/**
 * Un chiffre de la ligne de résumé (Théo `.bo11-summary`) : la valeur en gras, son libellé, et SUR QUOI il
 * est compté au survol (`title`) — deux sont comptés sur le filtre, deux sur la page : côte à côte sans le
 * dire, ils se liraient comme quatre mesures du même ensemble. La variation n'est pas mesurée (aucune photo
 * de ces compteurs) : la raison reste au survol, jamais dans la ligne (#1332 2/9).
 */
function SummaryFigure({ value, label, hint }: { value: string; label: string; hint?: string }) {
  const { t } = useTranslation('projects')
  return (
    <span title={[hint, t('needsKanban.band.deltaReason')].filter(Boolean).join(' — ')}>
      <b className="mr-1 font-semibold text-[var(--bellum-text-primary)]">{value}</b>
      {label.toLowerCase()}
    </span>
  )
}

/**
 * « Filtres » — les filtres rapides de la liste, cochables ensemble, puis « Plus de filtres » qui ouvre le
 * tiroir des neuf autres critères (I-34). Un compteur sur le bouton dès qu'un filtre est posé.
 */
function NeedsFiltersMenu<V extends string>({
  options,
  onToggle,
  moreLabel,
  onMore,
}: {
  options: ReadonlyArray<{ value: V; label: string; on: boolean }>
  onToggle: (value: V) => void
  moreLabel: string
  onMore: () => void
}) {
  const { t } = useTranslation('projects')
  const active = options.filter(option => option.on).length
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t('openNeeds.filters.quickLabel')}
          className="h-9 gap-1.5 rounded-control pointer-coarse:min-h-11"
        >
          <ListFilter className="size-4" aria-hidden />
          {t('pipeTheo.filters.cta')}
          {active > 0 ? (
            <span className="inline-grid min-w-5 place-items-center rounded-full bg-[var(--bellum-accent-bg)] px-1.5 text-xs font-bold text-[var(--bellum-text-accent)]">
              {active}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-72">
        <DropdownMenuLabel>{t('pipeTheo.filters.caption')}</DropdownMenuLabel>
        {options.map(option => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={option.on}
            onSelect={event => event.preventDefault()}
            onCheckedChange={() => onToggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onMore}>{moreLabel}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
