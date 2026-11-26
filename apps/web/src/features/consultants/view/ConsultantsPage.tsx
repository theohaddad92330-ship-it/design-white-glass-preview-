import { Badge, Button, Card, cn, SelectField, TabNav, Text } from '@bellum/ui'
import { Download, Plus, Users } from 'lucide-react'
import { Trans } from 'react-i18next'
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { RecordPanel } from '@/features/records/RecordPanel'
import { useTranslation } from 'react-i18next'
import { Route } from '@/routes/consultants/index'
import { toast } from 'sonner'
import {
  TALENT_BULK_MAX,
  type Consultant,
  type InverseMatch,
  type TalentRow,
  type TalentSearchQuery,
  type TalentView,
} from '@bellum/contracts'
import { matchingApi } from '@/features/matching/api'
import { TransparencyBanner } from '@/features/matching/view/TransparencyBanner'
import { useDebounce } from '@/hooks/useDebounce'
import { useOpenNeeds } from '@/features/projects/open-needs/hooks/useOpenNeeds'
import { Link, useNavigate } from '@tanstack/react-router'
import { CustomerPage } from '@/components/page/CustomerPage'
import { useTrackSearchPerformed } from '@/lib/useTrackSearchPerformed'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { VivierIntro } from './VivierIntro'
import { VivierTable } from './VivierTable'
import { VivierImportMenu } from './VivierIoMenus'
import { RecruitmentStages } from '../recruitment/RecruitmentPage'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { TALENTS_TABS, talentsTabFromHash, type TalentsTab } from './talentsTabs'
import {
  useArchiveTalentsBulk,
  useConsultant,
  useCreateConsultant,
  useDeleteConsultant,
  useEraseTalents,
  useSetTalentFavorite,
  useTalentSearch,
  useUpdateConsultant,
} from '../hooks'
import { toUpsert, type ConsultantFormState } from '../lib/consultantForm'
import { talentEmptyStateAction, type NarrowingFilterAxis } from '../lib/talentEmptyState'
import { generateTalentCSV } from '../lib/talentExport'
import { talentNameText } from '../lib/talentName'
import { TALENT_DEFAULT_PAGE_SIZE, TALENT_PAGE_SIZE_OPTIONS, talentPaginationRange } from '../lib/talentPagination'
import { toggleAllSelection, toggleOneSelection } from '../lib/talentSelection'
import { BulkArchiveReport } from './BulkArchiveReport'
import { ConsultantFormDialog } from './ConsultantFormDialog'
import { VivierAddDialog } from './VivierAddDialog'
import { ConsultantMatchSection } from './ConsultantMatchSection'
import { MissingExpertiseLink } from './MissingExpertiseLink'
import { TalentDeleteDialog } from './TalentDeleteDialog'
import { TalentEraseDialog } from './TalentEraseDialog'
import { TalentFilters } from './TalentFilters'
import { TalentSelectionBar } from './TalentSelectionBar'
import { TalentSkillsDialog } from './TalentSkillsDialog'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { vivierLauraContext } from './vivier-laura-context'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { guideAnchorProps } from '@/features/guide/guide-anchors'
import { useDataExit } from '@/lib/data-exit'
import { downloadCSV } from '@/lib/export-csv'
import { trackedMutation } from '@/lib/product-tracker'

/**
 * Vivier de talents (annexe méthodo p22, PDF 3 §6).
 *
 * Deux corrections de fond par rapport à la première version :
 *
 *  - la liste passe par la recherche PAGINÉE (`GET /talents`), qui existait
 *    depuis la tranche T5 sans qu'aucun code web ne l'appelle. L'écran
 *    chargeait tout le vivier d'un coup, sans filtre : illisible dès quelques
 *    dizaines de profils ;
 *  - la disponibilité affichée est celle qui se DÉDUIT des affectations. Le
 *    champ déclaratif reste montré à côté quand il dit autre chose — « un
 *    vivier qui propose des gens occupés est pire qu'un vivier vide ».
 */
