import { ScreenGuideSlot } from '@/components/shell/ScreenGuideSlot'
import { consultantsExpected } from '@bellum/contracts'
import {
  Badge,
  Box,
  Button,
  Checkbox,
  FilterChips,
  HORIZONTAL_OVERSCROLL_CLASS,
  Input,
  Label,
  SearchEmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TYPE_SCALE,
  Text,
  cn,
} from '@bellum/ui'
import { DndContext, PointerSensor, useDndMonitor, useDraggable, useSensor, useSensors } from '@dnd-kit/core'
import { Link } from '@tanstack/react-router'
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  GanttChart,
  Plus,
  SlidersHorizontal,
  Table2,
} from 'lucide-react'
import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CustomerPage } from '@/components/page/CustomerPage'
import { AskLaura } from '@/components/primitives/AskLaura'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { ContactAvatar } from '@/components/ui/ContactAvatar'
import { PlanningBlockedPanel } from './PlanningBlockedPanel'
import { PlanningBoard } from './PlanningBoard'
import { PlanningCreateDialog } from './PlanningCreateDialog'
import { PlanningDeadlines } from './PlanningDeadlines'
import { PlanningExportButton } from './PlanningExportButton'
import { PlanningFiltersDialog, type PlanningFilterOption } from './PlanningFiltersDialog'
import { PlanningPeekDialog } from './PlanningPeekDialog'
import { RowMissionMenu } from './PlanningRowMenu'
import { PlanningSummary } from './PlanningSummary'
import { PlanningTable } from './PlanningTable'
import { PlanningViewsDialog } from './PlanningViewsDialog'
import { PlanningSignedProjects } from './PlanningSignedProjects'
import { useCrmCounters } from '@/features/crm-counters/useCrmCounters'
import { useMyBusinessUnits } from '@/features/business-units/hooks/useMyBusinessUnits'
import { formatDate } from '@/lib/locale'
import { assigneeNames, assigneesOf, useMissions, type MissionView } from '../api'
import { useConsultants } from '@/features/consultants/hooks'
import { isFinishedMission } from '../mission-status'
import { supervisedForfaitLabel } from '../supervised-forfait'
import { type DeadlineMission } from '../planning-deadlines'
import {
  conflictedMissionIds,
  countConflicts,
  detectMissionConflicts,
  overallocatedPercentByPerson,
} from '../planning-conflicts'
import {
  PLANNING_SCALES,
  availabilityBucket,
  availabilityFrom,
  declaredAvailability,
  canDragMission,
  consultantsAvailableSoon,
  isoDay,
  dragBlockReason,
  monthOf,
  pixelsToDayDelta,
  placeMission,
  planningWindow,
  shiftDateByDays,
  shiftMonth,
  sortPlacements,
  summarizePlanning,
  todayOffsetPercent,
  type AvailabilityBucket,
  type MissionAvailability,
  type MissionPlacement,
  type PlanningScale,
  type PlanningWindow,
} from '../planning'
import {
  MISSION_SITUATIONS,
  PLANNING_QUICK_CHIPS,
  countActiveFilters,
  emptyPlanningFilters,
  knownRenewalStatus,
  matchesPlanningFilters,
  matchesQuickChip,
  missionSituation,
  type MissionSituation,
  type PlanningFilterKey,
  type PlanningFilters,
  type PlanningGroupBy,
  type PlanningMissionFacts,
  type PlanningQuickChip,
  type PlanningView,
} from '../planning-views'
import { useUpdateMission } from './mission-panel.api'
import { MissionDetailPanel } from './MissionDetailPanel'
import { MissionRisks } from './MissionRisks'

/**
 * PLANIFICATION — la frise des missions, et l'écran que PDF-22 appelle « celui
 * qui manque le plus ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `/missions/planification` rendait « Page introuvable » en production, vérifié
 * à l'écran le 29/08/2026. Les cinq onglets de Missions répondent chacun à une
 * question de GESTION — ce qui tourne, où en est la carte, le relevé, la
 * facture, l'encaissement — et aucun ne répond à la seule question qu'un
 * responsable de staffing se pose : **qui est occupé, jusqu'à quand, et quand
 * se libère-t-il ?** C'est une question de FORME : elle se lit sur un axe de
 * temps, jamais dans une colonne de dates.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL NE CRÉE AUCUNE ROUTE D'API
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /delivery/missions` sert déjà tout ce qu'une barre demande : le
 * démarrage, la fin PRÉVUE, le statut, le nom du compte et les personnes
 * affectées aujourd'hui. Le motif du dépôt est « du code juste que personne
 * n'appelle » — ici, la donnée était servie et personne ne la DESSINAIT.
 *
 * ⚠️ **Cette lecture plafonne à 200 lignes, sans pagination, triées par fin la
 * plus proche d'abord.** Au-delà, les missions qui finissent le plus tard sont
 * les premières absentes — exactement celles qu'une planification cherche.
 * L'écran le DIT (`planning.truncated`) plutôt que de rendre un sous-ensemble
 * silencieux : un écran incomplet qui s'annonce se répare, un écran incomplet
 * qui se tait se croit. Le vrai correctif est un paramètre de FENÊTRE côté
 * serveur ; il touche une route partagée par quatre écrans et n'appartient pas
 * à ce lot.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE BARRE N'AFFIRME UNE DATE QUE PERSONNE N'A SAISIE
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est la règle qui gouverne tout le fichier, et `planning.ts` en porte le
 * calcul. Quatre absences, quatre rendus, et aucun ne se lit « ça finit ici » :
 * un bord OUVERT est hachuré et nommé, un bord ROGNÉ porte un chevron, une
 * mission sans date sort de la frise dans son bloc, une saisie incohérente
 * aussi. Le repère « aujourd'hui » ne se dessine que s'il tombe dans la
 * fenêtre — le tracer à 0 % l'aurait posé sur le 1er du premier mois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'AFFICHE PAS, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **aucun montant.** L'image de référence n'en porte aucun dans sa frise :
 *    les TJM et le bon de commande vivent dans la fiche, qui les garde déjà
 *    derrière `canReadFinance`. Un écran de staffing répond « qui, jusqu'à
 *    quand », pas « combien » — et n'ayant aucun montant, il n'a pas non plus
 *    de « 0 € » possible.
 *  - **aucune barre d'avancement « 28 / 50 jours ».** La donnée n'existe pas :
 *    `missions` ne porte pas de jours VENDUS, seuls les jours déclarés vivent
 *    sur les relevés mensuels. La dessiner supposerait un dénominateur inventé.
 *  - **aucune probabilité, aucun prévisionnel pondéré** — doctrine.
 */
