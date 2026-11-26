import { isPipelineStage } from '@bellum/contracts'
import { matchesFlexibleQuery } from '@bellum/contracts'
import type { PipelineStage, PipelineSummary, ProjectRow } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchEmptyState,
  SearchInput,
  SelectField,
  TabNav,
  Text,
} from '@bellum/ui'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus, Upload, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { RfpWorkspace } from '@/features/rfp/view/RfpWorkspace'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useTrackSearchPerformed } from '@/lib/useTrackSearchPerformed'
// La route est importée pour SA recherche, et elle importe cet écran en retour :
// la boucle est celle de `MissionsPage`, assumée depuis le lien de source du
// 28/08 — c'est le seul moyen d'obtenir une recherche TYPÉE sur cette route-ci.
import { Route } from '@/routes/projects/index'
// Les portes des états vides vivent dans leur propre module (#1332, 1/9) : trois écrans rendent
// EXACTEMENT les mêmes états, et les réécrire chez chacun les ferait diverger.
import { ClearFiltersAction, CreateProjectAction, DiscoverAction } from '../portfolio/view/EmptyStateActions'
import { usePipeline } from '../hooks/usePipeline'
import { useProjects } from '../hooks/useProjects'
import { useArchivedProjects } from '../hooks/useArchivedProjects'
import { staleOf } from '../model/stale-alert'
import { useStageSlaRows } from '@/features/projects/model/use-stage-sla-rows'
import type { StageSlaRow } from '@/features/settings/lib/stage-sla-api'
import { filterByOwner, ownerOptions } from '../model/pipeline-owner-filter'
import type { PipelineFilters } from '../model/pipeline-saved-view'
import { useProjectOwners } from '../hooks/useProjectOwners'
import { useUpdateProjectStage } from '../hooks/useUpdateProjectStage'
import { AffairesTabs } from './AffairesTabs'
import { CreateProjectDialog } from './CreateProjectDialog'
import { SavedPipelineViews } from './SavedPipelineViews'
import { CreateNeedDialog } from '../open-needs/view/CreateNeedDialog'
import { ImportNeedsDialog } from '../open-needs/view/ImportNeedsDialog'
import { ArchivedProjectsList } from './ArchivedProjectsList'
import { LostProjectsList } from './LostProjectsList'
import { BoardSkeleton } from './BoardSkeleton'
import { PipelineBoard } from './PipelineBoard'
import { WonProjectsInPlanning } from './WonProjectsInPlanning'
import { WonMissionDetail } from './WonMissionDetail'
import { PipelineMoreMenu } from './PipelineMoreMenu'
import { activeAndWonCounts } from '../model/pipeline-total'
import { PipelineSummaryLine } from './PipelineSummaryLine'
import {
  DormantProjectsList,
  PipelineExits,
  PipelineFiltersMenu,
  PipelineOwnerFilter,
  PipelinePanel,
  PipelineStateSelect,
  SignalsLead,
  type PipeState,
  type QuickFilter,
} from './PipelineToolbarControls'
import { ProjectColumnsPicker } from './ProjectColumnsPicker'
import { ProjectsTable } from './ProjectsTable'
import { useProjectColumns } from '../model/useProjectColumns'
import { stageResultTarget } from '../model/stage-move-results'
import { ProjectPropertiesContent } from './ProjectPropertiesContent'
import { pipeCardLauraQuestion } from './pipe-card-laura-context'
import { RecordPanel } from '@/features/records/RecordPanel'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { pipeLauraContext } from './pipe-laura-context'
import { PipelineDetectionsLink } from '../pipeline-detections/view/PipelineDetectionsLink'
import { PistesDrawer } from '../pipeline-detections/view/PistesDrawer'
import { guideAnchorProps } from '@/features/guide/guide-anchors'

/**
 * « Affaires › Pipeline » — l'écran du pivot : les affaires que l'équipe a prises en main, en colonnes,
 * avec leurs montants. C'est la vue commerciale.
 *
 * REFONTE THÉO C (23/10/2026, maquette `projects-pipeline`) — l'ordre de la maquette, du haut en bas :
 * l'en-tête de page (titre « Affaires », sa phrase, Importer · Exporter · Nouvelle affaire), le guide de la
 * coque, la barre Pipeline · Besoins · Présentations, la barre d'outils (recherche · Responsable · État ·
 * Filtres · Mes vues · Colonnes · Kanban/Liste), la ligne de résumé, la ligne « Par commercial », le Kanban à
 * cinq colonnes (Gagnée comprise, hors total), puis la ligne « Hors pipe » et ses panneaux.
 *
 * #4197 (L6) — les Pistes vivent dans Signaux (#4340) ; `?lens=rfp` (#4341) monte ICI l'espace des appels
 * d'offres. Le CA probable vit dans Pilotage › Pipe : aucune probabilité sur cet écran (#4016 L1, GA-26).
 */