export function ConsultantsPage() {
  const { t } = useTranslation('consultants')
  const navigate = useNavigate()
  // Refonte Théo — l'ONGLET vit dans l'ancre : `#recrutement` ouvre Recrutement, toute autre ancre le Vivier.
  const [tab, setTab] = useState<TalentsTab>(() => talentsTabFromHash())
  const selectTab = (next: TalentsTab) => {
    setTab(next)
    if (typeof window === 'undefined') return
    const url = `${window.location.pathname}${window.location.search}${next === 'vivier' ? '' : `#${next}`}`
    window.history.replaceState(window.history.state, '', url)
  }
  // Refonte Théo — la bascule « Liste · Cartes » (maquette `.bo11-switch`) :
  // un réglage d'écran, jamais persisté.
  const [layout, setLayout] = useState<'list' | 'cards'>('list')
  // `?q=` — l'amorce venue du lanceur. `useState` la prend au PREMIER rendu
  // seulement : arriver avec `?q=Java` remplit la recherche, et l'effacer
  // ensuite ne la fait pas revenir. Le lanceur borne déjà à 200 caractères,
  // exactement la borne de `talentSearchQuerySchema.q` — au-delà l'API
  // refuserait la requête entière.
  // #2183.52 — même amorce que `q` : posée au montage, jamais resynchronisée.
  // #2075.27/.28 — `availability` : même patron, amorce du choix « consultant
  // à positionner » posé après validation de l'audit (ValidateContextStatus.tsx).
  // #1952.4 (épopée #2844) — `importCv` : le lien que Laura propose depuis la conversation quand
  // elle ne peut pas transporter les fichiers elle-même ; une amorce, comme `new`, posée au montage.
  const {
    q: seededQuery,
    new: openCreation,
    name: seededName,
    reviewStatus: seededReviewStatus,
    availability: seededAvailability,
    matchProjectId: seededMatchProjectId,
    importCv: seededImportCv,
  } = Route.useSearch()
  const [filters, setFilters] = useState<Partial<TalentSearchQuery>>({
    skills: [],
    ...(seededQuery?.trim() ? { q: seededQuery.trim() } : {}),
    ...(seededReviewStatus ? { reviewStatus: seededReviewStatus } : {}),
    ...(seededAvailability ? { availability: seededAvailability } : {}),
  })
  const [activeView, setActiveView] = useState<TalentView | null>(null)
  const [page, setPage] = useState(1)
  // « Afficher N » (maquette : 20 par défaut) — un réglage d'ÉCRAN, pas un
  // filtre : le changer ramène à la page 1 pour la même raison qu'un filtre.
  const [pageSize, setPageSize] = useState<number>(TALENT_DEFAULT_PAGE_SIZE)
  // Golden journey 3 (#2208.34) — l'amorce n'est lue qu'au PREMIER rendu, or le
  // CTA « Traiter les N exceptions » d'un import vit DANS cette page : il change
  // l'URL d'un écran déjà monté. Sans cette resynchronisation, l'URL disait
  // `reviewStatus=needs_review` et la liste montrait tout le vivier. Elle ne
  // joue qu'à un CHANGEMENT d'amorce — jamais au montage (déjà amorcé ci-dessus),
  // et un filtre posé à la main n'est pas écrasé tant que l'URL ne bouge pas.
  const seededOnce = useRef(false)
  useEffect(() => {
    if (!seededOnce.current) {
      seededOnce.current = true
      return
    }
    setFilters(previous => ({
      ...previous,
      q: seededQuery?.trim() ? seededQuery.trim() : undefined,
      reviewStatus: seededReviewStatus,
      availability: seededAvailability,
    }))
    setPage(1)
  }, [seededQuery, seededReviewStatus, seededAvailability])
  // #3830 — un texte tapé (nom, compétence) s'applique SANS Entrée, mais après
  // ~300 ms de pause : une requête par frappe martelait l'API et faisait
  // clignoter la liste. Les autres filtres (cases, listes) restent immédiats.
  const [debouncedQ] = useDebounce(filters.q, 300)
  const [debouncedSkills] = useDebounce(filters.skills, 300)
  const query = useMemo(
    () => ({ ...filters, q: debouncedQ, skills: debouncedSkills, page, limit: pageSize }),
    [filters, debouncedQ, debouncedSkills, page, pageSize],
  )
  const { data, isLoading, isError, refetch } = useTalentSearch(query)
  // #2154.30 — `search_performed` sur `/consultants` : le total SERVEUR, jamais le texte tapé.
  useTrackSearchPerformed('/consultants', debouncedQ ?? '', data?.total, isLoading)

  // Toute modification de filtre ramène à la première page : garder la page 7
  // en changeant de critère affiche une liste vide qui se lit « aucun
  // résultat », alors qu'il y en a — sur la page 1.
  const patchFilters = (patch: Partial<TalentSearchQuery>) => {
    setFilters(previous => ({ ...previous, ...patch }))
    setPage(1)
  }

  const create = useCreateConsultant()
  const update = useUpdateConsultant()
  const remove = useDeleteConsultant()
  const archiveBulk = useArchiveTalentsBulk()
  const eraseBulk = useEraseTalents()
  const setFavorite = useSetTalentFavorite()
  const isDemo = useIsDemo()
  const [erasing, setErasing] = useState(false)
  // #2662.1 — sur les lignes CHARGÉES (cette page) : jamais un total serveur
  // que l'écran n'a pas sous les yeux.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set())
  // #4191 G5 — le compte rendu de l'archivage en lot : archivées, et refusées NOMMÉES.
  const [archiveReport, setArchiveReport] = useState<Omit<
    ComponentProps<typeof BulkArchiveReport>,
    'onDismiss'
  > | null>(null)
  // #2662.3 — l'export CSV est une SORTIE de données (décision Louis
  // 19/09/2026, #2081.14) : masqué quand la règle d'espace le réserve.
  const dataExit = useDataExit()

  // `?new=1` ouvre le formulaire au premier rendu — la troisième porte
  // (BEL-BO-003), venue d'un besoin qu'on ne peut pas matcher faute de vivier.
  // Une AMORCE, comme `?q=` : fermer le dialogue ne le rouvre pas.
  const [dialogOpen, setDialogOpen] = useState(openCreation === true)
  const [editingId, setEditingId] = useState<string | null>(null)
  // L'AFFAIRE sélectionnée pour le classement, pas le besoin : c'est ce que
  // `GET /consultants/match/:id` relit, et la valeur des options du `<select>`
  // du panneau. Le nom disait « need » et la valeur était une affaire — c'est
  // ce faux ami qui a fait passer un id de besoin depuis le rail.
  // Épopée #2872 (#2367.6) — `?matchProjectId=` la présélectionne quand Laura
  // reconnaît l'intention « pousser un profil » : une amorce, comme `?new=`.
  const [matchProjectId, setMatchProjectId] = useState<string | null>(seededMatchProjectId ?? null)
  /** #2500 (17/09/2026) — « replier par défaut le matching personnalisé » :
   *  le panneau prenait 384 px en PERMANENCE à côté du tableau (`aside
   *  xl:w-96`), qu'il y ait ou non un besoin à matcher — `ConsultantMatchPanel`
   *  rend toujours sa carte, même sans sélection. Repli à l'arrivée, jamais
   *  persisté (même patron que le rail de recherche de Découvrir, #1796.1,
   *  `CollapsedSection.defaultOpen`) ; l'état est levé ICI pour que l'aside
   *  rétrécisse aussi tant que c'est fermé, et rende la largeur au tableau. */
  const [matchPanelOpen, setMatchPanelOpen] = useState(false)
  // La fiche qui vient de naître, et le geste qu'elle appelle (§3.4).
  const [justCreated, setJustCreated] = useState<{ id: string; name: string } | null>(null)
  const [skillsFor, setSkillsFor] = useState<TalentRow | undefined>(undefined)
  // #4194 (L3) — le panneau latéral unique, ouvert sur un consultant du vivier.
  const [panelConsultantId, setPanelConsultantId] = useState<string>()
  const [deleting, setDeleting] = useState<TalentRow | undefined>(undefined)

  // La fiche complète n'est chargée qu'à l'ouverture du formulaire : la ligne
  // de liste ne porte que ce qu'elle affiche.
  const { data: editing } = useConsultant(editingId ?? undefined)

  const openAdd = () => {
    setEditingId(null)
    setDialogOpen(true)
  }
  const openEdit = (row: TalentRow) => {
    setEditingId(row.id)
    setDialogOpen(true)
  }

  // Les droits viennent du DIALOGUE, qui sait ce qu'il a montré : masquer les
  // montants puis les envoyer à `null` les EFFACERAIT côté serveur.
  const submit = (form: ConsultantFormState, rights: { finance?: boolean }, options: { match?: boolean } = {}) => {
    const input = toUpsert(form, rights)
    const wasCreation = !editingId
    const tracked = trackedMutation(editingId ? 'consultant_updated' : 'consultant_created', '/consultants')
    const action = editingId ? update.mutateAsync({ id: editingId, input }) : create.mutateAsync(input)
    action
      .then(saved => {
        tracked.onSuccess()
        toast.success(editingId ? t('toast.updated') : t('toast.created'))
        setDialogOpen(false)
        setEditingId(null)
        // Le geste qui suit ne concerne qu'une fiche NEUVE : proposer un
        // rapprochement après avoir corrigé un numéro de téléphone serait du
        // bruit, et le bruit se ferme sans être lu.
        // Théo C talents-vivier.R6 — « Enregistrer et rapprocher » enchaîne sur le rapprochement de la fiche créée.
        if (wasCreation && options.match) {
          navigate({ to: '/consultants/$id/reverse-market', params: { id: saved.id } })
        } else if (wasCreation) {
          setJustCreated({ id: saved.id, name: talentNameText(saved.full_name, t('name.unnamed')) })
        }
      })
      .catch(() => {
        tracked.onError()
        toast.error(t('toast.error'))
      })
  }

  const confirmDelete = () => {
    if (!deleting) return
    remove
      .mutateAsync(deleting.id)
      .then(() => {
        toast.success(t('toast.deleted'))
        setDeleting(undefined)
      })
      // Le message du serveur porte la RAISON (une affectation en cours) — le
      // remplacer par « une erreur est survenue » ferait recliquer.
      .catch((error: Error) => toast.error(error.message || t('toast.error')))
  }

  const hasQuery = Object.values(filters).some(value =>
    Array.isArray(value) ? value.length > 0 : value !== undefined && value !== '',
  )
  // #3488 — « vivier vide » ne se dit que si les ARCHIVÉS sont vides aussi :
  // les positionnements et les besoins nomment des talents archivés, et
  // l'écran contredisait ses voisins. Une seule fiche de contrôle, lue
  // seulement quand le vivier actif est vide et qu'aucun filtre n'est posé.
  const activeUnfiltered = !isLoading && data !== undefined && !hasQuery
  const activeEmptyUnfiltered = activeUnfiltered && data?.total === 0
  // #3488 (recette Y20) — la même sonde sert quand le vivier actif n'est PAS vide :
  // « Vivier = 1 profil » (un candidat sans nom) au-dessus de Positionnements qui
  // en nomme 9, c'est que ces 9 sont archivés. La ligne le dit au lieu de laisser
  // deux écrans se contredire.
  const { data: archivedProbe } = useTalentSearch(
    { page: 1, limit: 1, skills: [], includeArchived: true },
    { enabled: activeUnfiltered },
  )
  const archivedCount = activeEmptyUnfiltered && archivedProbe ? archivedProbe.total : null
  const hasArchivedOnly = archivedCount !== null && archivedCount > 0
  const archivedHiddenCount =
    activeUnfiltered && data && !activeEmptyUnfiltered && archivedProbe
      ? Math.max(0, archivedProbe.total - data.total)
      : 0
  const list = data?.items ?? []
  const total = data?.total ?? 0
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  // #2662.1 — un changement de page ou de filtre change les lignes CHARGÉES :
  // une sélection posée sur la page 1 n'a plus de sens sur la page 2, et
  // cocher « tout » puis filtrer garderait des ids qui ne sont plus à
  // l'écran — la case d'en-tête mentirait alors sur ce qu'elle promet.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [query])

  const toggleAllSelected = (selected: boolean) => {
    setSelectedIds(
      toggleAllSelection(
        list.map(row => row.id),
        selected,
      ),
    )
  }
  const toggleRowSelected = (id: string, selected: boolean) => {
    setSelectedIds(current => toggleOneSelection(current, id, selected))
  }
  const clearSelection = () => setSelectedIds(new Set())

  // #3781 — « Sélectionner les N profils » : la case d'en-tête ne couvre que la page.
  // Si le résultat tient dans une page de 500 (`TALENT_BULK_MAX`), on l'affiche d'un trait
  // (le changement de taille vide la sélection, d'où le drapeau qui reprend à l'arrivée des lignes).
  const [selectAllOnLoad, setSelectAllOnLoad] = useState(false)
  useEffect(() => {
    // Les lignes de l'ANCIENNE page peuvent rester affichées le temps du rechargement : on n'agit que sur la page entière.
    if (!selectAllOnLoad || isLoading || list.length === 0 || list.length < Math.min(total, TALENT_BULK_MAX)) return
    setSelectAllOnLoad(false)
    setSelectedIds(new Set(list.map(row => row.id)))
  }, [selectAllOnLoad, isLoading, list, total])
  const selectEverything = () => {
    if (list.length >= Math.min(total, TALENT_BULK_MAX)) {
      setSelectedIds(new Set(list.map(row => row.id)))
      return
    }
    setSelectAllOnLoad(true)
    setPageSize(TALENT_BULK_MAX)
    setPage(1)
  }

  // #2662.2 — « nettoyer mon vivier » : archive TOUTE la sélection en un
  // geste, jamais une suppression (décision Louis 21/09/2026). Un résultat
  // PAR PROFIL : combien archivés, et chaque refusé NOMMÉ avec sa raison (#4191 G5,
  // archivage partiel — une ligne refusée ne fait plus échouer toute la sélection).
  const archiveIds = (ids: readonly string[]) => {
    if (ids.length === 0) return
    const nameOf = new Map(list.map(row => [row.id, row.fullName]))
    archiveBulk
      .mutateAsync({ ids, reason: null })
      .then(result => {
        clearSelection()
        setArchiveReport({
          archivedCount: result.archived.length,
          refused: result.refused.map(entry => ({
            // Une fiche qui n'est pas dans la liste affichée est DITE telle, jamais « sans nom ».
            name: nameOf.has(entry.id) ? (nameOf.get(entry.id) ?? null) : t('selection.refused.offScreen'),
            reason: entry.reason,
            endsOn: entry.ends_on,
          })),
        })
      })
      .catch(() => toast.error(t('selection.archiveFailed')))
  }
  const archiveSelection = () => archiveIds([...selectedIds])

  // #3781 — « supprimer définitivement » : l'effacement RGPD de la sélection,
  // après une confirmation explicite. Un résultat PAR PROFIL, comme l'archivage :
  // ce qui est parti, ce qui est resté et pourquoi — jamais « tout s'est bien
  // passé » sur une fiche refusée (affectation en cours, droit manquant).
  const eraseSelection = () => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    eraseBulk
      .mutateAsync(ids)
      .then(result => {
        clearSelection()
        setErasing(false)
        if (result.skipped.length === 0) {
          toast.success(t('erase.done', { count: result.erased.length }))
          return
        }
        // La RAISON, par motif : « 3 gardées : une affectation court encore ».
        const reasons = [...new Set(result.skipped.map(entry => entry.reason))]
          .map(reason => t(`erase.reasons.${reason}`))
          .join(' ')
        toast.warning(
          t('erase.doneWithSkipped', { erased: result.erased.length, skipped: result.skipped.length, reasons }),
        )
      })
      .catch((error: Error) => {
        setErasing(false)
        toast.error(error.message || t('erase.failed'))
      })
  }

  // #2662.3 — exporte la sélection EN CSV, avec exactement ce que l'écran
  // affiche déjà : les mêmes lignes chargées, jamais une seconde requête qui
  // pourrait rendre un jeu de données différent de ce qui est coché.
  const exportSelection = () => {
    if (!dataExit.grant) return
    const selectedRows = list.filter(row => selectedIds.has(row.id))
    if (selectedRows.length === 0) return
    const csv = generateTalentCSV(selectedRows)
    downloadCSV(csv, `vivier-selection-${new Date().toISOString().slice(0, 10)}.csv`, dataExit.grant)
  }

  /**
   * Les axes de restriction posés — pour NOMMER celui qui bloque quand la
   * liste est vide (manque A du 30/08), même esprit qu'`emptyListAction` côté
   * comptes. Un axe par GESTE d'écran : les six champs qu'une vue remplit
   * (`talentViewFilters`) n'ont ici AUCUNE autre origine que le clic sur cette
   * vue — les regrouper sous un seul axe reflète ce qu'un recruteur a
   * réellement posé, un clic, pas six critères.
   */
  const narrowingAxes = useMemo<NarrowingFilterAxis[]>(() => {
    const axes: NarrowingFilterAxis[] = []
    if (filters.q) axes.push({ id: 'q', value: `${t('search.label')} : ${filters.q}` })
    if (filters.skills?.length) {
      axes.push({ id: 'skills', value: `${t('filters.skills')} : ${(filters.skills ?? []).join(', ')}` })
    }
    if (filters.maxTjm !== undefined) axes.push({ id: 'maxTjm', value: `${t('filters.maxTjm')} : ${filters.maxTjm}` })
    if (filters.minTjm !== undefined) axes.push({ id: 'minTjm', value: `${t('filters.minTjm')} : ${filters.minTjm}` })
    if (filters.zone) {
      const radius =
        filters.radiusKm !== undefined ? ` (${t('filters.drawer.radiusOption', { km: filters.radiusKm })})` : ''
      axes.push({ id: 'zone', value: `${t('filters.zone')} : ${filters.zone}${radius}` })
    }
    if (filters.minYearsExperience !== undefined) {
      axes.push({
        id: 'minYearsExperience',
        value: t('filters.drawer.yearsExperienceOption', { count: filters.minYearsExperience }),
      })
    }
    if (filters.sector) axes.push({ id: 'sector', value: `${t('filters.sector')} : ${filters.sector}` })
    if (filters.language) axes.push({ id: 'language', value: `${t('filters.drawer.language')} : ${filters.language}` })
    if (filters.cvAvailable) axes.push({ id: 'cvAvailable', value: t('filters.drawer.cvAvailable') })
    if (filters.favorite) axes.push({ id: 'favorite', value: t('filters.drawer.favorites') })
    if (filters.onMission) {
      axes.push({ id: 'onMission', value: t(`filters.drawer.onMissionOptions.${filters.onMission}`) })
    }
    if (filters.remotePreference) {
      axes.push({ id: 'remotePreference', value: t(`workMode.${filters.remotePreference}`) })
    }
    if (filters.availability) {
      axes.push({
        id: 'availability',
        value: `${t('filters.availability')} : ${t(`availability.${filters.availability}`)}`,
      })
    }
    if (filters.seniority) {
      axes.push({ id: 'seniority', value: `${t('filters.seniority')} : ${t(`seniority.${filters.seniority}`)}` })
    }
    if (activeView) axes.push({ id: 'view', value: t(`views.${activeView}`) })
    return axes
  }, [filters, activeView, t])

  const emptyAction = talentEmptyStateAction(narrowingAxes)

  // #1904 — ce que le vivier déclare à Laura : son utilité, ce qu'il compte, les
  // filtres posés, un vivier vide nommé comme un manque, et le seul geste que
  // l'écran rend. `data` absent = non mesuré, jamais « 0 profil ».
  useLauraContext(
    vivierLauraContext(t, {
      isLoading,
      total: data ? data.total : null,
      hasQuery,
      filters: narrowingAxes.map(axis => axis.value),
    }),
  )

  /** Retire UN SEUL axe — le geste que propose l'état vide « namedFilter ». */
  const clearAxis = (id: string) => {
    if (id === 'view') {
      setActiveView(null)
      patchFilters({
        kind: undefined,
        derived: undefined,
        engagementKind: undefined,
        freeBefore: undefined,
        neverSubmitted: undefined,
        dormantMonths: undefined,
      })
      return
    }
    if (id === 'zone') {
      // Un rayon SANS ville n'a pas de centre — retirer la ville retire le
      // rayon avec elle plutôt que de laisser un critère orphelin et sans effet.
      patchFilters({ zone: undefined, radiusKm: undefined })
      return
    }
    patchFilters({ [id]: id === 'skills' ? [] : undefined } as Partial<TalentSearchQuery>)
  }

  /**
   * Le droit de VOIR les montants, lu là où le serveur l'écrit déjà.
   *
   * Chaque ligne du vivier porte `financeVisible` — la décision du serveur,
   * identique pour toutes. En édition, la fiche complète fait foi.
   *
   * ⚠️ #2222 (16/09/2026) — la raison d'origine (« il n'existe pas de source
   * globale côté web, `useUserPermissions()` rend un tableau vide ») n'est plus
   * vraie : le hook rend le droit RÉEL. On continue pourtant de lire
   * `financeVisible`, et c'est délibéré — le serveur applique aussi une PORTÉE
   * (`finance:read:own` ne montre que SON périmètre, `finance-scope.ts`), que
   * la seule permission ne permet pas de reconstituer côté client.
   *
   * `undefined` quand la liste est vide : on ne sait pas, et on ne DEVINE pas.
   * Le formulaire montre alors les champs — masquer une capacité à qui y a droit
   * est pire que la montrer à qui le serveur refusera.
   */
  const financeVisible = editingId ? editing?.finance_visible : list[0]?.financeVisible

  return (
    <CustomerPage
      anchorId="vivier"
      // L'écran nomme son h1 LUI-MÊME (`VivierIntro`, `ScreenIntro`) : l'entête
      // ne lui en donne pas un second (GA-347). `pageTitle` reste posé pour le
      // fil d'ariane et les lecteurs d'écran.
      titleInScreen
      pageTitle={t('page.title')}
      /* GA-121 — sous un filtre, la pastille dit « N profils trouvés » ; sans
         filtre, la synthèse du vivier dit déjà le total : zéro n'affiche rien. */
      pageTitleBadge={
        hasQuery && total > 0 ? <Badge variant="outline">{t('count.filtered', { count: total })}</Badge> : undefined
      }
    >
      {/* Refonte Théo (maquette `c/talents-vivier`, 23/10/2026) — l'EN-TÊTE : h1,
          phrase, puis les actions à droite — Exporter · Importer · Ajouter un
          profil. « Exporter » est un LIEN vers Réglages › Mes données › Exports
          (#3950, GA-26 : l'export vit à un seul endroit), affiché seulement
          quand la règle d'espace laisse sortir les données.
          #4501 — l'en-tête est celui de l'ONGLET (maquette `talents-recrutement`) :
          « Recrutement » a son titre, sa phrase et son seul geste. */}
      {tab === 'recrutement' ? (
        <ScreenIntro
          title={t('recruitment.title')}
          titleWithoutName={t('recruitment.title')}
          subtitle={t('recruitment.subtitle')}
          action={
            <Button onClick={openAdd} className="gap-1.5">
              <Plus className="size-4" />
              {t('addProfile')}
            </Button>
          }
        />
      ) : (
        <VivierIntro
          actions={
            <>
              {dataExit.allowed ? (
                <Button variant="ghost" icon={Download} asChild>
                  <Link to="/settings/mes-donnees">{t('ioMenu.export.cta')}</Link>
                </Button>
              ) : null}
              {/* #3554 / #3556 — UN bouton, le détail (zip, e-mail, CSV,
                  disponibilités, lot) vit dans la modale. */}
              <VivierImportMenu initialOpen={seededImportCv === true} />
              <Button {...guideAnchorProps('vivier.ajouter')} onClick={openAdd} className="gap-1.5">
                <Plus className="size-4" />
                {t('addProfile')}
              </Button>
            </>
          }
        />
      )}

      {/* Refonte Théo — deux VRAIS onglets (Vivier · Recrutement), chacun
          n'affiche que son contenu (décision Louis 23/10/2026). Aucune route
          neuve : l'onglet vit dans l'ancre (`#recrutement`). Les présentations
          vivent à UN endroit, Affaires › Présentations (#4528, Louis 24/10). */}
      <TabNav
        tabs={TALENTS_TABS.map(key => ({ key, label: t(`tabs.${key}`) }))}
        activeTab={tab}
        onTabChange={next => selectTab(next as TalentsTab)}
        size="sm"
        className="mb-4"
      />

      {tab === 'recrutement' ? <RecruitmentStages /> : null}

      {tab === 'vivier' ? (
        <div className={cn('flex flex-col gap-5', matchPanelOpen && 'xl:flex-row xl:items-start')}>
          <div className="min-w-0 flex-1">
            {/* La BARRE D'OUTILS (maquette `.bo11-toolbar`) — #4500 : la recherche, le
                bouton « Filtres » (modale « Filtrer mon vivier », qui porte TOUS les
                filtres, la vue rapide et « Mes vues » compris), puis la bascule
                Liste · Cartes au bout. Toujours visible. */}
            <TalentFilters
              query={filters}
              activeView={activeView}
              onChange={patchFilters}
              onView={view => {
                setActiveView(view)
                setPage(1)
              }}
              layout={layout}
              onLayoutChange={setLayout}
            />

            {/* La SYNTHÈSE (maquette `.bo11-summary`) : combien de personnes, la
                règle de lecture de la disponibilité, et les expertises manquantes.
                #3488 — vivier actif vide mais profils archivés : l'état vide le
                dit déjà, la synthèse se tait.
                #4500 (Louis 23/10/2026, refonte V22) — RETIRÉS de l'écran : les
                cinq encarts d'indicateurs (`TalentStatsBanner`), le bandeau
                « N sur M consultants à disponibilité inconnue » (pastille
                d'hygiène, qui reste au cockpit Pilotage) et le bandeau « N
                fiches ont un CV lu avant le correctif » avec « Relire les CV
                incomplets » — SUPPRIMÉ partout, le rattrapage côté serveur reste
                (revient sur #2543 pour le Vivier). */}
            {hasArchivedOnly ? null : (
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                {data ? (
                  <Text size="sm">
                    <Trans
                      t={t}
                      i18nKey="summary.people"
                      count={total}
                      components={{ b: <strong className="font-semibold" /> }}
                    />
                  </Text>
                ) : null}
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('summary.declaredWins')}
                </Text>
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('summary.pushable')}
                </Text>
                {/* #4349 V.2 — le bloc vit dans Pilotage › Staffing ; ici, le lien seul. */}
                <MissingExpertiseLink />
              </div>
            )}

            {/* #4500.1 / #4500.2 (24/10/2026) — le bandeau « CV lus » est retiré de la page ;
                la lecture automatique continue, seul son affichage part. */}
            {/* LE GESTE QUI SUIT L'ENREGISTREMENT (§3.4). */}
            {justCreated ? (
              <NextGesturePanel
                talentId={justCreated.id}
                talentName={justCreated.name}
                onDismiss={() => setJustCreated(null)}
              />
            ) : null}

            {archiveReport ? (
              <BulkArchiveReport
                archivedCount={archiveReport.archivedCount}
                refused={archiveReport.refused}
                onDismiss={() => setArchiveReport(null)}
              />
            ) : null}
            {/* La barre de SÉLECTION (maquette `.ad-selbar`) : elle n'apparaît
                qu'à la première case cochée. */}
            <TalentSelectionBar
              count={selectedIds.size}
              onClear={clearSelection}
              onArchive={archiveSelection}
              archivePending={archiveBulk.isPending}
              onExport={exportSelection}
              exportAllowed={dataExit.allowed}
              onErase={isDemo ? undefined : () => setErasing(true)}
              total={total}
              onSelectAll={selectEverything}
            />

            {/* L'ÉCHEC (maquette `.t-banner.danger`) : une liste qui n'a pas pu se
                charger n'est pas une liste vide (#3830) — il le dit, et rien n'a
                été modifié. */}
            {isError ? (
              <div
                role="alert"
                className="mb-3 flex flex-wrap items-center gap-3 rounded-card border border-[var(--danger-soft-border)] bg-[var(--danger-soft-bg)] p-4"
              >
                <div className="min-w-0 flex-1">
                  <Text size="sm" weight="semibold" className="text-[var(--danger-soft-text)]">
                    {t('loadError.title')}
                  </Text>
                  <Text size="sm" className="text-[var(--danger-soft-text)]">
                    {t('search.error')}
                  </Text>
                </div>
                <Button variant="outline" size="sm" onClick={() => void refetch()}>
                  {t('loadError.retry')}
                </Button>
              </div>
            ) : null}

            {isLoading ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('loading')}
              </Text>
            ) : list.length === 0 ? (
              <Card className="p-8 text-center">
                <Users className="mx-auto size-8 text-[var(--bellum-text-muted)]" />
                {emptyAction.kind === 'namedFilter' ? (
                  // EXACTEMENT un axe posé : on le NOMME, et on offre de le
                  // retirer SEUL — maquette `.bo11-empty`.
                  <>
                    <Text size="sm" weight="medium" className="mt-3">
                      {t('search.namedEmpty.title', { criterion: emptyAction.axis.value })}
                    </Text>
                    <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                      {t('search.namedEmpty.subtitle')}
                    </Text>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => clearAxis(emptyAction.axis.id)}>
                      {t('search.namedEmpty.clear')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Text size="sm" weight="medium" className="mt-3">
                      {hasArchivedOnly
                        ? t('empty.archivedOnly.title', { count: archivedCount })
                        : hasQuery
                          ? t('search.empty.title')
                          : t('empty.title')}
                    </Text>
                    <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                      {hasArchivedOnly
                        ? t('empty.archivedOnly.subtitle')
                        : hasQuery
                          ? t('search.empty.subtitle')
                          : t('empty.subtitle')}
                    </Text>
                    {hasArchivedOnly ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => patchFilters({ includeArchived: true })}
                      >
                        {t('empty.archivedOnly.show')}
                      </Button>
                    ) : hasQuery ? (
                      // #2958.104 — le bouton remet le vivier entier.
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => {
                          setFilters({ skills: [] })
                          setActiveView(null)
                          setPage(1)
                        }}
                      >
                        {t('search.empty.clear')}
                      </Button>
                    ) : null}
                  </>
                )}
              </Card>
            ) : (
              /* #2182.25 à .39 — LE VIVIER EN COLONNES, ou en CARTES (bascule de
                 la barre, maquette `.bo11-switch`). Les bornes des colonnes
                 vivent dans `vivierTableColumns.ts`. */
              <VivierTable
                rows={list}
                onEdit={openEdit}
                onDelete={setDeleting}
                onOpenSkills={setSkillsFor}
                onOpenRecord={setPanelConsultantId}
                // Théo C talents-vivier.A7 — « Comparer à d'autres profils » ouvre le panneau de rapprochement.
                onCompare={() => setMatchPanelOpen(true)}
                onArchive={row => archiveIds([row.id])}
                onToggleFavorite={row =>
                  setFavorite.mutate(
                    { id: row.id, isFavorite: !row.isFavorite },
                    { onError: () => toast.error(t('vivier.favoriteError')) },
                  )
                }
                selectedIds={selectedIds}
                onToggleAll={toggleAllSelected}
                onToggleRow={toggleRowSelected}
                layout={layout}
              />
            )}

            {/* Le PIED DE LISTE (maquette) : « 1 – 11 sur 11 · 25 par page »,
                les archivés non listés, puis la pagination. */}
            {list.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('pager.range', {
                      from: (page - 1) * pageSize + 1,
                      to: (page - 1) * pageSize + list.length,
                      total,
                      size: pageSize,
                    })}
                  </Text>
                  {/* « Afficher N » — un réglage d'écran, pas un filtre : le
                      changer ramène à la page 1. */}
                  <label className="flex items-center gap-1.5">
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('pager.show')}
                    </Text>
                    <SelectField
                      ariaLabel={t('pager.show')}
                      value={String(pageSize)}
                      onChange={next => {
                        setPageSize(Number(next))
                        setPage(1)
                      }}
                      options={TALENT_PAGE_SIZE_OPTIONS.map(size => ({ value: String(size), label: String(size) }))}
                      size="sm"
                    />
                  </label>
                  {/* #3488 — les archivés NON listés se nomment, avec leur geste. */}
                  {archivedHiddenCount > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => patchFilters({ includeArchived: true })}>
                      {t('pager.showArchived', { count: archivedHiddenCount })}
                    </Button>
                  ) : null}
                </div>

                {lastPage > 1 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(current => current - 1)}
                    >
                      {t('pager.previous')}
                    </Button>
                    {talentPaginationRange(page, lastPage).map((entry, index) =>
                      entry === null ? (
                        <Text
                          key={`ellipsis-${index}`}
                          size="xs"
                          className="px-1 text-[var(--bellum-text-muted)]"
                          aria-hidden="true"
                        >
                          …
                        </Text>
                      ) : (
                        <Button
                          key={entry}
                          variant={entry === page ? 'default' : 'ghost'}
                          size="sm"
                          aria-current={entry === page ? 'page' : undefined}
                          aria-label={t('pager.goTo', { page: entry })}
                          onClick={() => setPage(entry)}
                        >
                          {entry}
                        </Button>
                      ),
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= lastPage}
                      onClick={() => setPage(current => current + 1)}
                    >
                      {t('pager.next')}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* Le rapprochement par BESOIN (#2500 / #2525) — absent de la maquette
              Théo, qui rapproche par personne (« Rapprocher » sur chaque ligne) :
              gardé, replié, à côté du tableau — À trancher par Louis. */}
          <aside className={cn('w-full', matchPanelOpen && 'xl:w-96 xl:shrink-0')}>
            <CollapsedSection
              title={t('matchPanel.title')}
              description={t('matchPanel.hint')}
              open={matchPanelOpen}
              onOpenChange={setMatchPanelOpen}
            >
              {/* #4433.8 — un seul panneau de matching à la fois (le rail s'efface quand un besoin est choisi). */}
              <ConsultantMatchSection selectedId={matchProjectId} onSelect={setMatchProjectId} />
            </CollapsedSection>
          </aside>
        </div>
      ) : null}

      {/* Montée à l'ouverture seulement : ses lectures (besoins ouverts, vivier) ne partent qu'au geste. */}

      <RecordPanel
        target={panelConsultantId ? { kind: 'consultant', id: panelConsultantId } : null}
        onClose={() => setPanelConsultantId(undefined)}
      />

      {skillsFor ? (
        <TalentSkillsDialog
          talent={{ id: skillsFor.id, full_name: talentNameText(skillsFor.fullName, t('name.unnamed')) } as Consultant}
          open
          onOpenChange={open => {
            if (!open) setSkillsFor(undefined)
          }}
        />
      ) : null}

      {erasing ? (
        <TalentEraseDialog
          count={selectedIds.size}
          open
          pending={eraseBulk.isPending}
          onOpenChange={open => {
            if (!open) setErasing(false)
          }}
          onConfirm={eraseSelection}
        />
      ) : null}

      {deleting ? (
        <TalentDeleteDialog
          talentId={deleting.id}
          talentName={talentNameText(deleting.fullName, t('name.unnamed'))}
          open
          deleting={remove.isPending}
          onOpenChange={open => {
            if (!open) setDeleting(undefined)
          }}
          onConfirm={confirmDelete}
        />
      ) : null}

      {/* Théo C talents-vivier.R6 — la CRÉATION passe par les trois portes ; l'ÉDITION garde le formulaire complet
          (les ~100 champs ne disparaissent pas : « Modifier » les porte toujours). */}
      <VivierAddDialog
        open={dialogOpen && editingId === null}
        saving={create.isPending}
        initialFullName={seededName}
        onClose={() => setDialogOpen(false)}
        onSubmit={(form, options) => submit(form, {}, options)}
        onCvIntake={id => {
          setDialogOpen(false)
          navigate({ to: '/consultants/$id', params: { id } })
        }}
      />

      <ConsultantFormDialog
        open={dialogOpen && editingId !== null}
        consultant={editingId ? (editing ?? null) : null}
        saving={create.isPending || update.isPending}
        financeVisible={financeVisible}
        // #2195.12 — le vivier DÉJÀ chargé par cet écran sert de liste de
        // managers : aucune lecture de plus, et la liste est celle que
        // l'utilisateur vient de voir.
        // ⚠️ `fullName` → `full_name` : la LIGNE de recherche (`TalentRow`) et
        // la FICHE (`Consultant`) ne nomment pas ce champ pareil. Sans cette
        // conversion, la liste déroulante serait muette.
        // ⚠️ GA-120 — le nom passe par la DÉCISION avant d'entrer dans une
        // liste déroulante : `full_name` porte le nom du FICHIER déposé quand
        // personne n'a saisi de nom, et « cv_dupont.pdf » proposé comme manager
        // est exactement le défaut que la garde nomme.
        managerCandidates={list.map(row => ({
          id: row.id,
          full_name: talentNameText(row.fullName, t('name.unnamed')),
        }))}
        // #1903.16 — le nom dicté à Laura, ignoré dès qu'on ÉDITE une fiche
        // existante : `editingId` porte alors le nom réel, que rien ne doit
        // recouvrir. `undefined` plutôt que `''` : un champ vide est une amorce
        // qui n'a rien à faire (comportement inchangé sans `?name=`).
        initialFullName={editingId ? undefined : seededName}
        onClose={() => {
          setDialogOpen(false)
          setEditingId(null)
        }}
        onSubmit={submit}
        /* #1801.1 — le dépôt de CV, remonté depuis le corps de l'écran
           (« aérer cette page »), rejoint la modale : il crée la fiche
           directement (`useCvIntake`, hors du formulaire manuel ci-dessous),
           donc referme la modale et enchaîne sur la fiche créée — exactement
           ce que faisait `onCreated` quand le dépôt vivait dans la page. */
        onCvIntake={id => {
          setDialogOpen(false)
          setEditingId(null)
          navigate({ to: '/consultants/$id', params: { id } })
        }}
      />
    </CustomerPage>
  )
}