export function PlanningPage({ now = new Date() }: { now?: Date }) {
  const { t, i18n } = useTranslation('missions')
  const { data, isLoading, isError } = useMissions()
  // #2989 — le catalogue des BU de l'espace, indépendant des missions
  // actuellement chargées (voir la doc de `businessUnitOptions` plus bas).
  const { data: myBusinessUnits } = useMyBusinessUnits()
  // La fenêtre s'ouvre un mois AVANT le mois courant : le repère « aujourd'hui »
  // se lit alors au milieu, et non collé au bord gauche où il ne dit plus rien
  // de ce qui arrive.
  const [anchor, setAnchor] = useState(() => shiftMonth(monthOf(now), -1))
  const [query, setQuery] = useState('')
  const [withFinished, setWithFinished] = useState(false)
  // Le COUP D'ŒIL (dialogue) puis, sur demande, le panneau complet : deux niveaux, un seul état.
  const [selected, setSelected] = useState<MissionView | undefined>(undefined)
  const [panelOpen, setPanelOpen] = useState(false)
  // #1374 — l'échelle de la frise. Quatre mois par défaut : c'est la fenêtre
  // qui couvre J+60, l'horizon de renouvellement le plus large du produit.
  const [scale, setScale] = useState<PlanningScale>(PLANNING_SCALES[0])
  // Théo missions-planning.R3/R6 — les pastilles (cumulées en ET) et la fenêtre
  // « Filtrer le planning » (multi-sélection) : la MÊME sélection s'applique à
  // la frise, au tableau et au board.
  const [chips, setChips] = useState<readonly PlanningQuickChip[]>([])
  const [filters, setFilters] = useState<PlanningFilters>(emptyPlanningFilters)
  const [groupBy, setGroupBy] = useState<PlanningGroupBy>('mission')
  const [mode, setMode] = useState<'timeline' | 'table' | 'board'>('timeline')
  const [dialog, setDialog] = useState<'filters' | 'views' | 'create' | null>(null)
  // Théo C missions-planning.HT1 — « Bloquées » (ADV fondue) : une pastille de filtre qui remplace la frise
  // par les dossiers incomplets. Ce n'est pas un écran.
  const [blockedOnly, setBlockedOnly] = useState(false)

  const frame = useMemo(() => planningWindow(anchor, scale), [anchor, scale])
  const today = useMemo(() => isoDay(now), [now])
  const todayPercent = useMemo(() => todayOffsetPercent(frame, today), [frame, today])

  const all = useMemo(() => data?.missions ?? [], [data?.missions])
  // #2194.7 / #2194.43 — le vivier ENTIER, jamais borné à `all` (200 missions
  // plafonnées, voir la doc de l'écran) : ce chiffre vient du serveur, qui
  // seul peut balayer le vivier complet. `?? 0` : un COMPTEUR, même exemption
  // que documentée par GA-19 — voir `MissionListPage.intercontractCount`.
  const intercontractCount = data?.intercontractCount ?? 0
  const finishedCount = useMemo(() => all.filter(mission => isFinishedMission(mission.status)).length, [all])

  /** Ce que les filtres lisent d'une mission — construit UNE fois par mission. */
  const factsOf = useMemo(() => {
    const cache = new Map<string, PlanningMissionFacts>()
    return (mission: MissionView): PlanningMissionFacts => {
      const known = cache.get(mission.id)
      if (known) return known
      const facts: PlanningMissionFacts = {
        startedOn: mission.started_on,
        endsOn: mission.ends_on,
        renewalStatus: knownRenewalStatus(mission.renewal_status),
        account: mission.accountName ?? null,
        consultants: assigneeNames(mission),
        owner: mission.ownerName ?? null,
        skills: mission.assignedSkills ?? [],
        clientTeams: mission.client_team_names ?? [],
        businessUnit: mission.businessUnitName ?? null,
        // La MÊME dérivation que la colonne « Se libère » (#1373) : deux
        // calculs de la même disponibilité divergeraient au premier statut de
        // renouvellement ajouté (GA-26).
        availabilityBucket: availabilityBucket(availabilityFrom(mission.ends_on, today, mission.renewal_status), today),
      }
      cache.set(mission.id, facts)
      return facts
    }
  }, [today])

  /** La population de départ : vivante (ou terminée sur demande) et trouvée par la recherche. */
  const base = useMemo(() => {
    const alive = withFinished ? all : all.filter(mission => !isFinishedMission(mission.status))
    const needle = normalize(query)
    return needle ? alive.filter(mission => normalize(haystack(mission)).includes(needle)) : alive
  }, [all, query, withFinished])

  /** #2194.6, #2194.38, #2194.40, #2194.41, #2194.42 — même portée que
   *  `soonAvailableCount` : le PORTEFEUILLE actif, pas la fenêtre affichée. Un
   *  chevauchement ne disparaît pas parce qu'on a changé l'échelle du Gantt. */
  const conflicts = useMemo(
    () =>
      detectMissionConflicts(
        all
          .filter(mission => !isFinishedMission(mission.status))
          .map(mission => ({
            missionId: mission.id,
            assigneeNames: assigneeNames(mission),
            startedOn: mission.started_on,
            endsOn: mission.ends_on,
            assigneesCount:
              mission.assignees === null || mission.assignees === undefined ? null : assigneesOf(mission).length,
            consultantsExpected: consultantsExpected(mission.delivery_mode),
            // #2194.39 — la charge de chaque affectation, pour la surallocation.
            // `?? null` : absente (forme d'avant, voir `MissionAssignee`),
            // jamais comptée comme 0.
            assigneeLoads: assigneesOf(mission).map(person => ({
              name: person.fullName,
              loadPercent: person.loadPercent ?? null,
            })),
          })),
        today,
      ),
    [all, today],
  )
  const conflictCounts = useMemo(() => countConflicts(conflicts), [conflicts])
  /** #2989.2 — la MÊME liste de conflits, lue PAR PERSONNE : le résumé compte
   *  « 1 surallocation », la ligne dit QUI et de combien. */
  const overallocationByPerson = useMemo(() => overallocatedPercentByPerson(conflicts), [conflicts])
  /** Théo C missions-planning.A8 — les missions qui portent un conflit : la pastille « ! » de leur barre. */
  const conflictedIds = useMemo(() => conflictedMissionIds(conflicts), [conflicts])

  /**
   * LES FILTRES, ET L'ORDRE DANS LEQUEL ILS S'APPLIQUENT.
   *
   * Recherche → fenêtre « Filtrer » (`narrowed`), puis les pastilles. La
   * coupure est délibérée : les COMPTES des pastilles se calculent sur
   * `narrowed` (tout sauf les pastilles), jamais sur la liste finale. Sinon
   * cocher « Sans date de fin » ferait tomber « Échéances » à zéro alors que
   * trois missions y répondent — une pastille à « 0 » qu'un clic remplit se lit
   * comme une panne.
   */
  const narrowed = useMemo(
    () => base.filter(mission => matchesPlanningFilters(factsOf(mission), filters, today)),
    [base, factsOf, filters, today],
  )
  const chipCounts = useMemo(() => {
    const counts = {} as Record<PlanningQuickChip, number>
    for (const chip of PLANNING_QUICK_CHIPS) {
      counts[chip] = narrowed.filter(mission =>
        matchesQuickChip(chip, factsOf(mission), today, conflictedIds.has(mission.id)),
      ).length
    }
    return counts
  }, [narrowed, factsOf, today, conflictedIds])
  // Point propre MISSIONS-A — la disponibilité DÉCLARÉE des personnes (`available_from` du vivier).
  const { data: consultants } = useConsultants()
  const availableFromById = useMemo(
    () => new Map((consultants ?? []).map(consultant => [consultant.id, consultant.available_from ?? null])),
    [consultants],
  )
  const searched = useMemo(
    () =>
      narrowed.filter(mission =>
        chips.every(chip => matchesQuickChip(chip, factsOf(mission), today, conflictedIds.has(mission.id))),
      ),
    [narrowed, chips, factsOf, today, conflictedIds],
  )

  /** Les valeurs RÉELLEMENT présentes, jamais un catalogue théorique : un
   *  filtre qui propose un consultant qu'aucune ligne ne porte ne peut que
   *  rendre une liste vide. */
  const filterOptions = useMemo<Record<PlanningFilterKey, readonly PlanningFilterOption[]>>(() => {
    const distinct = (values: readonly (string | null | undefined)[]) =>
      [...new Set(values.filter((value): value is string => !!value))]
        .sort((a, b) => a.localeCompare(b, 'fr'))
        .map(value => ({ value, label: value }))
    // #2989 — le catalogue des BU de l'espace, indépendant des missions chargées.
    const fromWorkspace = (myBusinessUnits?.businessUnits ?? []).map(unit => unit.name)
    return {
      account: distinct(base.map(mission => mission.accountName)),
      consultant: distinct(base.flatMap(mission => assigneeNames(mission))),
      owner: distinct(base.map(mission => mission.ownerName)),
      situation: MISSION_SITUATIONS.map(value => ({ value, label: t(`planning.screen.situation.${value}`) })),
      skill: distinct(base.flatMap(mission => mission.assignedSkills ?? [])),
      clientTeam: distinct(base.flatMap(mission => mission.client_team_names ?? [])),
      availability: AVAILABILITY_BUCKETS.map(value => ({
        value,
        label: t(`planning.filters.availabilityOptions.${value}`),
      })),
      businessUnit: distinct([...fromWorkspace, ...base.map(mission => mission.businessUnitName)]),
    }
  }, [base, myBusinessUnits, t])

  const rows = useMemo(
    () =>
      searched.map(mission => ({
        mission,
        label: mission.label || t('planning.unnamedMission'),
        placement: placeMission({ id: mission.id, startedOn: mission.started_on, endsOn: mission.ends_on }, frame),
        // #1373 — la promesse de l'écran, DÉRIVÉE de `ends_on` et de rien
        // d'autre. Elle est calculée ici, à côté du placement, pour que la
        // ligne et la barre lisent la même date.
        // #2410.60 — et du statut de renouvellement : un renouvellement
        // OUVERT n'est jamais une disponibilité certaine.
        availability: availabilityFrom(mission.ends_on, today, mission.renewal_status),
        declaredOn: declaredAvailability(
          assigneesOf(mission).map(person => person.id),
          availableFromById,
        ),
        situation: missionSituation(factsOf(mission), today),
      })),
    [frame, searched, t, today, factsOf, availableFromById],
  )

  const drawn = useMemo(() => sortPlacements(rows), [rows])
  const undated = useMemo(() => rows.filter(row => row.placement.kind === 'undated'), [rows])
  const inconsistent = useMemo(() => rows.filter(row => row.placement.kind === 'inconsistent'), [rows])
  const summary = useMemo(
    () =>
      summarizePlanning(
        searched.map(mission => ({ id: mission.id, startedOn: mission.started_on, endsOn: mission.ends_on })),
        frame,
      ),
    [frame, searched],
  )

  /** Les lignes de la frise, groupées : « Par mission » garde l'ordre de la frise, les deux autres
   *  regroupent par compte ou par consultant (la première personne affectée). */
  const groups = useMemo(() => {
    if (groupBy === 'mission') return [{ key: 'all', label: null, rows: drawn }]
    const byKey = new Map<string, typeof drawn>()
    for (const row of drawn) {
      const key =
        groupBy === 'account'
          ? (row.mission.accountName ?? t('unknownAccount'))
          : (assigneeNames(row.mission)[0] ?? t('table.unstaffed'))
      byKey.set(key, [...(byKey.get(key) ?? []), row])
    }
    return [...byKey.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([key, groupRows]) => ({ key, label: key, rows: groupRows }))
  }, [drawn, groupBy, t])

  /** #2194.3 → #4193 — « finit sous 30 jours » lit `missions_ending_30` de
   *  `GET /crm-counters` (UNE définition écrite : missions en cours dont
   *  `ends_on` ∈ J..J+30), le même nombre que partout ailleurs. `null` = non
   *  mesuré (requête en cours ou en échec) : la puce n'est alors pas affichée,
   *  jamais écrite « 0 ». */
  const { data: crmCounters } = useCrmCounters()
  const endingSoonCount = crmCounters?.counters.missions_ending_30.value ?? null

  /** #2194.4 — un indicateur de PORTEFEUILLE, PAS un compte filtré : qui se
   *  libère bientôt ne dépend pas de la fenêtre regardée ni des filtres actifs
   *  (texte/consultant/compte/statut/porteur/disponibilité) — une personne
   *  reste « bientôt disponible » même si SA mission sort du filtre compte en
   *  cours d'ailleurs. Calculé sur `all` (missions actives, non terminées),
   *  jamais sur `searched`. */
  const soonAvailableCount = useMemo(
    () =>
      consultantsAvailableSoon(
        all
          .filter(mission => !isFinishedMission(mission.status))
          .map(mission => ({
            assigneeNames: assigneeNames(mission),
            endsOn: mission.ends_on,
            renewalStatus: mission.renewal_status,
          })),
        today,
      ),
    [all, today],
  )

  /** Théo C missions-planning.R2 / N1 — les tuiles et les cartes d'échéance lisent le PORTEFEUILLE actif,
   *  comme les conflits : elles ne bougent pas quand on change l'échelle de la frise. */
  const deadlineMissions = useMemo<DeadlineMission[]>(
    () =>
      all
        .filter(mission => !isFinishedMission(mission.status))
        .map(mission => ({
          id: mission.id,
          label: mission.label || t('planning.unnamedMission'),
          accountName: mission.accountName ?? null,
          personNames: assigneeNames(mission),
          startedOn: mission.started_on,
          endsOn: mission.ends_on,
        })),
    [all, t],
  )
  const facepile = useMemo(() => {
    const seen = new Map<string, { name: string; photoUrl: string | null }>()
    for (const mission of all.filter(entry => !isFinishedMission(entry.status))) {
      for (const person of assigneesOf(mission)) {
        if (!seen.has(person.fullName)) seen.set(person.fullName, { name: person.fullName, photoUrl: person.photoUrl })
      }
    }
    return [...seen.values()]
  }, [all])

  /**
   * #1375 — CE QUE LAURA REÇOIT.
   *
   * « Laura reçoit la fenêtre temporelle et les filtres actifs. » Sans eux, la
   * question posée devant un planning resserré porterait sur tout le
   * portefeuille : la réponse ne serait pas celle de l'écran qu'on regarde.
   *
   * ⚠️ Elle est PRÉ-REMPLIE, jamais envoyée — `AskLaura` ouvre le composer, le
   * commercial relit et envoie. C'est la doctrine du dépôt, et c'est l'absence
   * de code qui la tient.
   */
  const lauraQuestion = useMemo(() => {
    const active = [
      filters.consultant.length > 0 ? t('planning.laura.onConsultant', { name: filters.consultant.join(', ') }) : null,
      filters.account.length > 0 ? t('planning.laura.onAccount', { name: filters.account.join(', ') }) : null,
      filters.situation.length > 0
        ? t('planning.laura.onStatus', {
            status: filters.situation.map(value => t(`planning.screen.situation.${value}`)).join(', '),
          })
        : null,
      ...chips.map(chip => t('planning.laura.onFacet', { facet: t(`planning.screen.quick.${chip}`) })),
    ].filter((part): part is string => part !== null)
    // ⚠️ La fenêtre s'écrit LISIBLE, pas en ISO : la question part dans le
    // composer, sous les yeux du commercial qui la relit avant de l'envoyer.
    return t('planning.laura.question', {
      from: formatDate(frame.startsOn, { day: 'numeric', month: 'long', year: 'numeric' }) ?? frame.startsOn,
      to: formatDate(frame.endsOn, { day: 'numeric', month: 'long', year: 'numeric' }) ?? frame.endsOn,
      filters: active.length > 0 ? t('planning.laura.filters', { list: active.join(', ') }) : '',
    }).trim()
  }, [t, frame.startsOn, frame.endsOn, filters, chips])

  /** Quelque chose resserre-t-il la liste ? L'état vide ne dit pas la même
   *  chose selon la réponse : « la fenêtre est vide » et « ta recherche ne
   *  trouve rien » envoient chercher deux pannes différentes. */
  const activeFilterCount = countActiveFilters(filters)
  const isNarrowed = query.trim().length > 0 || chips.length > 0 || activeFilterCount > 0

  const clearNarrowing = () => {
    setQuery('')
    setChips([])
    setFilters(emptyPlanningFilters())
  }

  const currentView: PlanningView = {
    filters,
    chips,
    anchor,
    scale,
    groupBy,
    withFinished,
  }

  const monthLabel = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { month: 'short', year: 'numeric', timeZone: 'UTC' })
    return (key: string) => format.format(new Date(`${key}-01T00:00:00.000Z`))
  }, [i18n.language])

  const tableRows = useMemo(
    () => rows.map(row => ({ mission: row.mission, label: row.label, situation: row.situation })),
    [rows],
  )

  return (
    <CustomerPage titleInScreen pageTitle={t('planning.screen.title')}>
      <Box className="min-w-0 space-y-4 py-4">
        {/* Théo missions-planning — l'entête : le titre, une phrase, et les deux gestes de la page. */}
        <Box display="flex" className="flex-wrap items-end justify-between gap-3">
          <Box className="min-w-0">
            {/* Théo .m5-eyebrow / .m5-head h1 — le sur-titre en capitales, puis un grand titre. */}
            <Text
              element="span"
              size="xs"
              weight="semibold"
              color="text-[var(--bellum-text-muted)]"
              className="mb-2 block uppercase tracking-widest"
            >
              {t('planning.screen.eyebrow')}
            </Text>
            <Text element="h1" className={TYPE_SCALE.pageTitle}>
              {t('planning.screen.title')}
            </Text>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
              {t('planning.screen.subtitle')}
            </Text>
          </Box>
          {/* #4351.1 — « En cours » a quitté la barre (Louis, 19/10/2026) : rien
              n'est perdu, la liste et la création se joignent d'ici. */}
          <Box display="flex" className="flex-wrap items-center gap-2">
            {/* #4654 — « Comment travailler ici ? » sur la rangée du titre, à gauche des gestes. */}
            <ScreenGuideSlot />
            <Button asChild size="sm" variant="ghost" className="pointer-coarse:min-h-11">
              <Link to="/missions" search={{ vue: 'liste' }}>
                {t('planning.listLink')}
              </Link>
            </Button>
            {/* Théo C missions-planning.N6 — la sélection courante, en .csv (sortie de données gardée par la règle d'espace). */}
            <PlanningExportButton
              rows={searched.map(mission => ({
                label: mission.label || t('planning.unnamedMission'),
                accountName: mission.accountName ?? null,
                personNames: assigneeNames(mission),
                startedOn: mission.started_on,
                endsOn: mission.ends_on,
              }))}
            />
            <Button type="button" size="sm" className="pointer-coarse:min-h-11" onClick={() => setDialog('create')}>
              <Plus className="size-4" aria-hidden />
              {t('planning.newMission')}
            </Button>
          </Box>
        </Box>

        {/* ⚠️ EMPLACEMENT DES PASTILLES DE QUALITÉ DE DONNÉE (PDF-22 §7). Posé SANS
            données inventées : un décompte fictif serait pire qu'une absence. */}
        <Box data-slot="mission-data-quality-pills" aria-hidden="true" />

        {isLoading ? (
          // ⚠️ Aucun chiffre pendant le chargement. « 0 mission sur la fenêtre »
          // le temps d'une requête envoie chercher une panne qui n'existe pas.
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          // Un échec de lecture ne se rend JAMAIS comme « rien à planifier ».
          <SearchEmptyState title={t('states.errorTitle')} description={t('states.errorDescription')} />
        ) : (
          <>
            <PlanningSummary
              missions={deadlineMissions}
              today={today}
              people={facepile}
              activeChips={chips}
              onToggleChip={chip => setChips(current => toggleChip(current, chip))}
            />

            {/* LA BARRE D'OUTILS : chercher, filtrer, enregistrer une vue, regrouper, changer de vue. */}
            <Box display="flex" className="flex-wrap items-center gap-2">
              <Input
                type="search"
                value={query}
                aria-label={t('planning.search')}
                placeholder={t('planning.screen.searchPlaceholder')}
                onChange={event => setQuery(event.target.value)}
                className="w-full sm:w-72"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setDialog('filters')}
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                {activeFilterCount > 0
                  ? t('planning.screen.toolbar.filtersActive', { count: activeFilterCount })
                  : t('planning.screen.toolbar.filters')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="pointer-coarse:min-h-11"
                onClick={() => setDialog('views')}
              >
                <Bookmark className="size-4" aria-hidden />
                {t('planning.screen.toolbar.views')}
              </Button>
              <Select value={groupBy} onValueChange={next => setGroupBy(next as PlanningGroupBy)}>
                <SelectTrigger
                  aria-label={t('planning.screen.toolbar.groupLabel')}
                  className="pointer-coarse:min-h-11 h-8 w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['mission', 'account', 'consultant'] as const).map(value => (
                    <SelectItem key={value} value={value}>
                      {t(`planning.screen.toolbar.group.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Box
                role="group"
                aria-label={t('planning.screen.toolbar.viewLabel')}
                className="ms-auto flex items-center gap-1 rounded-md border border-border p-0.5"
              >
                {(
                  [
                    ['timeline', GanttChart],
                    ['table', Table2],
                    ['board', Columns3],
                  ] as const
                ).map(([value, Icon]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={mode === value ? 'secondary' : 'ghost'}
                    aria-pressed={mode === value}
                    className="pointer-coarse:min-h-11"
                    onClick={() => setMode(value)}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`planning.screen.toolbar.view.${value}`)}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* LES PASTILLES : les mêmes quatre populations que les tuiles, comptées et cumulées. */}
            <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-2">
              {/* Théo C missions-planning.HT1 — la pastille « Bloquées » : missions dont le dossier ADV est incomplet. */}
              <FilterChips
                multiple
                size="sm"
                ariaLabel={t('planning.blocked.pillLabel')}
                options={[{ value: 'blocked', label: t('planning.blocked.pill') }]}
                values={blockedOnly ? ['blocked'] : []}
                onToggle={() => setBlockedOnly(current => !current)}
              />
              <FilterChips
                multiple
                size="sm"
                ariaLabel={t('planning.screen.quick.label')}
                options={PLANNING_QUICK_CHIPS.map(chip => ({
                  value: chip,
                  label: t(`planning.screen.quick.${chip}`),
                  hint: t(`planning.screen.quick.hint.${chip}`),
                  count: chipCounts[chip],
                }))}
                values={chips}
                onToggle={chip => setChips(current => toggleChip(current, chip))}
              />
              <Box display="flex" className="items-center gap-2">
                <Checkbox
                  id="planning-with-finished"
                  checked={withFinished}
                  onCheckedChange={checked => setWithFinished(checked === true)}
                />
                <Label htmlFor="planning-with-finished">{t('planning.includeFinished')}</Label>
              </Box>
              {isNarrowed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:min-h-11"
                  onClick={clearNarrowing}
                >
                  {t('planning.screen.quick.reset')}
                </Button>
              ) : null}
              {/* #1375 — Laura reçoit la FENÊTRE et les filtres actifs : sans eux,
                  la question posée depuis un planning resserré porterait sur tout
                  le portefeuille, et sa réponse ne serait pas celle de l'écran.
                  Le BANDEAU proactif reste en attente d'arbitrage (Q2 du 04/09) —
                  seul le bouton est livré. */}
              <Box className="ms-auto">
                <AskLaura question={lauraQuestion} label={t('planning.laura.label')} />
              </Box>
            </Box>

            {/* #2194.3, #2194.4 — TRANCHÉ 16/09/2026 (Louis) : « tout ajouter, en dur ». Deux faits en
                TEXTE — ni l'un ni l'autre ne filtre : le premier est un indicateur de PORTEFEUILLE. */}
            <Box display="flex" className="flex-wrap items-center gap-x-3 gap-y-1">
              <Text element="span" size="sm" weight="medium">
                {t('planning.summary.visible', { count: summary.visible })}
              </Text>
              {endingSoonCount !== null ? (
                <Text size="xs" color="text-[var(--bellum-text-muted)]">
                  {t('planning.summary.endingSoon', { count: endingSoonCount })}
                </Text>
              ) : null}
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('planning.summary.soonAvailable', { count: soonAvailableCount })}
              </Text>
              {/* #2194.7 / #2194.43 — LE VIVIER ENTIER, CROISÉ AU PLANNING. Ce lien
                  MÈNE au vivier, qui porte déjà l'écran complet des personnes en
                  intercontrat, plutôt que d'en refaire un second ici (GA-26). */}
              <Link to="/consultants" className="text-xs text-[var(--bellum-text-accent)] hover:underline">
                {t('planning.summary.intercontract', { count: intercontractCount })}
              </Link>
            </Box>

            {/* #2194.6 — « on n'affiche pas ce qu'on n'a pas » : AUCUNE ligne
                quand il n'y a rien à signaler. Un score n'est jamais nu : le total
                s'accompagne de ses axes, ceux qui existent seulement. */}
            {conflictCounts.total > 0 ? (
              // Théo — un conflit se signale SUR sa ligne (pastille « ! ») ; ici, une seule ligne de
              // décompte, sans bandeau plein qui volerait la hiérarchie au planning.
              <Box data-slot="planning-conflicts" display="flex" className="flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="warning" aria-hidden>
                  !
                </Badge>
                <Text element="span" size="sm" weight="medium" color="text-[var(--warning-soft-text)]">
                  {t('planning.summary.conflicts', { count: conflictCounts.total })}
                </Text>
                <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                  {[
                    conflictCounts.overlap > 0
                      ? t('planning.summary.conflictKinds.overlap', { count: conflictCounts.overlap })
                      : null,
                    conflictCounts.gap > 0
                      ? t('planning.summary.conflictKinds.gap', { count: conflictCounts.gap })
                      : null,
                    conflictCounts.unstaffedStart > 0
                      ? t('planning.summary.conflictKinds.unstaffedStart', { count: conflictCounts.unstaffedStart })
                      : null,
                    conflictCounts.undated > 0
                      ? t('planning.summary.conflictKinds.undated', { count: conflictCounts.undated })
                      : null,
                    conflictCounts.overallocation > 0
                      ? t('planning.summary.conflictKinds.overallocation', { count: conflictCounts.overallocation })
                      : null,
                  ]
                    .filter((part): part is string => part !== null)
                    .join(' · ')}
                </Text>
              </Box>
            ) : null}

            {!withFinished && finishedCount > 0 ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('planning.finishedHidden', { count: finishedCount })}
              </Text>
            ) : null}

            {all.length >= MISSION_LIST_CAP ? (
              <Box className="rounded-md border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] p-3">
                <Text size="xs" color="text-[var(--warning-soft-text)]">
                  {t('planning.truncated', { count: MISSION_LIST_CAP })}
                </Text>
              </Box>
            ) : null}

            {blockedOnly ? (
              <PlanningBlockedPanel now={now} onClear={() => setBlockedOnly(false)} />
            ) : (
              <>
                {mode === 'timeline' ? (
                  <>
                    <section
                      data-slot="planning-panel"
                      className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6"
                      aria-label={t('planning.screen.calendar.title')}
                    >
                      <Box display="flex" className="flex-wrap items-start justify-between gap-3">
                        <Box>
                          <Text element="h2" className={TYPE_SCALE.sectionTitle}>
                            {t('planning.screen.calendar.title')}
                          </Text>
                          <Text size="sm" color="text-[var(--bellum-text-muted)]">
                            {t('planning.screen.calendar.range', {
                              from: monthLabel(frame.months[0]?.key ?? ''),
                              to: monthLabel(frame.months[frame.months.length - 1]?.key ?? ''),
                            })}
                          </Text>
                        </Box>
                        <Box display="flex" className="flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={t('planning.previousWindow')}
                            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                            onClick={() => setAnchor(current => shiftMonth(current, -1))}
                          >
                            <ChevronLeft className="size-4" aria-hidden />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="pointer-coarse:min-h-11"
                            onClick={() => setAnchor(shiftMonth(monthOf(now), -1))}
                          >
                            {t('planning.today')}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={t('planning.nextWindow')}
                            className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                            onClick={() => setAnchor(current => shiftMonth(current, 1))}
                          >
                            <ChevronRight className="size-4" aria-hidden />
                          </Button>
                          {/* Théo — l'échelle est un sélecteur (« 4 mois »), à droite de la navigation. */}
                          <Select value={String(scale)} onValueChange={next => setScale(Number(next) === 6 ? 6 : 4)}>
                            <SelectTrigger
                              aria-label={t('planning.scale.label')}
                              className="pointer-coarse:min-h-11 h-8 w-28"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLANNING_SCALES.map(months => (
                                <SelectItem key={months} value={String(months)}>
                                  {t('planning.scale.option', { count: months })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Box>
                      </Box>
                      {drawn.length > 0 ? (
                        <>
                          <Timeline
                            frame={frame}
                            monthLabel={monthLabel}
                            groups={groups}
                            todayLabel={t('planning.todayMarker')}
                            todayPercent={todayPercent}
                            availabilityHeader={t('planning.screen.calendar.after')}
                            onOpen={setSelected}
                            overallocationByPerson={overallocationByPerson}
                            conflictedIds={conflictedIds}
                          />
                          <PlanningLegend hasConflicts={conflictedIds.size > 0} />
                        </>
                      ) : isNarrowed ? (
                        // #1374 — un filtre qui vide la frise doit se DÉFAIRE d'ici.
                        <SearchEmptyState
                          title={t('planning.searchEmptyTitle')}
                          description={t('planning.searchEmptyDescription')}
                          action={
                            <Button type="button" size="sm" variant="outline" onClick={clearNarrowing}>
                              {t('planning.searchEmptyCta')}
                            </Button>
                          }
                        />
                      ) : (
                        <SearchEmptyState
                          title={t('planning.emptyTitle')}
                          description={t('planning.emptyDescription')}
                          action={
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setAnchor(shiftMonth(monthOf(now), -1))}
                            >
                              {t('planning.emptyCta')}
                            </Button>
                          }
                        />
                      )}
                    </section>

                    <AsideBlock
                      title={t('planning.undated.title')}
                      description={t('planning.undated.description')}
                      rows={undated}
                      onOpen={setSelected}
                    />
                    <AsideBlock
                      title={t('planning.inconsistent.title')}
                      description={t('planning.inconsistent.description')}
                      rows={inconsistent}
                      onOpen={setSelected}
                    />
                    {summary.outside > 0 ? (
                      <Box className="rounded-md border border-border bg-card p-3">
                        <Text element="span" size="sm" weight="medium">
                          {t('planning.outside.title')}
                        </Text>
                        <Text size="xs" color="text-[var(--bellum-text-muted)]">
                          {t('planning.outside.description', { count: summary.outside })}
                        </Text>
                      </Box>
                    ) : null}
                  </>
                ) : null}

                {mode === 'table' ? (
                  tableRows.length > 0 ? (
                    <PlanningTable rows={tableRows} onOpen={setSelected} />
                  ) : (
                    <SearchEmptyState
                      title={t('planning.searchEmptyTitle')}
                      description={t('planning.searchEmptyDescription')}
                      action={
                        <Button type="button" size="sm" variant="outline" onClick={clearNarrowing}>
                          {t('planning.searchEmptyCta')}
                        </Button>
                      }
                    />
                  )
                ) : null}

                {mode === 'board' ? <PlanningBoard /> : null}

                {/* #4291.8 — les projets SIGNÉS se suivent ici, en régie comme en forfait / conseil (#4270.4). */}
                <PlanningSignedProjects />
                <PlanningDeadlines missions={deadlineMissions} today={today} intercontractCount={intercontractCount} />
              </>
            )}
          </>
        )}
      </Box>

      {selected && !panelOpen ? (
        <PlanningPeekDialog
          mission={selected}
          today={today}
          onClose={() => setSelected(undefined)}
          onMore={() => setPanelOpen(true)}
        />
      ) : null}
      {selected && panelOpen ? (
        <MissionDetailPanel
          mission={selected}
          onClose={() => {
            setPanelOpen(false)
            setSelected(undefined)
          }}
        />
      ) : null}

      {dialog === 'filters' ? (
        <PlanningFiltersDialog
          open
          onOpenChange={open => !open && setDialog(null)}
          filters={filters}
          options={filterOptions}
          onApply={setFilters}
        />
      ) : null}
      {dialog === 'views' ? (
        <PlanningViewsDialog
          open
          onOpenChange={open => !open && setDialog(null)}
          current={currentView}
          onApply={view => {
            setFilters(view.filters)
            setChips(view.chips)
            setAnchor(view.anchor ?? shiftMonth(monthOf(now), -1))
            setScale(view.scale)
            setGroupBy(view.groupBy)
            setWithFinished(view.withFinished)
          }}
        />
      ) : null}
      {dialog === 'create' ? <PlanningCreateDialog open onOpenChange={open => !open && setDialog(null)} /> : null}
    </CustomerPage>
  )
}

/** Cocher une pastille qui l'est déjà la retire : le même geste des deux côtés (tuile et barre). */
function toggleChip(current: readonly PlanningQuickChip[], chip: PlanningQuickChip): PlanningQuickChip[] {
  return current.includes(chip) ? current.filter(other => other !== chip) : [...current, chip]
}

/**
 * Le plafond DUR de `GET /delivery/missions` — 200 lignes, sans pagination.
 *
 * Recopié ici parce que le serveur ne le dit pas dans sa réponse : le seul
 * signal disponible est « j'ai reçu exactement le plafond ». C'est une
 * heuristique, et elle est volontairement prudente — elle peut prévenir pour
 * rien sur un espace à exactement 200 missions, ce qui est infiniment moins
 * grave que de taire une frise amputée.
 */
const MISSION_LIST_CAP = 200

/** #2194.28 — l'ordre de lecture du filtre de disponibilité : du plus proche
 *  au plus lointain, l'inconnu en dernier (ce n'est pas une distance). */
const AVAILABILITY_BUCKETS: readonly AvailabilityBucket[] = ['now', 'soon', 'later', 'unknown']

/**
 * La teinte d'une barre selon la SITUATION de la mission (maquette : « En cours », « Fin à
 * anticiper », « Démarrage prévu »). La couleur ne porte JAMAIS le sens seule : la situation est
 * aussi ÉCRITE sur la ligne, en toutes lettres, et la légende nomme chaque teinte.
 *
 * Les teintes « à anticiper » et « prévu » utilisent les jetons doux (contraste AA, deux thèmes) ;
 * une mission terminée se grise — elle n'a plus rien à anticiper.
 */
const BAR_TONE: Record<MissionSituation | 'finished', string> = {
  // Théo .m5-bar.purple — un dégradé lavande, jamais l'aplat primaire saturé (réservé aux gestes).
  running:
    'border-[var(--bellum-accent-line)] bg-gradient-to-r from-[var(--bellum-accent-line)] to-[var(--bellum-accent-bg)] text-[var(--bellum-text-primary)]',
  renewal: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  ending: 'border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
  starting:
    'border border-dashed border-[var(--accent-soft-text)] bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
  finished: 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
}
const SITUATION_BADGE = {
  running: 'success',
  renewal: 'warning',
  starting: 'primary',
  ending: 'warning',
} as const satisfies Record<MissionSituation, 'success' | 'warning' | 'primary'>

/** La hachure d'un bord OUVERT — « ce bord n'est pas une date ». Écrite en
 *  style parce qu'aucune classe utilitaire ne porte un dégradé répété. */
const OPEN_EDGE = {
  backgroundImage: 'repeating-linear-gradient(115deg, var(--bellum-surface-1) 0 2px, transparent 2px 6px)',
} as const

type PlanningRow = {
  mission: MissionView
  label: string
  placement: MissionPlacement
  availability: MissionAvailability
  /** La date de disponibilité DÉCLARÉE sur la fiche d'une personne affectée — elle gagne sur la fin. */
  declaredOn: string | null
  situation: MissionSituation
}

/**
 * LA LARGEUR DE LA COLONNE DE DROITE — #1372, #1373.
 *
 * Elle vit ici parce que l'ENTÊTE et les LIGNES doivent la partager au pixel :
 * deux valeurs écrites séparément décaleraient la colonne des mois d'un rendu à
 * l'autre. C'est la même raison que la colonne de gauche, deux lignes plus bas.
 */
const SIDE_COLUMN = 'w-44 shrink-0 md:w-52'

/**
 * Théo C missions-planning.A8 — LA LÉGENDE : trois teintes, la pastille « ! », et la règle de la date.
 * La couleur ne porte jamais le sens seule : chaque entrée est écrite.
 */
function PlanningLegend({ hasConflicts }: { hasConflicts: boolean }) {
  const { t } = useTranslation('missions')
  const entries: readonly { tone: string; label: string }[] = [
    { tone: BAR_TONE.running, label: t('planning.legend.active') },
    { tone: BAR_TONE.ending, label: t('planning.legend.ending') },
    { tone: BAR_TONE.starting, label: t('planning.legend.starting') },
  ]
  return (
    <Box
      className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border pt-3"
      data-slot="planning-legend"
    >
      <ul aria-label={t('planning.legend.label')} className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {entries.map(entry => (
          <li key={entry.label} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-3 w-5 rounded-sm ${entry.tone}`} />
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {entry.label}
            </Text>
          </li>
        ))}
        {hasConflicts ? (
          <li className="flex items-center gap-1.5">
            <Badge variant="warning" aria-hidden>
              !
            </Badge>
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {t('planning.legend.conflict')}
            </Text>
          </li>
        ) : null}
      </ul>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('planning.legend.endIsNotAvailability')}
      </Text>
    </Box>
  )
}