export function ProjectsPage() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  /**
   * #2195.33 — LE FORMULAIRE DE CRÉATION, OUVERT PAR L'URL : un lien partagé, un rechargement ou un retour
   * arrière rouvrent le même formulaire pré-rempli. **On ne crée jamais une affaire tout seul.**
   */
  const {
    create: createRequested,
    account_id: prefilledAccount,
    mission_id: prefilledMission,
    // #2124.11/#2124.13 — l'étape D'ENTRÉE du formulaire, posée par le dossier de compte.
    create_stage: prefilledStage,
    // #4341 — `?lens=rfp` : l'espace des appels d'offres, monté ici (ex-onglet `/rfp`).
    lens,
    // #4545 — le panneau des pistes du Pipe, ouvert par l'URL comme le formulaire de création.
    pistes: pistesRequested,
  } = Route.useSearch()
  const closePistes = useCallback(() => {
    void navigate({ to: '/projects', search: previous => ({ ...previous, pistes: undefined }), replace: true })
  }, [navigate])
  const closeCreate = useCallback(() => {
    void navigate({
      to: '/projects',
      search: previous => ({
        ...previous,
        create: undefined,
        account_id: undefined,
        mission_id: undefined,
        create_stage: undefined,
      }),
      replace: true,
    })
  }, [navigate])

  /**
   * #2942, #2152.17 — LE BROUILLON DE BESOIN COMPILÉ PAR LAURA, OUVERT PAR L'URL — même patron que
   * `create` : monté au niveau de la page, il ne dépend pas de ce que la lentille affiche (pipe vide,
   * en erreur ou filtré à zéro retournent tôt).
   */
  const {
    create_need: createNeedRequested,
    need_title: needTitleFromLaura,
    need_context: needContextFromLaura,
    need_skills: needSkillsFromLaura,
    need_tjm_cents: needTjmCentsFromLaura,
    // #2942 (recette écran 27/09/2026) — le compte visé, même voyage.
    need_account_id: needAccountIdFromLaura,
    need_account_name: needAccountNameFromLaura,
  } = Route.useSearch()
  const closeCreateNeed = useCallback(() => {
    void navigate({
      to: '/projects',
      search: previous => ({
        ...previous,
        create_need: undefined,
        need_title: undefined,
        need_context: undefined,
        need_skills: undefined,
        need_tjm_cents: undefined,
        need_account_id: undefined,
        need_account_name: undefined,
      }),
      replace: true,
    })
  }, [navigate])

  // #2173.56 — « Importer des fiches de poste », sous « Importer » : le même dialogue que l'écran Besoins (GA-26).
  // #4499 — « Créer un besoin » et « Exporter les besoins » vivent dans l'onglet Besoins (`OpenNeedsPage`).
  const [importNeedsOpen, setImportNeedsOpen] = useState(false)

  const headerActions =
    lens === 'rfp' ? undefined : (
      <PipelineHeaderActions
        onCreateProject={() => void navigate({ to: '/projects', search: prev => ({ ...prev, create: 1 }) })}
        onImportNeeds={() => setImportNeedsOpen(true)}
      />
    )

  // #3822.D (recette prod 08/10) — `min-h-full` et non `h-full` : la réserve de la bulle de Laura se pose
  // après le contenu réel (`CustomerPageContent.tsx`, #3480).
  return (
    <CustomerPage
      anchorId="projets"
      titleInScreen
      pageTitle={t('page.title')}
      contentClassName="flex min-h-full flex-col px-0 py-0"
    >
      <Box className="flex min-h-full w-full flex-1 flex-col">
        <Box {...guideAnchorProps('projets.contenu')} className={`min-w-0 flex-1 space-y-4 pb-6 ${PAGE_GUTTER_X}`}>
          {lens === 'rfp' ? (
            <RfpWorkspace
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/projects">{t('page.backToPipe')}</Link>
                </Button>
              }
            />
          ) : (
            <>
              {/* V22 `.bo11-head` (#4499) — « Affaires », sa phrase, et Importer · Nouvelle affaire SEULEMENT à droite.
                  Le h1 vient du rôle `pageTitle` par `ScreenIntro` (F2-FIX #4332, GA-347). */}
              <ScreenIntro
                title={t('page.title')}
                titleWithoutName={t('page.title')}
                subtitle={t('page.subtitle')}
                action={headerActions}
              />
              <AffairesTabs active="pipeline" />
              {/* #3660 — le lien « Demander à Laura quoi traiter en premier » reste RETIRÉ : Laura est
                  joignable par la bulle. #4545 — les pistes ouvrent le panneau du Pipe (`?pistes=1`), plus Signaux. */}
              <PipelineLens
                onOpenIntake={() =>
                  void navigate({ to: '/projects', search: previous => ({ ...previous, pistes: 1 }) })
                }
              />
            </>
          )}
        </Box>
      </Box>
      <PistesDrawer open={pistesRequested === 1} onOpenChange={next => !next && closePistes()} />
      {createRequested === 1 ? (
        <CreateProjectDialog
          open
          onOpenChange={next => {
            if (!next) closeCreate()
          }}
          accountId={prefilledAccount}
          missionId={prefilledMission}
          stage={prefilledStage}
        />
      ) : null}
      {createNeedRequested === 1 ? (
        <CreateNeedDialog
          open
          onOpenChange={next => {
            if (!next) closeCreateNeed()
          }}
          provenance="model"
          initialTitle={needTitleFromLaura}
          initialContext={needContextFromLaura}
          initialSkills={needSkillsFromLaura}
          initialTjmCents={needTjmCentsFromLaura}
          initialAccountId={needAccountIdFromLaura}
          initialAccountName={needAccountNameFromLaura}
          onCreated={need => {
            void navigate({ to: '/projects/needs/$needId', params: { needId: need.id } })
          }}
        />
      ) : null}
      {importNeedsOpen ? <ImportNeedsDialog open onOpenChange={setImportNeedsOpen} /> : null}
    </CustomerPage>
  )
}