/**
 * « 3 besoins ouverts correspondent à ce profil. Je lance le rapprochement ? »
 *
 * Le §3.4 est catégorique : « à l'enregistrement, l'écran ne renvoie pas à une
 * liste ». Il proposait un toast et refermait le dialogue, alors que le moteur
 * (`POST /consultants/:id/match-inverse`) existait et n'était atteignable que
 * depuis la fiche du talent — c'est-à-dire deux clics plus loin, par quelqu'un
 * qui devait déjà savoir qu'il fallait y aller.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS RÈGLES QUE CE PANNEAU TIENT
 * ─────────────────────────────────────────────────────────────────────────
 *  - **Le chiffre annoncé AVANT le clic est celui des besoins OUVERTS**, pas
 *    de ceux « qui correspondent » : la correspondance ne se connaît qu'après
 *    le rapprochement, et l'annoncer avant serait un chiffre inventé. La phrase
 *    dit donc ce qu'on sait — combien de besoins vont être confrontés.
 *  - **Un zéro de chargement ment** : tant que le compteur n'est pas arrivé, la
 *    phrase se passe de nombre au lieu d'écrire « 0 besoins ouverts », qui
 *    découragerait exactement le geste qu'on propose.
 *  - **Le coût est dit AVANT le clic, et il est nul.** Le rapprochement inverse
 *    ne touche aucun service de crédits (`InverseMatchingService` ne dépend que
 *    de ses dépôts et du moteur). Le taire laisserait supposer l'inverse, et le
 *    dépôt tient « coût annoncé = coût débité » dans les deux sens.
 *
 * Le verdict rendu ensuite est celui du SERVEUR — on compte ses `bucket`, on ne
 * les recalcule pas — et **ce qui n'a pas pu être évalué est NOMMÉ** : sans ça,
 * « 2 sur 4 » ferait passer une absence de mesure pour un refus.
 */