function Timeline({
  frame,
  monthLabel,
  groups,
  todayLabel,
  todayPercent,
  availabilityHeader,
  onOpen,
  overallocationByPerson,
  conflictedIds,
}: {
  frame: PlanningWindow
  monthLabel: (key: string) => string
  groups: readonly { key: string; label: string | null; rows: PlanningRow[] }[]
  todayLabel: string
  todayPercent: number | null
  availabilityHeader: string
  onOpen: (mission: MissionView) => void
  overallocationByPerson: ReadonlyMap<string, number>
  conflictedIds: ReadonlySet<string>
}) {
  // #2194.44 — seuil de 6 px, même raison que le Kanban des projets
  // (`PipelineBoard.tsx`) : sans lui, le clic qui ouvre le panneau est
  // interprété comme un glissement dès le premier pixel de mouvement.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  return (
    // ⚠️ UN SEUL conteneur défilant, et il porte l'entête ET les lignes : deux
    // conteneurs feraient glisser les mois sans les barres. Le débordement
    // défile ICI, jamais dans le corps de la page.
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <Box className={cn('-mx-4 overflow-x-auto md:mx-0', HORIZONTAL_OVERSCROLL_CLASS)}>
      {/* ⚠️ La largeur minimale a MONTÉ avec la troisième colonne (#1373) : à
          52 rem, les deux colonnes latérales (16 + 13 rem) ne laissaient plus
          que 23 rem aux mois — 3,8 rem par mois sur l'échelle à six, où
          l'entête « sept. 2026 » ne tient pas. Le débordement défile ICI, dans
          ce conteneur et nulle part ailleurs. */}
      <Box className="min-w-[64rem]">
        <Box display="flex" className="items-stretch border-b border-border">
          <Box className="sticky left-0 z-10 w-56 shrink-0 border-r border-border bg-card px-3 py-2 md:w-64" />
          {/* `data-slot` : depuis #1373 la colonne de droite écrit elle aussi des
              mois (« Disponible à partir du 21 sept. »). Sans repère, une
              vérification des entêtes de mois attraperait les deux. */}
          <Box data-slot="planning-months" className="relative flex min-w-0 flex-1">
            {frame.months.map(month => (
              // ⚠️ La largeur vient des JOURS du mois, jamais d'un quart de la
              // fenêtre : février décalerait l'entête de trois jours par rapport
              // aux barres, qui se placent au jour près.
              <Box
                key={month.key}
                className="border-l border-border px-2 py-2 first:border-l-0"
                style={{ width: `${month.widthPercent}%` }}
              >
                <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                  {monthLabel(month.key)}
                </Text>
              </Box>
            ))}
            {todayPercent === null ? null : (
              <Box
                className="pointer-events-none absolute inset-y-0 flex items-end"
                style={{ left: `${todayPercent}%` }}
              >
                <Text
                  element="span"
                  size="xs"
                  color="text-[var(--bellum-text-accent)]"
                  className="-translate-x-1/2 whitespace-nowrap px-1"
                >
                  {todayLabel}
                </Text>
              </Box>
            )}
          </Box>
          {/* #1373 — la disponibilité a sa COLONNE, pas un coin de la piste.
              C'est ce qui règle #1372 par la même occasion : plus rien ne se
              pose au-dessus d'une barre, donc plus rien ne peut l'écraser. */}
          <Box className={`${SIDE_COLUMN} border-l border-border px-3 py-2`}>
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
              {availabilityHeader}
            </Text>
          </Box>
        </Box>

        <DndContext sensors={sensors}>
          {groups.map(group => (
            <Fragment key={group.key}>
              {/* « Par compte » / « Par consultant » : un intertitre par groupe, la frise reste la même. */}
              {group.label === null ? null : (
                <Box className="border-b border-border bg-[var(--bellum-surface-2)] px-3 py-1.5">
                  <Text element="h3" size="sm" weight="semibold">
                    {group.label}
                  </Text>
                </Box>
              )}
              {group.rows.map(row => (
                <TimelineRow
                  key={row.mission.id}
                  row={row}
                  todayPercent={todayPercent}
                  onOpen={onOpen}
                  totalDays={frame.totalDays}
                  overallocationByPerson={overallocationByPerson}
                  conflictedIds={conflictedIds}
                />
              ))}
            </Fragment>
          ))}
        </DndContext>
      </Box>
    </Box>
  )
}