/**
 * Les actions de l'en-tête (V22 `.bo11-head-actions`, #4499) : Importer (le pipe d'un CRM branché — Réglages ›
 * Mémoire collective, #2169.22 — ou des fiches de poste, #2173.56), puis « Nouvelle affaire », le SEUL geste
 * principal. Les exports sont dans le menu « … » de la barre (`PipelineMoreMenu`) ; « Créer un besoin » et
 * « Exporter les besoins » dans l'onglet Besoins.
 */
function PipelineHeaderActions({
  onCreateProject,
  onImportNeeds,
}: {
  onCreateProject: () => void
  onImportNeeds: () => void
}) {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  return (
    <Box display="flex" className="flex-wrap items-center gap-2">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" icon={Upload} className="pointer-coarse:min-h-11">
            {t('pipeTheo.head.import')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64">
          <DropdownMenuItem onSelect={() => void navigate({ to: '/settings/knowledge' })}>
            {t('toolbar.importPipe')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onImportNeeds}>{t('openNeeds.importNeeds.cta')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        size="sm"
        variant="default"
        icon={Plus}
        onClick={onCreateProject}
        className="pointer-coarse:min-h-11"
      >
        {t('toolbar.createProject')}
      </Button>
    </Box>
  )
}

/**
 * FIX-E2E-4393 (#4344) — « Créer un besoin » et « Importer des fiches de poste » sur un pipe VIDE.
 *
 * Le pipe vide retourne avant la barre d'outils : un commercial dont le client n'a jamais été analysé (le cas de
 * #2208.42, sans projet) doit garder une porte VISIBLE vers ses besoins. #4499 — l'en-tête ne porte plus « Créer un
 * besoin » (il vit dans l'onglet Besoins) : l'état vide le reprend donc, lui, à côté de l'import. Mêmes dialogues
 * que l'écran Besoins — jamais un second formulaire (GA-26).
 */
function NeedDoors() {
  const { t } = useTranslation('projects')
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setCreateOpen(true)}>
        {t('openNeeds.createNeed.trigger')}
      </Button>
      <Button type="button" variant="outline" onClick={() => setImportOpen(true)}>
        {t('openNeeds.importNeeds.cta')}
      </Button>
      {createOpen ? (
        <CreateNeedDialog
          open
          onOpenChange={setCreateOpen}
          onCreated={need => {
            setCreateOpen(false)
            void navigate({ to: '/projects/needs/$needId', params: { needId: need.id } })
          }}
        />
      ) : null}
      {importOpen ? <ImportNeedsDialog open onOpenChange={setImportOpen} /> : null}
    </>
  )
}