function NextGesturePanel({
  talentId,
  talentName,
  onDismiss,
}: {
  talentId: string
  talentName: string
  onDismiss: () => void
}) {
  const { t } = useTranslation('consultants')
  // Une seule ligne demandée : on ne veut que le compteur d'en-tête, calculé
  // par le serveur sur TOUT le filtre et non sur la page rendue.
  const { data: needs } = useOpenNeeds({ offset: 0, limit: 1 })
  const [run, setRun] = useState<InverseMatch | null>(null)
  const [running, setRunning] = useState(false)
  const openCount = needs?.counters.total

  const launch = () => {
    setRunning(true)
    matchingApi
      .inverse(talentId, 'all')
      .then(setRun)
      .catch((error: Error) => toast.error(error.message || t('toast.error')))
      .finally(() => setRunning(false))
  }

  const recommended = run?.needs.filter(entry => entry.result.bucket === 'recommended').length ?? 0
  const notEvaluable = run?.needs.filter(entry => entry.result.bucket === 'not_evaluable').length ?? 0

  return (
    <Card className="mb-3 p-4">
      <Text size="sm" weight="semibold">
        {t('nextGesture.title', { name: talentName })}
      </Text>
      {/* Ce panneau DÉCLENCHE un classement de personnes et en rend le verdict :
          l'Annexe III de l'EU AI Act s'y applique comme sur les trois autres
          écrans qui classent. Le bandeau est non masquable, et la garde
          `transparency-mounted` l'a exigé dès que `matchingApi` est entré ici. */}
      <TransparencyBanner />
      {run ? (
        <>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('nextGesture.result', { count: recommended, evaluated: run.evaluatedCount })}
          </Text>
          {notEvaluable > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('nextGesture.notEvaluable', { count: notEvaluable })}
            </Text>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="outline" asChild>
              <Link to="/consultants/$id" params={{ id: talentId }}>
                {t('nextGesture.openProfile')}
              </Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('nextGesture.close')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {openCount === undefined ? t('nextGesture.promptUnknown') : t('nextGesture.prompt', { count: openCount })}
          </Text>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Button size="sm" onClick={launch} disabled={running}>
              {running ? t('nextGesture.running') : t('nextGesture.launch')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              {t('nextGesture.later')}
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}