/**
 * UNE LIGNE DE LA FRISE — #1371, #1372, #1373.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1372 — POURQUOI LE TEXTE A QUITTÉ LA PISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut a été VU en production, pas trouvé par un test : « Commencée avant
 * la fenêtre. Sans date de fin — le bord droit de la barre n'est pas une
 * échéance. » s'écrivait en clair par-dessus la barre violette, illisible. La
 * cause était structurelle et pas cosmétique — les phrases vivaient DANS la
 * piste, en `ms-auto`, donc au-dessus du dessin dès que la barre s'étendait à
 * droite. Aucune taille de police n'aurait réglé ça.
 *
 * La piste ne porte donc plus que le DESSIN. Ce qui reste sur la ligne est un
 * libellé COURT — « Début avant période », « Fin inconnue » — dans la colonne
 * de droite ; la phrase entière, celle qui explique la règle, passe en
 * infobulle, exactement comme le retour le demande.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DEUX ANOMALIES DE BORD NE SE DESSINENT TOUJOURS PAS PAREIL
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est la règle qui gouverne tout cet écran, et elle survit à la refonte :
 *  - **bord ROGNÉ** (la date existe, elle est hors champ) → un CHEVRON, parce
 *    que ça continue et qu'on sait où ;
 *  - **bord OUVERT** (aucune date) → la HACHURE COURTE, parce que ce bord n'est
 *    pas une date.
 * Le retour demande exactement ces deux signes, et l'un ne remplace pas
 * l'autre : les confondre ferait lire « ça continue » sur une mission dont
 * personne n'a promis la suite.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1371 — LE LOGO ET L'AVATAR SONT DÉCORATIFS, ET C'EST VOULU
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour demande « le logo ouvre la fiche Compte, l'avatar ouvre le profil
 * consultant ». La ligne EST déjà un `<button>` qui ouvre la mission : y
 * imbriquer deux liens produirait un bouton dans un bouton — HTML invalide, un
 * ordre de tabulation que personne ne peut prévoir, et trois cibles de moins de
 * 44 px empilées sur la même ligne (GA-30, GA-35). Les images restent donc
 * `aria-hidden` — le NOM porte l'information, comme sur `/missions` — et le
 * panneau de mission, qui s'ouvre au clic, porte déjà les liens vers le compte
 * et vers la personne.
 */