/** La vue commerciale : le pipe et son détail. */
function PipelineLens({ onOpenIntake }: { onOpenIntake: () => void }) {
  const { t } = useTranslation('projects')
  /**
   * §2.1 — LA BARRE DU COCKPIT ARRIVE ICI : `?stage=` filtre la liste (un lien qui promet un périmètre le
   * tient). `?view=lost` ouvre les perdues.
   */
  const { stage, view: linkedView } = Route.useSearch()
  // ⚠️ Un geste, pas un rendu : `<Navigate>` rejoue en boucle (GA-27).
  const navigate = useNavigate({ from: '/projects/' })
  const { data: summary, isLoading: loadingSummary, isError } = usePipeline()
  // `projectsData` garde la différence entre « aucun projet » et « pas lu » (#1904, non mesuré ≠ 0).
  const { data: projectsData, isLoading: loadingProjects } = useProjects()
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const { data: archivedData } = useArchivedProjects()
  const [selectedId, setSelectedId] = useState<string>()
  const updateStage = useUpdateProjectStage()
  /**
   * #1328 (9/9) — la bascule Kanban | Liste, dans un `useState` : aucun lien distant ne désigne « le pipe en
   * tableau ». Refonte Théo — Perdues / En sommeil / Archivées passent dans « État des affaires ».
   */
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const [pipeState, setPipeState] = useState<PipeState>(linkedView === 'lost' ? 'lost' : 'all')
  // #4337.1 — le choix des colonnes du tableau, tenu à un seul endroit.
  const projectColumns = useProjectColumns()
  /**
   * #1328 / #2170.48-.52 — LES FILTRES RAPIDES : ils s'appliquent aux DEUX vues (un filtre qui ne vaudrait
   * que dans l'une changerait de sens en basculant). Stade = colonnes et `?stage=` ; Compte = la recherche.
   */
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState<ReadonlySet<QuickFilter>>(new Set())
  // #2170.43 — les seuils d'étape de l'espace, partagés par le filtre et le tableau.
  const slaRows = useStageSlaRows()
  // Refonte Théo — « Responsable », multi-sélection. Vide = tous.
  const [ownerIds, setOwnerIds] = useState<string[]>([])
  // ⚠️ `useProjectOwners` et pas `useWorkspaceMembers` : le second JETTE hors d'un `<SessionProvider>`.
  // `members` absent (un double de test ancien) = aucun filtre Responsable, jamais une erreur.
  const { selfId, ownerName, members = NO_MEMBERS } = useProjectOwners()

  const toggleQuick = useCallback((filter: QuickFilter) => {
    setQuick(current => {
      const next = new Set(current)
      if (next.has(filter)) next.delete(filter)
      else next.add(filter)
      return next
    })
  }, [])
  const clearFilters = useCallback(() => {
    setQuery('')
    setQuick(new Set())
    setOwnerIds([])
  }, [])

  const clearStage = useCallback(() => {
    void navigate({ search: prev => ({ ...prev, stage: undefined }) })
  }, [navigate])

  /** Les affaires du pipe (étapes du Kanban), avant tout filtre : la base des compteurs du menu Filtres. */
  const pipelineProjects = useMemo(() => projects.filter(project => isPipelineStage(project.stage)), [projects])

  // UNE seule dérivation du périmètre : le tableau passé au board EST celui qui décide de l'état vide.
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return pipelineProjects.filter(project => {
      /*
       * LES DEUX VUES MONTRENT LA MÊME POPULATION (recette live 03/09/2026) : les étapes du pipe seulement —
       * les détectés sont l'entonnoir, ils ont leur propre porte (Signaux).
       */
      if (stage && project.stage !== stage) return false
      // Refonte Théo — « Affaires ouvertes » sans la Gagnée, « Gagnées » seules.
      if (pipeState === 'open' && project.stage === 'won') return false
      if (pipeState === 'won' && project.stage !== 'won') return false
      if (ownerIds.length > 0 && (project.owner_id === null || !ownerIds.includes(project.owner_id))) return false
      if (!matchesQuick(project, quick, selfId, slaRows)) return false
      if (!needle) return true
      return matchesFlexibleQuery(needle, `${project.label} ${project.company_name ?? ''}`)
    })
  }, [pipelineProjects, stage, pipeState, query, quick, ownerIds, selfId, slaRows])
  // #4193.2 — le même compte de tête que le Kanban : actives seules, gagnées nommées à part.
  const tableCounts = useMemo(() => activeAndWonCounts(visibleProjects), [visibleProjects])
  // #2154.30 — `search_performed` sur `/projects` : la recherche est locale.
  useTrackSearchPerformed('/projects', query, loadingProjects ? undefined : visibleProjects.length, loadingProjects)

  // Ce que chaque filtre rapide ramènerait SEUL sur le pipe (le compteur du menu, Théo `.t-hint`).
  const quickCounts = useMemo(() => {
    const countOf = (filter: QuickFilter) =>
      pipelineProjects.filter(project => matchesQuick(project, new Set([filter]), selfId, slaRows)).length
    return {
      mine: countOf('mine'),
      withoutNextAction: countOf('withoutNextAction'),
      stale: countOf('stale'),
      withoutProfile: countOf('withoutProfile'),
      toSign: countOf('toSign'),
      interviewThisWeek: countOf('interviewThisWeek'),
    } satisfies Record<QuickFilter, number>
  }, [pipelineProjects, selfId, slaRows])

  /** Un filtre LOCAL est-il posé ? La pastille d'une colonne compte alors ce qui est À L'ÉCRAN. */
  const narrowed =
    query.trim().length > 0 || quick.size > 0 || ownerIds.length > 0 || pipeState === 'open' || pipeState === 'won'
  const visibleSummary = useMemo(() => (summary && stage ? narrowToStage(summary, stage) : summary), [summary, stage])

  // #1904 — ce que le pipe déclare à Laura, AVANT les retours anticipés (règle des hooks).
  useLauraContext(
    pipeLauraContext(t, {
      isLoading: loadingSummary || loadingProjects,
      summary: isError || !summary ? null : summary,
      pipelineProjects: projectsData ? projectsData.filter(project => isPipelineStage(project.stage)) : null,
      stageLabel: summary && stage ? stageLabelOf(summary, stage, t) : null,
    }),
  )

  const selected = selectedId ? projects.find(project => project.id === selectedId) : undefined

  if (loadingSummary || loadingProjects) return <BoardSkeleton />
  if (isError || !summary || !visibleSummary) {
    // Pas de porte sur un échec de chargement : « réessaie » n'est pas une destination. #2958.107 — le
    // titre nomme le PIPE.
    return (
      <SearchEmptyState title={t('emptyState.pipelineErrorTitle')} description={t('emptyState.errorDescription')} />
    )
  }
  if (summary.total_count === 0 && summary.intake === 0) {
    // Un pipe réellement vide — testé AVANT le filtre : accuser le filtre d'étape serait faux. #2169.26-.28
    // — trois choix de plus que Découvrir : importer un CRM, créer une affaire, qualifier une piste.
    return (
      <SearchEmptyState
        title={t('emptyState.noProjectTitle')}
        description={t('emptyState.noProjectDescription')}
        action={
          <Box display="flex" className="flex-wrap justify-center gap-2">
            <DiscoverAction />
            <Button asChild size="default" variant="outline">
              <Link to="/settings/knowledge">{t('emptyState.noProjectImportCrm')}</Link>
            </Button>
            <CreateProjectAction />
            <NeedDoors />
            <Button type="button" variant="outline" onClick={onOpenIntake}>
              {t('emptyState.noProjectQualifyLead')}
            </Button>
          </Box>
        }
      />
    )
  }
  if (stage && visibleProjects.length === 0 && quick.size === 0 && !query.trim() && ownerIds.length === 0) {
    // §2.6 — L'ÉTAT VIDE QUI NOMME LE FILTRE BLOQUANT : « aucune affaire » lu comme un total serait faux.
    return (
      <>
        <StageFilterNotice label={stageLabelOf(summary, stage, t)} onRemove={clearStage} />
        <SearchEmptyState
          title={t('stageFilter.emptyTitle')}
          description={t('stageFilter.emptyDescription', { stage: stageLabelOf(summary, stage, t) })}
          action={
            <Button type="button" size="sm" variant="outline" onClick={clearStage}>
              {t('stageFilter.emptyCta')}
            </Button>
          }
        />
      </>
    )
  }

  // Perdues, En sommeil, Archivées : ce n'est pas la liste du pipe, il n'y a rien à exporter (#4295.14).
  const outOfPipe = pipeState === 'lost' || pipeState === 'dormant' || pipeState === 'archived'
  const lostCount = projects.filter(project => project.stage === 'lost').length
  const dormantCount = projects.filter(project => project.stage === 'dormant').length

  return (
    <>
      {/* V22 `.bo11-toolbar` — recherche · Responsable · État · Filtres · Mes vues · (espace) · Colonnes ·
          Kanban/Liste · « … » (les exports, #4499). Au-dessus des deux vues parce qu'elle vaut pour les deux.
          Sous 768 px, la recherche prend la ligne et les contrôles passent à la ligne. */}
      <Box data-testid="pipeline-toolbar" display="flex" className="min-w-0 flex-wrap items-center gap-2">
        <SearchInput
          size="sm"
          value={query}
          onChange={setQuery}
          placeholder={t('toolbar.pipeSearchPlaceholder')}
          className="w-full md:w-60 md:shrink-0"
          // #3377 — l'input suit son wrapper (`lg:w-full` aussi, sinon `tailwind-merge` garde `lg:w-64`).
          inputClassName="w-full lg:w-full"
        />
        <PipelineOwnerFilter members={members} selected={ownerIds} onChange={setOwnerIds} />
        <PipelineStateSelect value={pipeState} onChange={setPipeState} />
        <PipelineFiltersMenu
          options={selfId ? QUICK_FILTERS : QUICK_FILTERS.filter(filter => filter !== 'mine')}
          active={quick}
          counts={quickCounts}
          onToggle={toggleQuick}
          onClear={() => setQuick(new Set())}
        />
        {/* #2170.52 — les vues enregistrées : un nom pour les filtres rapides et la recherche. */}
        <SavedPipelineViews
          draft={{
            q: query,
            mine: quick.has('mine'),
            withoutNextAction: quick.has('withoutNextAction'),
            stale: quick.has('stale'),
            withoutProfile: quick.has('withoutProfile'),
            toSign: quick.has('toSign'),
            interviewThisWeek: quick.has('interviewThisWeek'),
          }}
          onApply={(filters: PipelineFilters) => {
            setQuery(filters.q)
            setQuick(
              new Set(
                QUICK_FILTERS.filter(filter =>
                  filter === 'mine'
                    ? filters.mine
                    : filter === 'interviewThisWeek'
                      ? filters.interviewThisWeek
                      : filters[filter],
                ),
              ),
            )
          }}
        />
        <span className="hidden flex-1 md:block" />
        {/* #4337.1 — « Colonnes » seulement dans la vue qui a des colonnes. */}
        {view === 'table' && !outOfPipe ? (
          <ProjectColumnsPicker
            visible={projectColumns.visible}
            onToggle={projectColumns.toggle}
            onReset={projectColumns.reset}
          />
        ) : null}
        {/* Théo `.bo11-switch` — Kanban / Liste, en pastilles (GA-127 : le second niveau est en pastilles). */}
        {!outOfPipe ? (
          <TabNav
            variant="pill"
            size="sm"
            className="md:shrink-0"
            tabs={[
              { key: 'kanban', label: t('toolbar.viewKanban') },
              { key: 'table', label: t('toolbar.viewTable') },
            ]}
            activeTab={view}
            onTabChange={tab => setView(tab === 'table' ? 'table' : 'kanban')}
          />
        ) : null}
        {/* #4499 — Exporter · Exporter pour un partenaire, dans un menu discret (ils quittent l'en-tête). */}
        <PipelineMoreMenu
          projects={outOfPipe ? null : visibleProjects}
          columns={projectColumns.visible}
          ownerName={ownerName}
        />
      </Box>
      {stage ? <StageFilterNotice label={stageLabelOf(summary, stage, t)} onRemove={clearStage} /> : null}
      {pipeState === 'archived' ? (
        <PipelinePanel state="archived" onBack={() => setPipeState('all')}>
          <ArchivedProjectsList />
        </PipelinePanel>
      ) : pipeState === 'lost' ? (
        <PipelinePanel state="lost" onBack={() => setPipeState('all')}>
          <LostProjectsList projects={projects} />
        </PipelinePanel>
      ) : pipeState === 'dormant' ? (
        <PipelinePanel state="dormant" onBack={() => setPipeState('all')}>
          <DormantProjectsList projects={projects} />
        </PipelinePanel>
      ) : visibleProjects.length === 0 && narrowed ? (
        // Un état vide QUI NOMME SON FILTRE, et dont la sortie lève vraiment tous les filtres.
        <SearchEmptyState
          title={t('emptyState.filteredTitle')}
          description={t('emptyState.filteredDescription')}
          action={
            <ClearFiltersAction
              onClear={() => {
                clearFilters()
                setPipeState('all')
              }}
            />
          }
        />
      ) : view === 'table' ? (
        <Box className="space-y-4">
          <PipelineSummaryLine
            summary={visibleSummary}
            count={tableCounts.active}
            wonCount={tableCounts.won}
            extra={<SummaryExtra />}
          />
          <ProjectsTable
            projects={visibleProjects}
            selectedId={selectedId}
            onSelect={(project: ProjectRow) => setSelectedId(project.id)}
            ownerName={ownerName}
            columns={projectColumns.visible}
            slaRows={slaRows}
          />
        </Box>
      ) : (
        <PipelineBoard
          summary={visibleSummary}
          projects={visibleProjects}
          narrowed={narrowed}
          selectedId={selectedId}
          onSelect={(project: ProjectRow) => setSelectedId(project.id)}
          onAdd={() => void navigate({ search: prev => ({ ...prev, create: 1 }) })}
          summaryExtra={<SummaryExtra />}
          projectsWithMission={new Set(projects.filter(item => item.has_mission).map(item => item.id))}
          ownerName={ownerName}
          onMove={(project, target, { reason, accepted, lossReasonCode }) =>
            updateStage.mutate(
              { id: project.id, stage: target, lossReason: reason, lossReasonCode, acceptedActions: accepted },
              {
                // Ce que le serveur a FAIT, et ce qui reste à faire soi-même (#4339.2 : chaque proposition
                // cochée a un résultat VISIBLE).
                onSuccess: ({ actions }) => {
                  const created = actions.created ?? []
                  const withResult = new Set(created.map(result => result.key))
                  for (const key of actions.performed)
                    if (!withResult.has(key)) toast.success(t(`stageMove.done.${key}`))
                  for (const result of created) {
                    const target = stageResultTarget(result)
                    toast.success(
                      t(`stageMove.result.${result.kind}`, { action: t(`stageMove.proposal.${result.key}`) }),
                      {
                        action: target
                          ? {
                              label: t(
                                `stageMove.result.open${result.kind === 'task' ? 'Task' : result.kind === 'draft' ? 'Draft' : 'Matching'}`,
                              ),
                              onClick: () =>
                                target.kind === 'url'
                                  ? window.open(target.href, '_blank', 'noopener,noreferrer')
                                  : void navigate(
                                      target.to === '/actions'
                                        ? { to: '/actions' }
                                        : { to: target.to, params: target.params, search: { tab: 'synthese' } },
                                    ),
                            }
                          : undefined,
                      },
                    )
                  }
                  if (actions.pending.length > 0) {
                    toast.info(t('stageMove.pending', { count: actions.pending.length }))
                  }
                  for (const failure of actions.failed) {
                    if (failure.key === 'create_mission' || failure.key === 'park_account') {
                      toast.error(t(`stageMove.failed.${failure.key}`))
                    } else {
                      toast.error(
                        `${t('stageMove.failedAction', { action: t(`stageMove.proposal.${failure.key}`) })} — ${t(`stageMove.failedReason.${failure.reason}`, { defaultValue: t('stageMove.failedReason.failed') })}`,
                      )
                    }
                  }
                },
                onError: (error: Error) => toast.error(error.message),
              },
            )
          }
        />
      )}
      {/* #4291.8 — revient sur #4291.8 (Louis 02/11) : le gagné a quitté le Kanban et se suit dans /planning. */}
      {view === 'kanban' && !outOfPipe && pipeState !== 'open' ? (
        <WonProjectsInPlanning projects={visibleProjects} />
      ) : null}
      {/* Théo `.c2-exits` — ce qui est sorti du pipe, et la porte de chacun. */}
      {!outOfPipe ? (
        <PipelineExits
          lost={lostCount}
          dormant={dormantCount}
          archived={archivedData ? archivedData.length : null}
          onOpen={setPipeState}
        />
      ) : null}
      {/* #4194 (L3) — le panneau latéral UNIQUE : propriétés, historique, objets liés, un seul bouton Laura. */}
      <RecordPanel
        target={selected ? { kind: 'opportunity', id: selected.id } : null}
        onClose={() => setSelectedId(undefined)}
        propertiesContent={
          selected ? (
            // #4291.8 — un projet GAGNÉ s'ouvre sur SON suivi de mission, au-dessus des gestes de la fiche (qui restent
            // atteignables) ; le geste « Créer / ouvrir la mission » n'y figure qu'une fois, dans le suivi.
            selected.stage === 'won' ? (
              <>
                <WonMissionDetail project={selected} />
                <ProjectPropertiesContent project={selected} omitMissionGesture slaRows={slaRows} />
              </>
            ) : (
              <ProjectPropertiesContent project={selected} slaRows={slaRows} />
            )
          ) : undefined
        }
        lauraQuestion={
          selected
            ? pipeCardLauraQuestion(t, {
                label: selected.label,
                primaryNeedTitle: selected.primary_need_title,
                positionedCount: selected.positioned_count,
                interviewCount: selected.interview_count,
                // #2170.53 — le compte, et l'immobilité au seuil d'étape de l'espace (#2170.43).
                accountName: selected.company_name,
                staleDays: staleOf(selected, Date.now(), slaRows)?.days ?? null,
              })
            : undefined
        }
      />
    </>
  )
}