function TimelineRow({
  row,
  todayPercent,
  onOpen,
  totalDays,
  overallocationByPerson,
  conflictedIds,
}: {
  row: PlanningRow
  todayPercent: number | null
  onOpen: (mission: MissionView) => void
  /** Le dénominateur de {@link pixelsToDayDelta} — la fenêtre entière, en
   *  jours, pour convertir un déplacement en pixels sur CETTE piste. */
  totalDays: number
  overallocationByPerson: ReadonlyMap<string, number>
  conflictedIds: ReadonlySet<string>
}) {
  // ⚠️ Le corps qui suit appelle des Hooks (`useDraggable`, `useDndMonitor`…) :
  // ils doivent être appelés dans le MÊME ORDRE à chaque rendu (règle React),
  // ce qu'un retour anticipé juste au-dessus interdirait structurellement.
  // `TimelineBarRow` les porte tous, après le seul retour possible — celui-ci,
  // SANS aucun Hook avant lui.
  if (row.placement.kind !== 'bar') return null
  return (
    <TimelineBarRow
      row={row}
      placement={row.placement}
      todayPercent={todayPercent}
      onOpen={onOpen}
      totalDays={totalDays}
      overallocationByPerson={overallocationByPerson}
      conflictedIds={conflictedIds}
    />
  )
}

function TimelineBarRow({
  row,
  placement,
  todayPercent,
  onOpen,
  totalDays,
  overallocationByPerson,
  conflictedIds,
}: {
  row: PlanningRow
  placement: Extract<MissionPlacement, { kind: 'bar' }>
  todayPercent: number | null
  onOpen: (mission: MissionView) => void
  totalDays: number
  overallocationByPerson: ReadonlyMap<string, number>
  conflictedIds: ReadonlySet<string>
}) {
  const { t } = useTranslation('missions')
  const tone = isFinishedMission(row.mission.status) ? BAR_TONE.finished : BAR_TONE[row.situation]
  const people = assigneesOf(row.mission)
  const draggable = canDragMission(placement)

  /** #2989.2 — le PIRE cumul parmi les personnes de CETTE ligne : deux
   *  affectés suralloués sur la même mission n'affichent qu'UN badge, celui de
   *  la charge la plus haute, jamais deux nombres sur la même ligne. */
  const overallocatedPercent = people.reduce<number | null>((worst, person) => {
    const percent = overallocationByPerson.get(person.fullName)
    if (percent === undefined) return worst
    return worst === null ? percent : Math.max(worst, percent)
  }, null)

  /**
   * Les anomalies de bord, en court sur la ligne et en entier en infobulle.
   *
   * ⚠️ **`openEnd` n'y est PAS, et c'est délibéré.** La colonne de droite écrit
   * déjà « Fin inconnue » pour exactement ce cas (#1373) : l'ajouter ici
   * mettrait le même mot deux fois sur la même ligne, à trois centimètres
   * d'écart — « rien n'apparaît deux fois sous la même forme avec le même
   * contenu » (loi 4 du tome 7). La règle complète reste lisible : elle est en
   * infobulle sur ce libellé-là, et sur la barre.
   *
   * `clippedEnd` reste : « Fin après période » dit que la date existe hors
   * champ, ce que la disponibilité ne dit pas — les deux se complètent.
   */
  const notes = [
    placement.openStart ? { long: t('planning.bar.openStart'), short: t('planning.bar.shortOpenStart') } : null,
    placement.clippedStart
      ? { long: t('planning.bar.clippedStart'), short: t('planning.bar.shortClippedStart') }
      : null,
    placement.clippedEnd ? { long: t('planning.bar.clippedEnd'), short: t('planning.bar.shortClippedEnd') } : null,
  ].filter((note): note is { long: string; short: string } => note !== null)

  /** L'infobulle de la BARRE porte tout, `openEnd` compris : c'est elle qui
   *  explique le bord hachuré qu'on a sous les yeux. */
  const barTitle = [...notes.map(note => note.long), placement.openEnd ? t('planning.bar.openEnd') : null]
    .filter((phrase): phrase is string => phrase !== null)
    .join(' ')

  /**
   * #2194.44 — GLISSER LA BARRE, AVEC APERÇU.
   *
   * `@dnd-kit/core` est déjà une dépendance (`PipelineBoard.tsx` du Kanban
   * projets en porte l'unique autre usage) — aucun mécanisme de glissement
   * n'existait sur CE Gantt. Trois refus assumés, mêmes raisons que
   * {@link canDragMission} :
   *
   *  - seule une barre aux DEUX bords connus et dans le champ se glisse —
   *    glisser un bord ouvert ou rogné déplacerait une date inventée ou
   *    invisible ;
   *  - la piste (`trackRef`) mesure sa propre largeur au dépôt, jamais une
   *    largeur devinée : `pixelsToDayDelta` a besoin du pixel RÉEL ;
   *  - l'écriture réutilise `useUpdateMission` (déjà le chemin de
   *    `MissionDateField`, panneau latéral) — aucune route n'est ajoutée,
   *    seul un troisième appelant se branche sur le même écrivain de dates ;
   *  - #2989.1 (recette 26/09, « aucun déplacement ») — le dépôt du pointeur
   *    n'écrit JAMAIS seul : il POSE un déplacement en attente, et c'est le
   *    geste de confirmation (bouton « Déplacer ») qui déclenche le PATCH.
   *    Même doctrine que partout ailleurs (« une écriture passe par une
   *    porte ») — glisser une barre n'y fait pas exception.
   */
  const trackRef = useRef<HTMLSpanElement | null>(null)
  const [previewDeltaDays, setPreviewDeltaDays] = useState(0)
  const [pendingDeltaDays, setPendingDeltaDays] = useState<number | null>(null)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.mission.id,
    disabled: !draggable,
  })
  const updateMission = useUpdateMission(row.mission.id)

  /**
   * #2989 (recette 27/09) — « glisser une barre bloquée n'a AUCUN effet
   * visible ». Le blocage lui-même est correct — {@link canDragMission}
   * refuse tout bord OUVERT ou ROGNÉ pour ne jamais inventer une date — mais
   * un geste qui ne produit RIEN, ni mouvement ni message, se lit comme un
   * bouton cassé, pas comme une règle. `blockReason` NOMME cette règle,
   * `notifyDragBlocked` la rend audible sur le geste qui l'a déclenchée
   * (clic, Entrée/Espace, ou une flèche) — jamais une date inventée.
   */
  const blockReason = draggable ? null : dragBlockReason(placement)
  const notifyDragBlocked = () => {
    if (!blockReason) return
    toast.info(t('planning.bar.dragBlocked', { reason: t(`planning.bar.${blockReason}`) }))
  }

  useDndMonitor({
    onDragMove: event => {
      if (event.active.id !== row.mission.id) return
      const width = trackRef.current?.clientWidth ?? 0
      setPreviewDeltaDays(pixelsToDayDelta(event.delta.x, width, totalDays))
    },
    onDragEnd: event => {
      if (event.active.id !== row.mission.id) return
      const width = trackRef.current?.clientWidth ?? 0
      const deltaDays = pixelsToDayDelta(event.delta.x, width, totalDays)
      if (deltaDays === 0 || !draggable) {
        setPreviewDeltaDays(0)
        return
      }
      // ⚠️ `previewDeltaDays` RESTE affiché — c'est lui que la confirmation
      // montre. Il ne repasse à 0 qu'au clavier « Déplacer » ou « Annuler ».
      setPendingDeltaDays(deltaDays)
    },
  })

  const confirmShift = () => {
    if (pendingDeltaDays === null) return
    updateMission.mutate({
      startedOn: shiftDateByDays(row.mission.started_on as string, pendingDeltaDays),
      endsOn: shiftDateByDays(row.mission.ends_on as string, pendingDeltaDays),
    })
    setPendingDeltaDays(null)
    setPreviewDeltaDays(0)
  }

  const cancelShift = () => {
    setPendingDeltaDays(null)
    setPreviewDeltaDays(0)
  }

  /**
   * #2989.3 — GLISSER AU CLAVIER, PAS SEULEMENT AU POINTEUR.
   *
   * `PointerSensor` (seul capteur monté sur `DndContext`, `Timeline` plus
   * haut) ne répond à aucune touche : une barre déplaçable à la souris et
   * inatteignable au clavier échoue la même promesse que GA-35 tient déjà
   * pour la ligne (« ce qui se clique se tabule »). Même porte que le
   * pointeur — AUCUNE touche n'écrit seule : chaque flèche AJUSTE l'aperçu et
   * (re)pose la confirmation en attente, seul « Déplacer » (clic ou Entrée)
   * déclenche le PATCH, exactement `confirmShift` ci-dessus.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!draggable) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        notifyDragBlocked()
      }
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const base = pendingDeltaDays === null ? 0 : pendingDeltaDays
      const nextDelta = base + (event.key === 'ArrowRight' ? 1 : -1)
      setPreviewDeltaDays(nextDelta)
      setPendingDeltaDays(nextDelta === 0 ? null : nextDelta)
      return
    }
    if (pendingDeltaDays === null) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelShift()
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      confirmShift()
    }
  }

  const dragPreviewLabel =
    (isDragging || pendingDeltaDays !== null) && previewDeltaDays !== 0
      ? t('planning.bar.dragPreview', {
          start: formatDate(shiftDateByDays(row.mission.started_on as string, previewDeltaDays)),
          end: formatDate(shiftDateByDays(row.mission.ends_on as string, previewDeltaDays)),
        })
      : null

  return (
    // #2194.33, #2194.34, #2194.35 — DÉCISION LOUIS 21/09/2026 : la ligne
    // reste UN `<button>` (GA-35 interdit le bouton dans un bouton), les
    // actions arrivent par un bouton « … » HORS de la zone cliquable. Le
    // `<div>` ici est le SEUL changement structurel : il porte la bordure que
    // le `<button>` portait seul avant, et rend les deux boutons SIBLINGS,
    // jamais imbriqués.
    <div className="flex w-full items-stretch border-b border-border last:border-b-0">
      {/* ⚠️ Un `<button>`, jamais un `<div onClick>` : sans lui, la ligne n'a
          ni tabulation, ni Entrée, ni annonce (GA-35). #2194.44 — il ne
          porte plus que la colonne de gauche : la PISTE, juste après, est
          sortie du bouton pour devenir sa propre zone de glissement (GA-35
          interdit toujours le bouton dans un bouton — deux SIBLINGS, jamais
          imbriqués, même raison que le bouton « … » plus bas). */}
      <button
        type="button"
        aria-label={t('planning.openRow', { label: row.label })}
        onClick={() => onOpen(row.mission)}
        className="pointer-coarse:min-h-11 flex shrink-0 items-stretch text-left hover:bg-[var(--bg-surface-hover)]"
      >
        <span className="sticky left-0 z-10 flex w-56 shrink-0 flex-col justify-center gap-1 border-r border-border bg-card px-3 py-2 md:w-64">
          {/* Théo missions-planning — la voie se lit PAR PERSONNE : le visage, le nom, puis le compte.
              Le nom de la MISSION est écrit sur la barre. `[]` veut dire « personne n'est affecté »
              — une alerte ; `null` veut dire « la lecture a échoué » — une panne : les replier l'un
              sur l'autre ferait chercher un consultant là où il faut relancer une requête. */}
          {row.mission.assignees === null || row.mission.assignees === undefined ? (
            <UnknownValue reason={t('table.staffingUnread')} />
          ) : (
            <span className="flex min-w-0 items-center gap-2">
              {people.length > 0 ? (
                <ContactAvatar name={people[0]?.fullName} photoUrl={people[0]?.photoUrl} size="sm" />
              ) : row.mission.accountName ? (
                <CompanyAvatar
                  name={row.mission.accountName}
                  logoUrl={row.mission.accountLogoUrl}
                  website={row.mission.accountWebsite}
                />
              ) : null}
              <span className="flex min-w-0 flex-col">
                <Text element="span" size="sm" weight="semibold" className="line-clamp-2 break-words">
                  {people.length > 0
                    ? assigneeNames(row.mission).join(' · ')
                    : /* #3547 — un forfait encadré dit son rôle, il n'est pas « sans personne ». */
                      (supervisedForfaitLabel(row.mission) ?? t('table.unstaffed'))}
                </Text>
                <Text
                  element="span"
                  size="xs"
                  color="text-[var(--bellum-text-muted)]"
                  className="line-clamp-2 break-words"
                  title={row.mission.accountName ?? t('unknownAccount')}
                >
                  {row.mission.accountName ?? t('unknownAccount')}
                </Text>
              </span>
            </span>
          )}
          {/* #2194.11 — le rôle, en clair. Absent = aucune ligne (« on n'affiche pas ce qu'on n'a pas »). */}
          {row.mission.role_title ? (
            <Text
              element="span"
              size="xs"
              color="text-[var(--bellum-text-muted)]"
              className="line-clamp-2 break-words"
              title={row.mission.role_title}
            >
              {row.mission.role_title}
            </Text>
          ) : null}
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={SITUATION_BADGE[row.situation]}>{t(`planning.screen.situation.${row.situation}`)}</Badge>
            {/* #2989.2 — le badge de surallocation, SEULEMENT si elle existe : aucune personne suralloué
                sur cette ligne = aucun badge, jamais un « 0 % » qui mentirait sur une charge saine. */}
            {overallocatedPercent !== null ? (
              <Badge variant="warning">{t('planning.bar.overallocated', { percent: overallocatedPercent })}</Badge>
            ) : null}
            {/* Théo C missions-planning.A8 — la pastille « ! » : un conflit de planning (chevauchement, trou,
                démarrage sans consultant, mission sans date). Nommée, jamais la couleur seule. */}
            {conflictedIds.has(row.mission.id) ? (
              <Badge variant="warning" aria-label={t('planning.legend.conflictAria')}>
                !
              </Badge>
            ) : null}
          </span>
          {/* #2194.17 — le risque, SEULEMENT s'il y en a un. */}
          {row.mission.risks && row.mission.risks.length > 0 ? (
            <MissionRisks status={row.mission.status} risks={row.mission.risks} />
          ) : null}
        </span>
      </button>

      {/* LA PISTE — le DESSIN, et depuis #2194.44 la zone de GLISSEMENT. Plus
          aucun texte ne s'écrase sur la barre (#1372), et elle n'ouvre plus le
          panneau au clic : ce geste vit désormais sur le bouton ci-dessus,
          seul moyen d'avoir les DEUX (ouvrir / glisser) sans bouton imbriqué. */}
      <span ref={trackRef} className="relative flex min-w-0 flex-1 items-center py-3">
        {/* #2989.3 — LA ZONE DE GLISSEMENT ET LE DESSIN SE SÉPARENT.
            `setNodeRef`/`listeners`/`attributes` (donc le focus clavier et le
            pointeur) vivent sur CETTE poignée, haute de 44 px (GA-35 : une
            cible ne descend jamais sous ce plancher) — le DESSIN, fin de 3
            (`h-3`), reste centré dedans, inchangé à l'écran. Élargir le
            `h-3` lui-même aurait épaissi la barre pour tout le monde ; la
            séparer laisse le tracé identique et grossit seulement ce qui se
            touche ou se tabule. */}
        <span
          ref={setNodeRef}
          {...(draggable ? { ...listeners, ...attributes } : { role: 'button' as const, tabIndex: 0 })}
          onClick={draggable ? undefined : notifyDragBlocked}
          onKeyDown={handleKeyDown}
          aria-label={
            draggable
              ? t('planning.bar.dragHandle', { label: row.label })
              : t('planning.bar.dragBlockedHandle', { label: row.label })
          }
          className={`absolute flex h-11 items-center ${draggable ? 'cursor-grab touch-none' : 'cursor-not-allowed'}`}
          style={{
            left: `${placement.leftPercent}%`,
            width: `${placement.widthPercent}%`,
            transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
          }}
          title={barTitle}
        >
          <span
            aria-hidden
            className={`relative h-10 w-full overflow-hidden rounded-xl border ${tone} ${isDragging ? 'opacity-70' : ''}`}
          >
            {/* Le bord ouvert est HACHURÉ : il ne finit pas, il s'arrête d'être
                connu. Un bord plein au même endroit dirait « ça se termine ici ». */}
            {placement.openStart ? (
              <span aria-hidden className="absolute inset-y-0 left-0 w-5 rounded-l-sm" style={OPEN_EDGE} />
            ) : null}
            {placement.openEnd ? (
              <span aria-hidden className="absolute inset-y-0 right-0 w-5 rounded-r-sm" style={OPEN_EDGE} />
            ) : null}
            {/* Le bord ROGNÉ porte un chevron : la date existe, elle est hors
                champ. La hachure dirait le contraire.

                ⚠️ **DANS la barre, jamais à côté — défaut mesuré en recette le
                04/09/2026.** Les chevrons étaient posés en `-left-4` / `-right-4`,
                c'est-à-dire SEIZE PIXELS EN DEHORS de la barre. Or un bord rogné
                touche par définition le bord de la fenêtre : les treize chevrons
                de l'écran tombaient donc hors de la piste — celui de gauche sous
                la colonne collante, qui porte `bg-card` et `z-10` et le
                recouvrait entièrement, celui de droite à cheval sur la colonne
                « Se libère ». Le signe que #1372 demande n'était rendu nulle
                part, et la barre montrait un bord arrondi PLEIN, c'est-à-dire le
                message exact inverse.

                Aucun test ne pouvait le voir : jsdom ne met rien en page, et une
                garde qui vérifie la présence du composant l'aurait trouvé
                présent. Seule une mesure de position à l'écran le dit.

                La teinte est celle du texte posé SUR un remplissage primaire —
                et le sens ne repose jamais sur elle seule : la colonne de droite
                écrit « Début avant période » en toutes lettres. */}
            {placement.clippedStart ? (
              <ChevronsLeft aria-hidden className="absolute left-0.5 top-1/2 size-3 -translate-y-1/2" />
            ) : null}
            {placement.clippedEnd ? (
              <ChevronsRight aria-hidden className="absolute right-0.5 top-1/2 size-3 -translate-y-1/2" />
            ) : null}
            {/* Théo missions-planning — l'intitulé de la mission SUR la barre, puis sa fin. */}
            <span className="relative z-10 flex h-full min-w-0 items-center justify-between gap-2 px-3">
              <span className="truncate text-sm font-medium" title={row.label}>
                {row.label}
              </span>
              {/* Théo .m5-bar-date — la fin dans une pastille contrastée, collée au bord droit. */}
              {row.mission.ends_on && !placement.clippedEnd ? (
                <span
                  data-slot="planning-bar-date"
                  className="shrink-0 rounded-badge bg-[var(--bellum-text-primary)] px-1.5 py-0.5 text-xs font-semibold text-[var(--bellum-bg)]"
                >
                  {formatDate(row.mission.ends_on, { day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
              ) : null}
            </span>
          </span>
        </span>
        {todayPercent === null ? null : (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-[var(--bellum-text-accent)]"
            style={{ left: `${todayPercent}%` }}
          />
        )}
        {/* L'APERÇU du glissement — #2194.44. Suit la barre, pas le
              pointeur : la question qu'elle répond est « où ça tombera »,
              pas « où est ma souris ». `size="xs"` = le plancher GA-31, rien
              en dessous.
              #2989.1 — au DÉPÔT, l'aperçu reste affiché mais cesse d'être
              décoratif : il porte la confirmation, seul geste qui écrit. */}
        {dragPreviewLabel && pendingDeltaDays === null ? (
          <Box
            aria-hidden
            className="pointer-events-none absolute -top-6 z-20 whitespace-nowrap rounded border border-border bg-card px-1.5 py-0.5 shadow"
            style={{ left: `${placement.leftPercent}%` }}
          >
            <Text element="span" size="xs">
              {dragPreviewLabel}
            </Text>
          </Box>
        ) : null}
        {dragPreviewLabel && pendingDeltaDays !== null ? (
          <Box
            className="pointer-events-auto absolute -top-8 z-20 flex items-center gap-2 whitespace-nowrap rounded border border-border bg-card px-1.5 py-1 shadow"
            style={{ left: `${placement.leftPercent}%` }}
          >
            <Text element="span" size="xs">
              {dragPreviewLabel}
            </Text>
            <Button type="button" size="xs" variant="default" onClick={confirmShift}>
              {t('planning.bar.confirmShift')}
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={cancelShift}>
              {t('planning.bar.cancelShift')}
            </Button>
          </Box>
        ) : null}
      </span>

      {/* #1373 — QUAND LA PERSONNE SE LIBÈRE, en clair, à droite.
          « Éviter que l'utilisateur soit obligé de lire mentalement la position
          de la barre pour répondre à la question la plus importante. » */}
      <span className={`${SIDE_COLUMN} flex flex-col justify-center gap-0.5 border-l border-border px-3 py-2`}>
        <MissionAvailabilityLabel availability={row.availability} declaredOn={row.declaredOn} />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('planning.screen.calendar.detailOf', { label: row.label })}
          className="pointer-coarse:min-h-11 -ms-2 self-start"
          onClick={() => onOpen(row.mission)}
        >
          {t('planning.screen.calendar.detail')}
        </Button>
        {/* ⚠️ UNE NOTE PAR LIGNE — mesuré en recette le 04/09/2026. Jointes par
            « · », les deux notes d'une barre rognée des DEUX côtés font
            « Début avant période · Fin après période » : ~230 px pour une
            colonne qui en offre 176 (208 au-delà de 768 px). La troncature
            rendait « Fin après … », une phrase coupée au milieu du mot qui
            porte le sens. Empilées, chacune tient. */}
        {notes.map(note => (
          <Text
            key={note.short}
            element="span"
            size="xs"
            color="text-[var(--bellum-text-muted)]"
            className="truncate"
            title={note.long}
          >
            {note.short}
          </Text>
        ))}
      </span>
      {/* #2194.33, #2194.34, #2194.35 — le bouton « … », HORS de la zone
          cliquable ci-dessus, tabulable indépendamment (GA-35 : ce qui se
          clique se tabule). */}
      <RowMissionMenu mission={row.mission} />
    </div>
  )
}