const QUICK_FILTERS: readonly QuickFilter[] = [
  'mine',
  'withoutNextAction',
  'stale',
  'withoutProfile',
  'toSign',
  'interviewThisWeek',
]

/**
 * Une affaire passe-t-elle les filtres rapides cochés ? UNE définition par filtre, partagée par la liste
 * et par les compteurs du menu (deux chemins qui refont la même dérivation divergent).
 *
 * ⚠️ `undefined` (API antérieure au déploiement) ne compte jamais comme un manque : seul un fait AFFIRMÉ
 * filtre (`next_action === null`, `positioned_count === 0`, `interview_this_week === true`).
 */
function matchesQuick(
  project: ProjectRow,
  quick: ReadonlySet<QuickFilter>,
  selfId: string | null,
  slaRows?: readonly StageSlaRow[],
): boolean {
  if (quick.has('withoutNextAction') && project.next_action !== null) return false
  if (quick.has('mine') && (selfId === null || project.owner_id !== selfId)) return false
  // #2170.48 — même seuil que la carte (`staleOf`) : un projet muet n'est jamais vieillissant.
  // #2170.43 — au seuil RÉGLÉ par l'espace pour l'étape (Règles → Pipe), pas à 7 j figés.
  if (quick.has('stale') && staleOf(project, Date.now(), slaRows) === null) return false
  if (quick.has('withoutProfile') && project.positioned_count !== 0) return false
  // #2170.51 — « à signer » : la dernière étape du pipe avant « gagné ».
  if (quick.has('toSign') && project.stage !== 'negotiation') return false
  if (quick.has('interviewThisWeek') && project.interview_this_week !== true) return false
  return true
}