/**
 * LA DISPONIBILITÉ, ÉCRITE — #1373.
 *
 * Trois rendus, et le troisième est celui qui compte : sans date de fin, on
 * n'écrit PAS une disponibilité. « Fin inconnue » est un fait ; « disponible
 * vers novembre » aurait été une estimation, ce que le retour refuse lui-même.
 *
 * #2410.60 (LAU-FINAL-124, NO-GO du chapitre) — et une fin CONNUE ne suffit
 * plus : `now`/`from` portent leur `certainty`, jamais le vert (couleur ET
 * libellé) quand un renouvellement reste OUVERT. Une reconduction SIGNÉE
 * rend `renewed` : `ends_on` ne libère alors plus personne.
 */
function MissionAvailabilityLabel({
  availability,
  declaredOn,
}: {
  availability: MissionAvailability
  declaredOn: string | null
}) {
  const { t } = useTranslation('missions')
  // Point propre MISSIONS-A — la disponibilité DÉCLARÉE sur la fiche gagne sur celle déduite de la fin.
  const declaredReadable = declaredOn
    ? formatDate(declaredOn, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null
  if (declaredReadable) {
    return (
      <>
        <Text element="span" size="xs" weight="semibold" color="text-[var(--success-soft-text)]">
          {t('planning.availability.declared', { date: declaredReadable })}
        </Text>
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('planning.availability.declaredHint')}
        </Text>
      </>
    )
  }
  if (availability.kind === 'unknown') {
    return (
      <Text element="span" size="xs" color="text-[var(--warning-soft-text)]" title={t('planning.bar.openEnd')}>
        {t('planning.availability.unknown')}
      </Text>
    )
  }
  if (availability.kind === 'renewed') {
    return (
      <Text element="span" size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
        {t('planning.availability.renewed')}
      </Text>
    )
  }
  // #2410.60 — un renouvellement OUVERT (ou ABSENT) n'affiche jamais le vert
  // de la disponibilité certaine : « Sous réserve de la suite ».
  const uncertain = availability.certainty === 'incertaine'
  const color = uncertain ? 'text-[var(--warning-soft-text)]' : 'text-[var(--success-soft-text)]'
  const hint = (
    <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
      {t(uncertain ? 'planning.availability.pendingNext' : 'planning.availability.confirmed')}
    </Text>
  )
  if (availability.kind === 'now') {
    return (
      <>
        <Text element="span" size="xs" weight="semibold" color={color}>
          {t('planning.availability.now')}
        </Text>
        {hint}
      </>
    )
  }
  // ⚠️ Une date formatée par `formatDate`, jamais l'ISO brut : « Disponible à
  // partir du 2026-10-02 » est le défaut mesuré sur `/consultants/$id`.
  const readable = formatDate(availability.on, { day: 'numeric', month: 'short', year: 'numeric' })
  if (readable === null) return <UnknownValue reason={t('planning.availability.unreadable')} />
  return (
    <>
      <Text element="span" size="xs" weight="semibold" color={color}>
        {t('planning.availability.after', { date: readable })}
      </Text>
      {hint}
    </>
  )
}