/**
 * Le pipe RESSERRÉ sur une étape — les vrais chiffres de la colonne, jamais des
 * chiffres fabriqués.
 *
 * Les trois totaux sont RECOPIÉS de la colonne, pas recalculés : le serveur les
 * dérive de ses lignes, et un quatrième chemin de calcul finirait par diverger
 * (c'est la raison d'être de `pipeline-total.ts`). Une colonne absente du résumé
 * — une étape que ce pipe ne rend pas — donne une vue sans colonne : l'état vide
 * du dessus la NOMME plutôt que de laisser un tableau muet.
 *
 * ⚠️ `intake` et `signals` tombent à zéro, et c'est VRAI, pas une absence
 * maquillée. Les deux comptent ce qui n'est DANS AUCUNE étape du pipe —
 * `detected`, `potential`, et les signaux comptés à part. L'intersection avec
 * une étape du pipe est vide par construction, pas par ignorance. Les deux
 * boutons disparaissent donc au lieu d'annoncer un entonnoir que la vue ne
 * montre pas.
 */
function narrowToStage(summary: PipelineSummary, stage: PipelineStage): PipelineSummary {
  const column = summary.columns.find(item => item.stage === stage)
  // ⚠️ Pas de `?? 0` sur les trois totaux, et la distinction n'est pas
  // cosmétique : ici, zéro n'est pas une valeur manquante repliée — c'est la
  // mesure d'un ENSEMBLE VIDE, et la somme d'un ensemble vide vaut bien zéro.
  // Le cas est donc écrit en toutes lettres au lieu d'être caché derrière un
  // opérateur qui, ailleurs dans ce dépôt, transforme une absence en « 0 € ».
  const EMPTY = {
    total_count: 0,
    total_amount_cents: 0,
    total_without_amount: 0,
    signed_count: 0,
    signed_amount_cents: 0,
    signed_without_amount: 0,
  }
  if (!column) return { ...summary, columns: [], ...EMPTY, intake: 0, signals: 0 }
  // ⚠️ Le filtre garde la SÉPARATION des deux statuts. Recopier la colonne dans
  // `total_*` sans regarder son étape remettrait le signé dans le total du
  // pipe — par la petite porte du filtre, exactement ce que la correction du
  // 29/08 vient de fermer côté serveur.
  const measured = { count: column.count, amount_cents: column.amount_cents, without_amount: column.without_amount }
  return {
    ...summary,
    columns: [column],
    ...EMPTY,
    ...(stage === 'won'
      ? {
          signed_count: measured.count,
          signed_amount_cents: measured.amount_cents,
          signed_without_amount: measured.without_amount,
        }
      : {
          total_count: measured.count,
          total_amount_cents: measured.amount_cents,
          total_without_amount: measured.without_amount,
        }),
    intake: 0,
    signals: 0,
  }
}