/** Un bloc de lignes qui ne se dessinent PAS — et qui disent pourquoi. */
function AsideBlock({
  title,
  description,
  rows,
  onOpen,
}: {
  title: string
  description: string
  rows: PlanningRow[]
  onOpen: (mission: MissionView) => void
}) {
  const { t } = useTranslation('missions')
  if (rows.length === 0) return null
  return (
    <div role="group" aria-label={title} className="space-y-2 rounded-md border border-border bg-card p-3">
      <Text element="span" size="sm" weight="medium">
        {title}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {description}
      </Text>
      <Box display="flex" className="flex-wrap gap-2">
        {rows.map(row => (
          <Button
            key={row.mission.id}
            type="button"
            size="sm"
            variant="outline"
            aria-label={t('planning.openRow', { label: row.label })}
            className="pointer-coarse:min-h-11"
            onClick={() => onOpen(row.mission)}
          >
            {row.label}
          </Button>
        ))}
      </Box>
    </div>
  )
}

/** Ce sur quoi la recherche porte — dit à l'utilisateur dans l'état vide. */
function haystack(mission: MissionView): string {
  // #1350 — les affectations portent des OBJETS depuis ce lot. `...(assignees
  // ?? [])` y injecterait « [object Object] » : la recherche par consultant
  // cesserait de trouver qui que ce soit, en silence.
  return [mission.label, mission.accountName, mission.role_title, ...assigneeNames(mission)]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
}

/** Sans accents ni casse : « Kaczmarek » se trouve en tapant « kaczmarek ». */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