/**
 * Le nom de l'étape filtrée — celui de L'ESPACE d'abord.
 *
 * `column.label` est renommable par l'espace, et c'est le mot que le tableau
 * affiche à trente pixels de là : le recopier depuis le lexique ferait dire deux
 * noms à la même colonne. Le libellé canonique (`stage.states.*`) ne sert que si
 * le résumé ne porte pas la colonne — un lien collé sur une étape que ce pipe ne
 * rend pas. Un identifiant brut ne s'affiche jamais : personne ne reconnaît
 * « profiles_submitted » à l'écran.
 */
function stageLabelOf(
  summary: PipelineSummary,
  stage: PipelineStage,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  return summary.columns.find(item => item.stage === stage)?.label ?? t(`stage.states.${stage}`)
}

/**
 * §2.6 — UN ÉCRAN FILTRÉ LE DIT, ET LE FILTRE SE LÈVE.
 *
 * Un pipe resserré et MUET est le piège symétrique du lien non filtré : il fait
 * croire que l'espace n'a que ces affaires-là. « 3 projets » lu comme un total
 * est aussi faux que le pipe entier lu comme le périmètre d'une étape.
 *
 * D'où trois choses ensemble : l'étape filtrée est NOMMÉE, la restriction est
 * dite en toutes lettres, et elle se retire d'un bouton — tabulable (GA-35),
 * nommé (GA-32) et agrandi au doigt (GA-30, `Button` ne porte pas la règle des
 * 44 px lui-même : chaque appelant la pose).
 */
function StageFilterNotice({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation('projects')
  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      role="status"
    >
      <Badge variant="secondary">{t('stageFilter.badge', { stage: label })}</Badge>
      <Text element="span" size="sm" color="text-muted-foreground">
        {t('stageFilter.hint')}
      </Text>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        aria-label={t('stageFilter.remove')}
        className="ml-auto pointer-coarse:min-h-11"
      >
        <X className="size-4" aria-hidden="true" />
        <Text element="span" size="sm">
          {t('stageFilter.removeShort')}
        </Text>
      </Button>
    </Box>
  )
}

const NO_MEMBERS: ReadonlyArray<{ id: string; name: string }> = []

/**
 * Le bout de la ligne de résumé (Théo `.bo11-summary`) : « Les signaux restent dans Signaux », puis la ligne-lien
 * des pistes repérées (#4191 D3), le seul endroit où ce compteur s'affiche (GA-26).
 */
function SummaryExtra() {
  return (
    <>
      <SignalsLead />
      <PipelineDetectionsLink />
    </>
  )
}
