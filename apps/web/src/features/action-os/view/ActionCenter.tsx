import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  useAssignCrmWrite,
  useBulkRejectCrmWrite,
  useCrmWriteRequests,
  useDecideCrmWrite,
  useReviseCrmWrite,
  useSnoozeCrmWrite,
} from '@/features/crm/api'
import { CrmWriteQueueState } from '@/features/crm/view/CrmWriteQueueState'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlarmClock,
  AlertTriangle,
  BellRing,
  CalendarClock,
  Check,
  Clock,
  Loader2,
  Pencil,
  Send,
  ShieldCheck,
  Workflow,
  X,
} from 'lucide-react'
import { Button, Card, FilterChips, Text, cn } from '@bellum/ui'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import { intentReversibility } from '@bellum/contracts'
import type {
  ActionIntentType,
  AtsWriteRequestView,
  PlaybookApproval,
  RoutineView,
  CrmWriteRequestView,
  WorkflowStep,
} from '@bellum/contracts'
import { useAssignAtsWrite, useAtsWriteRequests, useDecideAtsWrite, useSnoozeAtsWrite } from '@/features/ats/api'
import { useDecidePlaybookSend, usePlaybookApprovals, useSnoozePlaybookSend } from '@/features/playbooks/api'
import { useRoutines } from '@/features/routines/api'
import { actionsApi } from '@/features/actions/api'
import { gestureIdempotency } from '@/features/actions/lib/gesture-idempotency'
import { useSession } from '@/lib/hooks/use-session'
import { OutreachQueuePreview } from './OutreachQueuePreview'
import { ApprovalTraceLine } from './ApprovalTraceLine'
import { QueueTraceLine } from './QueueTraceLine'
import {
  trackActionAbandoned,
  trackActionCompleted,
  trackActionStarted,
  trackCrmWritebackConfirmed,
} from '@/lib/product-tracker'
import { MyRelancesList } from '@/features/actions/components/MyRelancesList'
import { AwaitingOutcomeQueue } from '@/features/actions/components/AwaitingOutcomeQueue'
import { SendTimingLine } from '@/features/actions/components/SendTimingLine'
import { CAPABILITY_LABEL_KEYS } from '@/components/access/CapabilityBanner'
import { CanonicalActionsElsewhere } from './CanonicalActionsElsewhere'
import { ApprovalRoutingControls, SnoozedApprovalList } from './ApprovalRouting'
import { partitionSnoozed, snoozeChoices } from '../approvalRouting'
import { useWorkspaceMembers, type WorkspaceMember } from '@/features/chat/hooks/useWorkspaceMembers'
import { useMyActions } from '@/features/actions/hooks/useMyActions'
import { describeSchedule, partitionScheduled } from '../lib/scheduleLabel'
import {
  actionOsApi,
  actionOsKeys,
  type ApprovalRequestView,
  type WorkflowOutcomeView,
  type WorkflowRunView,
} from '../api'
import {
  approvalFacts,
  availableValues,
  crmWriteFacts,
  erpWriteFacts,
  matchesQueueFilters,
  playbookSendFacts,
  type QueueFilterValues,
} from '../queueFilters'
import { formatDate } from '@/lib/locale'

/**
 * Le Centre d'actions (addendum final p21, p23).
 *
 * L'écran « Historique » disait ce qui S'ÉTAIT passé. Ce qui manquait, c'est
 * l'état PRÉSENT de l'exécution : ce qui attend une validation, ce qui tourne,
 * ce qui a échoué et pourquoi. Un journal seul ne répond à aucune de ces
 * questions — il faut les lire dans les lignes, ce que personne ne fait.
 *
 * Le centre se pose donc AU-DESSUS du journal, sur la même page : les deux
 * répondent à deux questions différentes (« où en est-on ? » et « qu'est-ce qui
 * s'est passé ? ») et les séparer sur deux écrans obligerait à naviguer entre
 * eux pour comprendre une seule action.
 *
 * L'onglet « Workflows » liste les définitions disponibles : c'est ce qui
 * empêche l'écran d'être vide tant que rien n'a tourné — et c'est aussi ce qui
 * apprend au commercial ce que le produit sait automatiser.
 *
 * Deux ajouts du 10/08, pour deux angles morts :
 *
 * - « À valider » réunit les approbations de l'Action OS ET les demandes
 *   d'écriture dans l'ERP. Elles viennent de deux modules distincts (un ERP
 *   n'est pas un CRM, et son écriture engage la paie), mais pour un responsable
 *   il n'y a qu'une question — « qu'est-ce qui attend ma validation ? ». Deux
 *   files séparées à surveiller, c'est la garantie qu'une des deux sera oubliée.
 *   Les demandes ERP arrivent DÉCORÉES de ce que l'utilisateur peut en faire :
 *   pas de bouton qu'on sait déjà refusé.
 *
 *   ⚠️ Depuis le 26/08/2026 une TROISIÈME file s'y ajoute : les relances
 *   automatiques des playbooks de niveau 5. Elles étaient le seul chemin du
 *   produit d'où partait un e-mail client sans qu'aucun humain ne voie CE
 *   message-là. Elles sont montrées en PREMIER, et c'est délibéré : les deux
 *   autres files écrivent dans des outils internes, celle-ci parle à un client.
 *
 * - « Planifiées » montre ce qui va tourner tout seul. Onze `@Cron` en dur ont
 *   longtemps envoyé sans que personne puisse dire lesquels étaient actifs ; les
 *   routines ont réglé la question dans les Réglages, mais l'écran des actions
 *   continuait de ne parler qu'au passé. Il annonce la RÈGLE d'exécution, jamais
 *   une date calculée côté client : celle-ci dépend du fuseau, de l'heure d'été
 *   et des cadences au premier jour ouvré — une seconde implémentation
 *   divergerait, et une date fausse ici est pire que pas de date.
 */

type TabKey = 'toApprove' | 'scheduled' | 'running' | 'done' | 'failed' | 'workflows' | 'mine'

const RUNNING_STATUSES: WorkflowRunView['status'][] = ['planned', 'running']
const DONE_STATUSES: WorkflowRunView['status'][] = ['done']
// L'onglet « à regarder ». `blocked` et `unknown` y figurent parce qu'ils
// appellent un geste — brancher un outil, vérifier un envoi — et non parce
// qu'ils sont des échecs : le badge, lui, les nomme pour ce qu'ils sont. Les
// omettre ici ferait disparaître ces runs de tous les onglets.
/**
 * Les runs qui demandent une reprise. ⚠️ Ce ne sont PAS tous des échecs, et
 * l'onglet ne s'appelle plus ainsi : `blocked` veut dire que rien n'est parti —
 * il manque une cible ou un connecteur — `unknown` que la requête a peut-être
 * abouti, et `partial` qu'une partie est passée. Les ranger sous « Échecs »
 * envoie chercher une panne là où il manque un branchement, ce qui est
 * précisément la confusion que le lot A a défaite au niveau du run.
 *
 * Vérifié en production le 25/08 : le premier run réellement lancé était
 * `blocked` (aucune cible choisie) et l'onglet l'annonçait « Échecs 1 ».
 */
const FAILED_STATUSES: WorkflowRunView['status'][] = ['failed', 'partial', 'cancelled', 'blocked', 'unknown']

/**
 * #2717 — LA DESTINATION EXACTE d'un clic sur un compteur ailleurs dans le
 * produit (tuile « En retard » du Dashboard).
 *
 * `initialTab` ouvre directement l'onglet visé — sans lui, ce composant
 * s'ouvrait TOUJOURS sur « À valider », quel que soit l'endroit d'où on
 * cliquait. `overdueOnly` restreint « Mes relances » à la même portée que le
 * chiffre affiché ailleurs (`countPersonalRelances().overdue`, côté API) :
 * afficher TOUTES les relances sous un chiffre qui n'en compte qu'une partie
 * fait douter des deux nombres.
 *
 * #2200.39 / #2200.42 / #2200.43 (épopée #2867) — `filters`/`onFiltersChange`
 * suivent le MÊME contrat que `initialTab` côté lecture, mais restent
 * CONTRÔLÉS : ce composant ne garde aucun état de filtre à lui. C'est
 * `ActionHistoryPage` qui les fait vivre dans l'URL (le brief l'exige : « le
 * retour navigateur les conserve ») — un état local ici les aurait rendus
 * invisibles au bouton Précédent du navigateur, comme `tab` déjà aujourd'hui.
 */
/** L'écran du traceur produit (route `/actions/`) : jamais recopié ailleurs. */
const ACTION_CENTER_SCREEN = '/actions/'

/** #2154.30 — l'écran du catalogue produit (`product-screens-catalog.ts`, route `/actions`) et le geste mesuré sur « Aujourd'hui ». */
const ACTIONS_SCREEN = '/actions'
const APPROVAL_DECISION_ACTION = 'approval_decided'

export function ActionCenter({
  initialTab,
  historyTab,
  overdueOnly = false,
  filters = {},
  onFiltersChange,
}: {
  initialTab?: TabKey
  /**
   * Lot L-A (#4164) — le MODE TIROIR « Historique » : l'onglet est imposé par le
   * tiroir (qui porte ses propres onglets internes), le titre et les pastilles
   * disparaissent, et `snoozed` liste les demandes reportées. La file où l'on agit
   * (À valider, Mes relances) est devenue « Aujourd'hui » ; ce mode ne rend QUE
   * l'état d'exécution : ce qui tourne, ce qui est fini, ce qui attend une reprise,
   * ce qui va tourner tout seul, le catalogue.
   */
  historyTab?: Exclude<TabKey, 'toApprove' | 'mine'> | 'snoozed'
  overdueOnly?: boolean
  filters?: QueueFilterValues
  onFiltersChange?: (patch: QueueFilterValues) => void
} = {}) {
  const { t } = useTranslation('actions')
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [tabState, setTab] = useState<TabKey>(initialTab ?? 'toApprove')
  const inHistory = historyTab !== undefined
  // `snoozed` n'est pas un onglet de la file : il n'existe que dans le tiroir.
  const tab: TabKey = historyTab && historyTab !== 'snoozed' ? historyTab : tabState

  const enabled = Boolean(user)
  const runs = useQuery({
    queryKey: actionOsKeys.runs(),
    queryFn: () => actionOsApi.runs(),
    enabled,
    staleTime: 30_000,
  })
  const approvals = useQuery({
    queryKey: actionOsKeys.approvals,
    queryFn: () => actionOsApi.approvals(),
    enabled,
    staleTime: 30_000,
  })
  const workflows = useQuery({
    queryKey: actionOsKeys.workflows,
    queryFn: () => actionOsApi.workflows(),
    enabled,
    // Le catalogue est versionné avec le code : il ne bouge pas d'une session
    // à l'autre, le refetch serait du bruit.
    staleTime: Infinity,
  })

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => actionOsApi.decide(id, decision),
    // #2154.30 — la décision d'une demande en attente est LE geste d'« Aujourd'hui » (`/actions`) : mesurée
    // par écran, jamais par personne ni par demande (l'identifiant n'est pas émis).
    onMutate: () => trackActionStarted(APPROVAL_DECISION_ACTION, ACTIONS_SCREEN),
    onSuccess: (_result, variables) => {
      trackActionCompleted(APPROVAL_DECISION_ACTION, ACTIONS_SCREEN)
      toast.success(t(variables.decision === 'approve' ? 'center.approved' : 'center.rejected'))
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.approvals })
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.runs() })
    },
    onError: (error: Error) => {
      trackActionAbandoned(APPROVAL_DECISION_ACTION, ACTIONS_SCREEN, 'error')
      toast.error(error.message || t('center.decisionFailed'))
    },
  })

  // Les demandes d'écriture ERP et les routines vivent dans leurs modules ; elles
  // sont LUES ici pour que « ce qui attend » et « ce qui va tourner » tiennent en
  // un seul endroit.
  const erpWrites = useAtsWriteRequests(enabled)
  const playbookSends = usePlaybookApprovals(enabled)
  const routines = useRoutines()
  const decideErp = useDecideAtsWrite()
  const assignErp = useAssignAtsWrite()
  const snoozeErp = useSnoozeAtsWrite()
  /**
   * #1508 — LES ÉCRITURES CRM REJOIGNENT LA FILE UNIQUE.
   *
   * ⚠️ Elles n'y étaient PAS. Le Centre lisait `useAtsWriteRequests` (ATS/ERP)
   * et la page autonome `/actions/ecritures` lisait `useCrmWriteRequests` —
   * deux sources distinctes. Retirer la page, comme le retour le demandait,
   * aurait donc SUPPRIMÉ les demandes CRM au lieu de les déplacer. On les
   * amène ici d'abord ; la page reste, et son onglet quitte la navigation.
   */
  const crmWrites = useCrmWriteRequests()
  const decideCrm = useDecideCrmWrite()
  const reviseCrm = useReviseCrmWrite()
  const assignCrm = useAssignCrmWrite()
  const snoozeCrm = useSnoozeCrmWrite()
  const bulkRejectCrm = useBulkRejectCrmWrite()
  const allCrm = crmWrites.data?.status === 'ready' ? crmWrites.data.requests : []
  /**
   * #2856 — reste du lot précédent : une écriture CRM reportée sort de la file
   * active jusqu'à sa date, exactement comme une approbation (voir `pending`
   * ci-dessous). `partitionSnoozed` lit `snoozed_until` ; la vue CRM le porte
   * en `snoozedUntil` (GA-26 : deux conventions de casse déjà en place selon
   * le contrat, pas une troisième ici).
   */
  const pendingCrm = useMemo(
    () =>
      partitionSnoozed(
        allCrm.map(request => ({ ...request, snoozed_until: request.snoozedUntil ?? null })),
        new Date(),
      ).active,
    [allCrm],
  )
  const routingPendingCrmId = assignCrm.isPending
    ? assignCrm.variables?.id
    : snoozeCrm.isPending
      ? snoozeCrm.variables?.id
      : undefined
  const decideSend = useDecidePlaybookSend()
  const snoozeSend = useSnoozePlaybookSend()
  /**
   * #1409 (rouvert), #2114.46/.57 — MES RELANCES ARRIVENT ICI.
   *
   * ⚠️ `GET /plan-items/mine` existait depuis #2123.46 sans AUCUN appelant web.
   * Ce hook est son premier lecteur : c'est le motif du dépôt — du code juste,
   * calculé, testé, que personne n'appelle — pris par le bon bout.
   */
  const myActions = useMyActions(overdueOnly)

  const allRuns = runs.data?.runs ?? []
  /**
   * #2856 — une demande REPORTÉE sort de la file active (et de la pastille
   * « À valider ») jusqu'à sa date, mais reste NOMMÉE sous « Reportées ».
   * #2864 — l'ordre du serveur (ce qui m'est confié d'abord) est conservé.
   */
  const { active: pending, snoozed: snoozedApprovals } = useMemo(
    () => partitionSnoozed(approvals.data?.approvals ?? [], new Date()),
    [approvals.data],
  )
  const members = useWorkspaceMembers().data ?? []
  const assign = useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => actionOsApi.assign(id, assigneeId),
    onSuccess: (_result, variables) => {
      toast.success(t(variables.assigneeId ? 'center.routing.assigned' : 'center.routing.unassigned'))
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.approvals })
    },
    onError: (error: Error) => toast.error(error.message || t('center.routing.failed')),
  })
  const snooze = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) => actionOsApi.snooze(id, until),
    onSuccess: (_result, variables) => {
      toast.success(t(variables.until ? 'center.routing.snoozed' : 'center.routing.woken'))
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.approvals })
    },
    onError: (error: Error) => toast.error(error.message || t('center.routing.failed')),
  })
  const routingPendingId = assign.isPending ? assign.variables?.id : snooze.isPending ? snooze.variables?.id : undefined
  /** #2856 — reste du lot précédent : même geste que la CRM ci-dessus (`pendingCrm`). */
  const pendingErp = useMemo(
    () =>
      partitionSnoozed(
        (erpWrites.data ?? []).map(request => ({ ...request, snoozed_until: request.snoozedUntil ?? null })),
        new Date(),
      ).active,
    [erpWrites.data],
  )
  const routingPendingErpId = assignErp.isPending
    ? assignErp.variables?.id
    : snoozeErp.isPending
      ? snoozeErp.variables?.id
      : undefined
  /**
   * #2856 — reste : même geste que CRM/ERP ci-dessus (`pendingCrm`/`pendingErp`)
   * — une relance reportée sort de la file active jusqu'à sa date, mais reste
   * NOMMÉE sous « Reportées » (`SnoozedPlaybookSendList`). Aucune délégation
   * ici (D58, messagerie personnelle) : pas d'`assigned_to` à porter.
   */
  const { active: pendingSends, snoozed: snoozedSends } = useMemo(
    () =>
      partitionSnoozed(
        (playbookSends.data ?? []).map(approval => ({ ...approval, snoozed_until: approval.snoozedUntil ?? null })),
        new Date(),
      ),
    [playbookSends.data],
  )
  const scheduled = useMemo(() => partitionScheduled(routines.data ?? []), [routines.data])

  /**
   * #2200.39 / #2200.42 / #2200.43 (épopée #2867) — LES FAITS DE CHAQUE
   * FAMILLE, puis les OPTIONS qui existent RÉELLEMENT dans la file, puis les
   * listes FILTRÉES pour le rendu.
   *
   * ⚠️ `counts.toApprove` (plus bas) reste calculé sur les listes NON
   * filtrées : un filtre change ce qu'on VOIT, jamais ce qui est réellement en
   * attente — la pastille de l'onglet mentirait sinon dès qu'un filtre est actif.
   */
  const queueFacts = useMemo(
    () => ({
      approvals: pending.map(approvalFacts),
      crm: pendingCrm.map(crmWriteFacts),
      erp: pendingErp.map(erpWriteFacts),
      sends: pendingSends.map(playbookSendFacts),
    }),
    [pending, pendingCrm, pendingErp, pendingSends],
  )
  const filterOptions = useMemo(() => {
    const all = [...queueFacts.approvals, ...queueFacts.crm, ...queueFacts.erp, ...queueFacts.sends]
    return {
      risk: availableValues(all.map(fact => fact.risk)),
      agent: availableValues(all.map(fact => fact.agent)),
      source: availableValues(all.map(fact => fact.source)),
    }
  }, [queueFacts])
  const filteredPending = useMemo(
    () => pending.filter((_, index) => matchesQueueFilters(queueFacts.approvals[index], filters)),
    [pending, queueFacts.approvals, filters],
  )
  const filteredCrm = useMemo(
    () => pendingCrm.filter((_, index) => matchesQueueFilters(queueFacts.crm[index], filters)),
    [pendingCrm, queueFacts.crm, filters],
  )
  const filteredErp = useMemo(
    () => pendingErp.filter((_, index) => matchesQueueFilters(queueFacts.erp[index], filters)),
    [pendingErp, queueFacts.erp, filters],
  )
  const filteredSends = useMemo(
    () => pendingSends.filter((_, index) => matchesQueueFilters(queueFacts.sends[index], filters)),
    [pendingSends, queueFacts.sends, filters],
  )
  const hasActiveQueueFilter = Boolean(filters.risk || filters.agent || filters.source)
  const totalQueueUnfiltered = pending.length + pendingErp.length + pendingSends.length + pendingCrm.length
  const totalQueueFiltered = filteredPending.length + filteredErp.length + filteredSends.length + filteredCrm.length
  const hasAnyQueueFilterOption =
    filterOptions.risk.length > 0 || filterOptions.agent.length > 0 || filterOptions.source.length > 0

  const counts = useMemo(
    () => ({
      toApprove: pending.length + pendingErp.length + pendingSends.length + pendingCrm.length,
      // Les routines empêchées sont comptées : les exclure ferait afficher un
      // « 3 » à côté d'un écran qui en montre 5, et douter des deux chiffres.
      scheduled: scheduled.active.length + scheduled.blocked.length,
      running: allRuns.filter(run => RUNNING_STATUSES.includes(run.status)).length,
      done: allRuns.filter(run => DONE_STATUSES.includes(run.status)).length,
      failed: allRuns.filter(run => FAILED_STATUSES.includes(run.status)).length,
      workflows: workflows.data?.workflows.length ?? 0,
      // Mesuré sur la liste déjà chargée : un zéro y est un vrai zéro. Tant
      // qu'elle n'est pas lue, `undefined` devient 0 à l'affichage SEULEMENT
      // parce que la pastille ne s'affiche pas sous 1 — jamais « rien à faire ».
      mine: myActions.data?.length ?? 0,
    }),
    [
      allRuns,
      pending.length,
      pendingErp.length,
      pendingSends.length,
      pendingCrm.length,
      scheduled,
      workflows.data,
      myActions.data,
    ],
  )

  /**
   * LES CINQ ÉTATS D'EXÉCUTION — et « Workflows » n'en est pas un (#1497).
   *
   * Les six pastilles étaient alignées comme si elles répondaient à la même
   * question. Cinq disent OÙ EN EST un travail ; la sixième liste des
   * DÉFINITIONS disponibles, c'est-à-dire ce qu'on peut lancer. Le retour le
   * pointe : « ne pas présenter Workflows comme un état d'exécution — ce n'est
   * pas la même nature ». Mélangées, elles font croire qu'un dossier peut être
   * « en workflow » comme il est « en cours ».
   *
   * Rien n'est retiré : le catalogue reste atteignable, à côté et non dedans.
   */
  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'toApprove', label: t('center.tabs.toApprove'), count: counts.toApprove },
    { key: 'scheduled', label: t('center.tabs.scheduled'), count: counts.scheduled },
    { key: 'running', label: t('center.tabs.running'), count: counts.running },
    { key: 'done', label: t('center.tabs.done'), count: counts.done },
    { key: 'failed', label: t('center.tabs.failed'), count: counts.failed },
  ]

  const decideErpWrite = (id: string, decision: 'approve' | 'reject') =>
    decideErp.mutate(
      { id, decision },
      {
        onSuccess: () => toast.success(t(decision === 'approve' ? 'center.approved' : 'center.rejected')),
        onError: (error: Error) => toast.error(error.message || t('center.decisionFailed')),
      },
    )

  return (
    <section aria-label={t('center.title')} className={inHistory ? 'mb-2' : 'mb-6'}>
      {inHistory ? null : (
        <div className="mb-3 flex items-center gap-2">
          <Workflow className="size-4 text-[var(--bellum-text-accent)]" />
          <Text size="sm" weight="semibold">
            {t('center.title')}
          </Text>
        </div>
      )}

      {/*
        Les six pastilles du Centre d'actions passent au composant partagé.

        Elles étaient une quatrième famille écrite à la main : `role="tab"` +
        `aria-selected`, actif en contour violet sur un fond à 10 % d'accent —
        une troisième façon de dire « c'est celui-ci ». `role="tab"` était par
        ailleurs discutable : ces six-là FILTRENT une même liste de runs, elles
        n'ouvrent pas six contenus distincts, et un `tablist` sans `tabpanel`
        associé promet à un lecteur d'écran une structure qui n'existe pas.

        ⚠️ Le compte reste MESURÉ : `counts` est dérivé des runs déjà chargés,
        donc un zéro y est un vrai zéro, pas un chargement.
      */}
      {inHistory ? null : (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <FilterChips
            ariaLabel={t('center.title')}
            options={tabs.map(entry => ({ value: entry.key, label: entry.label, count: entry.count }))}
            value={tab === 'workflows' || tab === 'mine' ? null : tab}
            onChange={next => next && setTab(next)}
          />
          {/* Le CATALOGUE, séparé des états : ce qu'on peut lancer, pas où en est
            un travail. Même geste, autre nature — et le compte reste mesuré.

            ⚠️ #1498 demandait de vérifier que « Workflows » et « Parcours » ne
            sont pas deux maisons pour la même chose. Ils ne le sont pas : un
            PARCOURS (`/actions/chaines`) projette l'état d'un dossier à travers
            les objets métier et signale ceux qui n'avancent plus ; une
            AUTOMATISATION est une recette qu'on LANCE (« Hygiène CRM »,
            « Signal récent → ouverture de compte »). Ce qui les faisait se
            ressembler était le mot — « Workflows », en anglais, dans une
            interface française. Il devient « Automatisations ». */}
          {/* #1409 (rouvert), #2114.46/.57 — « Mes relances », posée à côté des
            cinq états et non parmi eux, pour la MÊME raison qu'Automatisations :
            ce n'est pas un état d'exécution. Les cinq pastilles disent où en est
            un travail du système ; celle-ci liste ce que MOI je dois faire.

            ⚠️ Elle n'est pas un ajout : elle REMPLACE « Mes relances » du
            cockpit personnel, retirée dans le même commit. Migrer puis retirer,
            jamais l'inverse — sans quoi on supprime la capacité au lieu de la
            déplacer. */}
          <Button
            type="button"
            variant={tab === 'mine' ? 'outline' : 'ghost'}
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-pressed={tab === 'mine'}
            onClick={() => setTab(tab === 'mine' ? 'toApprove' : 'mine')}
          >
            {t('center.relances.tab')}
            {counts.mine > 0 ? ` · ${counts.mine}` : ''}
          </Button>
          <Button
            type="button"
            variant={tab === 'workflows' ? 'outline' : 'ghost'}
            size="sm"
            className="pointer-coarse:min-h-11"
            aria-pressed={tab === 'workflows'}
            onClick={() => setTab(tab === 'workflows' ? 'toApprove' : 'workflows')}
          >
            {t('center.tabs.workflows')}
            {counts.workflows > 0 ? ` · ${counts.workflows}` : ''}
          </Button>
        </div>
      )}

      {historyTab === 'snoozed' ? (
        <div className="space-y-2">
          <SnoozedApprovalList
            approvals={snoozedApprovals}
            onWake={id => snooze.mutate({ id, until: null })}
            pendingId={routingPendingId}
          />
          <SnoozedPlaybookSendList
            approvals={snoozedSends}
            onWake={id => snoozeSend.mutate({ id, until: null })}
            pendingId={snoozeSend.isPending ? snoozeSend.variables?.id : undefined}
          />
          {snoozedApprovals.length === 0 && snoozedSends.length === 0 ? (
            <EmptyState text={t('today.drawer.snoozedEmpty')} />
          ) : null}
        </div>
      ) : tab === 'toApprove' ? (
        <div className="space-y-2">
          {/* #3419 — les MESSAGES d'approche (brouillons, bloqués) ont leur
              centre sous Séquences ; sans ce lien, « À valider » n'y menait
              pas et un message bloqué restait introuvable par clics. */}
          <OutreachQueuePreview />
          {/* #2200.39 / #2200.42 / #2200.43 (épopée #2867) — la barre de
              filtres n'existait pas sur cette file. Chaque rangée ne porte que
              les valeurs RÉELLEMENT présentes dans la file actuelle (doctrine
              « on n'affiche pas ce qu'on n'a pas ») : `FilterChips` se tait
              déjà tout seul quand `options` est vide, la garde ici évite
              seulement un conteneur vide quand LES TROIS le sont. */}
          {hasAnyQueueFilterOption ? (
            <div
              role="group"
              aria-label={t('center.filters.legend')}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[var(--bellum-border)] pb-2"
            >
              <FilterChips
                ariaLabel={t('center.filters.risk.legend')}
                legend={t('center.filters.risk.legend')}
                size="sm"
                options={filterOptions.risk.map(risk => ({ value: risk, label: t(`center.filters.risk.${risk}`) }))}
                value={filters.risk ?? null}
                clearable
                onChange={next => onFiltersChange?.({ ...filters, risk: next ?? undefined })}
              />
              <FilterChips
                ariaLabel={t('center.filters.agent.legend')}
                legend={t('center.filters.agent.legend')}
                size="sm"
                options={filterOptions.agent.map(agent => ({
                  value: agent,
                  label: t(`center.filters.agent.${agent}`),
                }))}
                value={filters.agent ?? null}
                clearable
                onChange={next => onFiltersChange?.({ ...filters, agent: next ?? undefined })}
              />
              <FilterChips
                ariaLabel={t('center.filters.source.legend')}
                legend={t('center.filters.source.legend')}
                size="sm"
                options={filterOptions.source.map(source => ({
                  value: source,
                  label: t(`center.filters.source.${source}`, { defaultValue: t('center.filters.source.unknown') }),
                }))}
                value={filters.source ?? null}
                clearable
                onChange={next => onFiltersChange?.({ ...filters, source: next ?? undefined })}
              />
            </div>
          ) : null}
          {hasActiveQueueFilter && totalQueueFiltered === 0 && totalQueueUnfiltered > 0 ? (
            <EmptyState text={t('center.filters.empty')} />
          ) : (
            <>
              <PlaybookSendList
                approvals={filteredSends}
                onDecide={(id, decision) => decideSend.mutate({ id, decision })}
                onSnooze={(id, until) => snoozeSend.mutate({ id, until })}
                pendingId={decideSend.isPending ? decideSend.variables?.id : undefined}
                pendingSnoozeId={snoozeSend.isPending ? snoozeSend.variables?.id : undefined}
              />
              <SnoozedPlaybookSendList
                approvals={snoozedSends}
                onWake={id => snoozeSend.mutate({ id, until: null })}
                pendingId={snoozeSend.isPending ? snoozeSend.variables?.id : undefined}
              />
              <ApprovalList
                approvals={filteredPending}
                othersCount={filteredErp.length + filteredSends.length + filteredCrm.length}
                onDecide={(id, decision) => decide.mutate({ id, decision })}
                pendingId={decide.isPending ? decide.variables?.id : undefined}
                routing={{
                  currentUserId: user?.id,
                  members,
                  onAssign: (id, assigneeId) => assign.mutate({ id, assigneeId }),
                  onSnooze: (id, until) => snooze.mutate({ id, until }),
                  pendingId: routingPendingId,
                }}
              />
              <SnoozedApprovalList
                approvals={snoozedApprovals}
                onWake={id => snooze.mutate({ id, until: null })}
                pendingId={routingPendingId}
              />
              <ErpWriteList
                requests={filteredErp}
                onDecide={decideErpWrite}
                pendingId={decideErp.isPending ? decideErp.variables?.id : undefined}
                routing={{
                  currentUserId: user?.id,
                  members,
                  onAssign: (id, assigneeId) => assignErp.mutate({ id, assigneeId }),
                  onSnooze: (id, until) => snoozeErp.mutate({ id, until }),
                  pendingId: routingPendingErpId,
                }}
              />
              {/* Les écritures CRM, dans la MÊME file. La prévisualisation reste
                  celle que le serveur a figée : un recalcul au clic ferait approuver
                  autre chose que ce qui a été lu. */}
              <CrmWriteList
                requests={filteredCrm}
                onDecide={(id, approve) =>
                  decideCrm.mutate(
                    { id, approve },
                    {
                      // #2319.129/.130 — confirmé = approuvé ET réussi, et seulement
                      // pour une écriture composée par un compte rendu (provenance
                      // déjà portée par `target.source`, #2855). Écran seul.
                      onSuccess: () => {
                        // Lot X41 (#2958) — la décision se DIT : les deux autres files de ce
                        // centre le font, celle-ci se taisait. Les clés existaient déjà
                        // (`crm:writeRequests.approved/rejected`), sans plus aucun appelant
                        // depuis la fusion des écrans.
                        toast.success(t(approve ? 'writeRequests.approved' : 'writeRequests.rejected', { ns: 'crm' }))
                        if (
                          approve &&
                          allCrm.find(request => request.id === id)?.target?.source?.kind === 'meeting_note'
                        ) {
                          trackCrmWritebackConfirmed(ACTION_CENTER_SCREEN)
                        }
                      },
                      // Un refus du serveur (409 « déjà traitée » par un collègue, droit retiré,
                      // demande expirée) s'affiche avec SA raison — jamais une carte qui
                      // disparaît sans un mot.
                      onError: (error: Error) =>
                        toast.error(error.message || t('writeRequests.decisionFailed', { ns: 'crm' })),
                    },
                  )
                }
                onRevise={(id, changes) => reviseCrm.mutate({ id, changes })}
                onBulkReject={ids => bulkRejectCrm.mutate(ids)}
                bulkRejectPending={bulkRejectCrm.isPending}
                pendingId={
                  decideCrm.isPending
                    ? decideCrm.variables?.id
                    : reviseCrm.isPending
                      ? reviseCrm.variables?.id
                      : undefined
                }
                routing={{
                  currentUserId: user?.id,
                  members,
                  onAssign: (id, assigneeId) => assignCrm.mutate({ id, assigneeId }),
                  onSnooze: (id, until) => snoozeCrm.mutate({ id, until }),
                  pendingId: routingPendingCrmId,
                }}
              />
            </>
          )}
          {/* #2201.51 — LA CAPACITE DEMENAGE EN ENTIER, PAS SEULEMENT LA LISTE.
              `/actions/ecritures` redirige maintenant ici (le patron : une
              route qui quitte la navigation redirige). L'ecran qu'elle rendait
              disait TROIS etats que cette file ne disait pas — et « aucun CRM
              branche » n'est surtout pas « rien n'attend » : une file vide se
              croit, un connecteur absent se corrige. TOUJOURS visible : un
              état de connecteur n'est pas un contenu qu'un filtre doit pouvoir
              cacher. */}
          <CrmWriteQueueState status={crmWrites.data?.status} unread={crmWrites.isLoading || crmWrites.isError} />
        </div>
      ) : tab === 'scheduled' ? (
        <ScheduledList active={scheduled.active} blocked={scheduled.blocked} loading={routines.isLoading} />
      ) : tab === 'mine' ? (
        <div className="space-y-2">
          {/* #2200.33 — « Cocher une tâche ne signifie jamais qu'une action
              externe a été exécutée. » Le rond « fait » de `MyRelancesList`
              écrit seulement le statut de `action_plan_items` ; il n'écrit
              rien dans un CRM/ERP. Le dire AVANT le clic, dans le libellé
              EXACT demandé, plutôt que le laisser deviner. */}
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {t('center.relances.completionNote')}
          </Text>
          {/* #3211.9 (#3234, lot M11) — la file PROACTIVE des issues manquantes :
              les actions faites sans issue, présentées sans qu'on les demande.
              Hors filtre « En retard » : ce ne sont pas des retards. */}
          {overdueOnly ? null : <AwaitingOutcomeQueue />}
          {/* #3289 — le créneau que l'équipe a appris : une ligne, ou rien. */}
          <SendTimingLine />
          {/* #2717 — arrivée depuis la tuile « En retard » : la liste ET son
              vide restent cohérents avec le filtre annoncé par l'URL. */}
          <MyRelancesList actions={myActions.data ?? []} loading={myActions.isLoading} overdueOnly={overdueOnly} />
          {/* #2395 — la vue COMPLÈTE : les tâches et les appels, lus au contrat
              canonique, chacun renvoyé à sa maison. Le plan n'y revient pas. */}
          {overdueOnly ? null : <CanonicalActionsElsewhere />}
        </div>
      ) : tab === 'workflows' ? (
        <WorkflowList workflows={workflows.data?.workflows ?? []} outcomes={workflows.data?.outcomes ?? {}} />
      ) : (
        <RunList
          runs={allRuns.filter(run =>
            tab === 'running'
              ? RUNNING_STATUSES.includes(run.status)
              : tab === 'done'
                ? DONE_STATUSES.includes(run.status)
                : FAILED_STATUSES.includes(run.status),
          )}
        />
      )}
    </section>
  )
}

/**
 * Les relances automatiques qui attendent une validation.
 *
 * La seule file de cet écran dont l'approbation parle à un CLIENT. Deux
 * conséquences dans le rendu :
 *
 *  - le message EXACT est montré, objet et corps. Valider « une relance » sans
 *    la lire n'est pas valider ; et le texte affiché est celui qui a été figé au
 *    moment de la demande, pas un recomposé ;
 *  - le destinataire est nommé. « Envoyer » sans savoir à qui est le genre de
 *    clic qu'on regrette.
 *
 * Le bouton dit « Envoyer », pas « Approuver » : il envoie.
 */
function PlaybookSendList({
  approvals,
  onDecide,
  onSnooze,
  pendingId,
  pendingSnoozeId,
}: {
  approvals: PlaybookApproval[]
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  onSnooze: (id: string, until: string) => void
  pendingId?: string
  pendingSnoozeId?: string
}) {
  const { t } = useTranslation('actions')
  if (approvals.length === 0) return null
  return (
    <ul className="space-y-2">
      {approvals.map(approval => (
        <li key={approval.id}>
          <Card className="p-3">
            <div className="flex items-start gap-2">
              <Send className="mt-0.5 size-4 shrink-0 text-[var(--bellum-warning-text)]" />
              <div className="min-w-0 flex-1">
                {/* #2200.17, #2201.12 — la CAPACITÉ, jamais un éditeur : cette
                    relance part par la messagerie du commercial, comme les
                    écritures CRM/ERP nomment déjà « ton CRM »/« l'ERP » dans
                    leur propre libellé. */}
                <Text size="xs" weight="medium" color="text-[var(--warning-soft-text)]">
                  {t('center.playbookSend.capability')}
                  {/* #2201.23 — LE CANAL, explicitement : une relance de
                      playbook part TOUJOURS par e-mail (`PlaybookApproval.
                      channel`, `playbook.ts` — jamais une supposition, c'est
                      ce que `subject`/`body` décrivent déjà). Le nommer à
                      côté de la capacité lève toute ambiguïté sans répéter
                      « ta messagerie ». */}
                  {' · '}
                  {t('channels.email')}
                </Text>
                <Text size="sm" weight="medium">
                  {t('center.playbookSend.title', { recipient: approval.recipient })}
                </Text>
                <Text size="sm" className="mt-1">
                  {approval.subject}
                </Text>
                {/* Le corps EXACT. Le replier derrière un « voir plus » ferait
                    valider sans lire, ce qui est exactement ce qu'on évite. */}
                <Text
                  size="xs"
                  color="text-[var(--bellum-text-secondary)]"
                  className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap"
                >
                  {approval.body}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                  {t('center.expiresAt', { date: formatDate(new Date(approval.expiresAt)) })}
                </Text>
                {/* #2200.13/.14/.21 — une relance de playbook est préparée par Laura, jamais envoyée seule. */}
                <QueueTraceLine
                  parts={[
                    t('center.queueTrace.playbook.author'),
                    t('center.queueTrace.playbook.source'),
                    t('center.queueTrace.playbook.next'),
                  ]}
                />
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" disabled={pendingId === approval.id} onClick={() => onDecide(approval.id, 'approve')}>
                {pendingId === approval.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {t('center.playbookSend.send')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pendingId === approval.id}
                onClick={() => onDecide(approval.id, 'reject')}
              >
                <X className="size-3.5" />
                {t('center.playbookSend.discard')}
              </Button>
              {/* #2856 — reste : reporter, jamais confier (D58) — la messagerie
                  d'où partirait le message est personnelle. */}
              {snoozeChoices(approval.expiresAt, new Date()).map(choice => (
                <Button
                  key={choice.key}
                  size="sm"
                  variant="ghost"
                  disabled={pendingSnoozeId === approval.id}
                  onClick={() => onSnooze(approval.id, choice.until)}
                >
                  <AlarmClock className="size-3.5" aria-hidden="true" />
                  {t(`center.routing.snooze.${choice.key}`)}
                </Button>
              ))}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

/**
 * #2856 — LES RELANCES REPORTÉES : hors de la file active, jamais cachées
 * (même patron que `SnoozedApprovalList`) — aucune liste = aucune section (on
 * n'affiche pas ce qu'on n'a pas).
 */
function SnoozedPlaybookSendList({
  approvals,
  onWake,
  pendingId,
}: {
  approvals: PlaybookApproval[]
  onWake: (id: string) => void
  pendingId?: string
}) {
  const { t } = useTranslation('actions')
  if (approvals.length === 0) return null
  return (
    <section aria-label={t('center.routing.snoozedTitle')} className="space-y-2">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-muted)]">
        {t('center.routing.snoozedTitle')}
      </Text>
      <ul className="space-y-2">
        {approvals.map(approval => (
          <li key={approval.id}>
            <Card className="p-3">
              <Text size="sm" weight="medium">
                {t('center.playbookSend.title', { recipient: approval.recipient })}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                {approval.snoozedUntil
                  ? t('center.routing.snoozedUntil', { date: formatDate(new Date(approval.snoozedUntil)) })
                  : null}
              </Text>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                disabled={pendingId === approval.id}
                onClick={() => onWake(approval.id)}
              >
                <BellRing className="size-3.5" aria-hidden="true" />
                {t('center.routing.wake')}
              </Button>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Les demandes en attente — la seule liste où l'utilisateur AGIT. */
function ApprovalList({
  approvals,
  othersCount,
  onDecide,
  pendingId,
  routing,
}: {
  approvals: ApprovalRequestView[]
  /** #2864 / #2856 — confier et reporter : le CIRCUIT, jamais le contenu. */
  routing?: {
    currentUserId: string | undefined
    members: readonly WorkspaceMember[]
    onAssign: (id: string, assigneeId: string | null) => void
    onSnooze: (id: string, until: string | null) => void
    pendingId?: string
  }
  /** Les AUTRES files affichées juste en dessous — ERP, envois, et depuis
   *  #1508 les écritures CRM. Sert uniquement à ne PAS afficher « rien à
   *  valider » quand la file d'à côté, elle, contient quelque chose.
   *  ⚠️ Toute file ajoutée sous celle-ci doit s'y compter : sinon l'écran
   *  annonce « rien à valider » AU-DESSUS de ce qu'il y a à valider. */
  othersCount: number
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  pendingId?: string
}) {
  const { t } = useTranslation('actions')
  if (approvals.length === 0) return othersCount > 0 ? null : <EmptyState text={t('center.empty.toApprove')} />
  return (
    <ul className="space-y-2">
      {approvals.map(approval => (
        <li key={approval.id}>
          <Card className="p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-accent)]" />
              <div className="min-w-0 flex-1">
                {/* Le résumé a été FIGÉ au moment de la demande : c'est
                    exactement ce qui sera exécuté, pas un recalcul. */}
                <Text size="sm" className="whitespace-pre-wrap">
                  {approval.summary}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                  {t('center.expiresAt', { date: formatDate(new Date(approval.expires_at)) })}
                </Text>
                {/* #2200.13 / #2200.14 / #2200.21 — la carte encore en attente
                    porte la MÊME traçabilité qu'un run déjà terminé. */}
                <ApprovalTraceLine trace={approval.trace} nextStepKey={approval.nextStepKey ?? null} />
                {routing ? (
                  <ApprovalRoutingControls
                    approval={approval}
                    currentUserId={routing.currentUserId}
                    members={routing.members}
                    onAssign={routing.onAssign}
                    onSnooze={routing.onSnooze}
                    pending={routing.pendingId === approval.id}
                  />
                ) : null}
              </div>
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" disabled={pendingId === approval.id} onClick={() => onDecide(approval.id, 'approve')}>
                {pendingId === approval.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                {t('center.approve')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pendingId === approval.id}
                onClick={() => onDecide(approval.id, 'reject')}
              >
                <X className="size-3.5" />
                {t('center.reject')}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

/**
 * Les demandes d'écriture dans l'ERP.
 *
 * Elles se distinguent des approbations de l'Action OS sur un point qui change
 * l'écran : l'utilisateur qui les regarde n'a pas forcément le droit de les
 * trancher, et la règle (validation d'un responsable, jamais par son propre
 * demandeur) est connue AVANT l'affichage. Le serveur la renvoie donc avec sa
 * raison, et on montre la raison plutôt que deux boutons qui échoueront.
 */
function ErpWriteList({
  requests,
  onDecide,
  pendingId,
  routing,
}: {
  requests: AtsWriteRequestView[]
  onDecide: (id: string, decision: 'approve' | 'reject') => void
  pendingId?: string
  /** #2864 / #2856 — reste du lot précédent : confier et reporter. */
  routing?: {
    currentUserId: string | undefined
    members: readonly WorkspaceMember[]
    onAssign: (id: string, assigneeId: string | null) => void
    onSnooze: (id: string, until: string | null) => void
    pendingId?: string
  }
}) {
  const { t } = useTranslation('actions')
  if (requests.length === 0) return null
  return (
    <ul className="space-y-2">
      {requests.map(request => (
        <li key={request.id}>
          <Card className="p-3">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
              <div className="min-w-0 flex-1">
                <Text size="xs" weight="medium" color="text-[var(--warning-soft-text)]">
                  {t(`center.erp.kind.${request.kind}`)}
                </Text>
                {/* Prévisualisation FIGÉE à la demande : ce qui partira, mot pour
                    mot. Un recalcul au moment du clic ferait approuver autre
                    chose que ce qui a été lu. */}
                <Text size="sm" className="mt-1 whitespace-pre-wrap">
                  {request.preview}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                  {t('center.expiresAt', { date: formatDate(new Date(request.expiresAt)) })}
                </Text>
                {routing ? (
                  <ApprovalRoutingControls
                    approval={{
                      id: request.id,
                      assigned_to: request.assignedTo ?? null,
                      expires_at: request.expiresAt,
                    }}
                    currentUserId={routing.currentUserId}
                    members={routing.members}
                    onAssign={routing.onAssign}
                    onSnooze={routing.onSnooze}
                    pending={routing.pendingId === request.id}
                  />
                ) : null}
              </div>
            </div>
            {request.canDecide ? (
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" disabled={pendingId === request.id} onClick={() => onDecide(request.id, 'approve')}>
                  {pendingId === request.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {t('center.erp.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pendingId === request.id}
                  onClick={() => onDecide(request.id, 'reject')}
                >
                  <X className="size-3.5" />
                  {t('center.reject')}
                </Button>
              </div>
            ) : (
              <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2.5">
                {request.blockedReason ?? t('center.erp.cannotDecide')}
              </Text>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}

/**
 * Ce qui va tourner tout seul.
 *
 * Deux listes, et la séparation est le contenu : une routine activée dont la
 * capacité manque ne tournera PAS, et la ranger avec les autres ferait attendre
 * un brief qui n'arrivera jamais. Aucune date n'est annoncée — seulement la
 * règle d'exécution, qui est vraie sans calcul (voir `describeSchedule`).
 */
function ScheduledList({
  active,
  blocked,
  loading,
}: {
  active: RoutineView[]
  blocked: RoutineView[]
  loading: boolean
}) {
  const { t } = useTranslation('actions')
  if (loading) return <EmptyState text={t('center.empty.loading')} />
  // La porte est POSÉE ici, pas seulement nommée. Le lien de gestion n'existait
  // que sous une liste non vide : l'écran écrivait « elles se règlent dans
  // Réglages › Routines » exactement au moment où il n'y menait pas.
  if (active.length === 0 && blocked.length === 0)
    return (
      <EmptyState
        text={t('center.empty.scheduled')}
        action={
          <Link to="/settings/routines" className="text-xs underline">
            {t('center.scheduled.manage')}
          </Link>
        }
      />
    )
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {active.map(routine => (
          <ScheduledRow key={routine.definition.key} routine={routine} />
        ))}
      </ul>
      {blocked.length > 0 ? (
        <div className="space-y-2">
          <Text size="xs" weight="medium" color="text-[var(--warning-soft-text)]">
            {t('center.scheduled.blockedTitle', { count: blocked.length })}
          </Text>
          <ul className="space-y-2">
            {blocked.map(routine => (
              <ScheduledRow key={routine.definition.key} routine={routine} />
            ))}
          </ul>
        </div>
      ) : null}
      <Link to="/settings/routines" className="text-xs underline">
        {t('center.scheduled.manage')}
      </Link>
    </div>
  )
}

function ScheduledRow({ routine }: { routine: RoutineView }) {
  const { t, i18n } = useTranslation('actions')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  const schedule = describeSchedule(routine)
  const weekday = schedule.params.weekday
  return (
    <li>
      <Card className="p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Text size="sm" weight="medium">
              {routine.definition.name[locale]}
            </Text>
            <div className="mt-1 flex items-center gap-1.5">
              <CalendarClock className="size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t(`center.${schedule.key}`, {
                  time: schedule.params.time,
                  zone: schedule.params.zone,
                  weekday: weekday === undefined ? '' : t(`center.weekday.${weekday}`),
                })}
              </Text>
            </div>
          </div>
          {routine.blockers.length > 0 ? (
            <Text size="xs" className="text-[var(--warning-soft-text)]">
              {t(`center.blocker.${routine.blockers[0]}`, { defaultValue: t('center.blocker.generic') })}
            </Text>
          ) : null}
        </div>
        {/* La dernière exécution est un FAIT ; l'issue est recopiée telle qu'elle
            a été écrite (« 3 fils sans réponse »), pour qu'un silence normal ne
            ressemble pas à une panne. */}
        <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
          {routine.lastRunAt
            ? t('center.scheduled.lastRun', {
                date: formatDate(new Date(routine.lastRunAt)),
                outcome: routine.lastOutcome ?? t('center.scheduled.noOutcome'),
              })
            : t('center.scheduled.neverRan')}
        </Text>
      </Card>
    </li>
  )
}

/**
 * #2200.45 — repli COMPRÉHENSIBLE quand la traduction manque.
 *
 * `defaultValue: run.definition_key` (ou `step.key`) laissait passer une clé
 * technique brute (`unmapped_workflow_key`) à l'écran : lisible pour qui a lu
 * le code, pas pour un commercial qui essaie de comprendre ce qui s'est
 * passé. Une nouvelle définition/un nouveau pas sans traduction encore posée
 * ne doit pas redevenir illisible pour autant — la clé est donc MISE EN
 * FORME (snake_case → phrase), jamais cachée ni remplacée par un libellé
 * générique qui perdrait l'identité du workflow/pas concerné.
 */
function humanizeTechnicalKey(key: string): string {
  const words = key.split(/[_-]+/).filter(Boolean)
  if (words.length === 0) return key
  return words.map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word)).join(' ')
}

/**
 * #4163 LF — le pas UNIQUE d'une carte du copilote s'appelle `effect` (`CARD_STEP_KEY`, côté API) : sans
 * libellé, le repli technique écrivait « Effect » à l'écran. Il se lit « Exécution de l'action » ; les autres
 * clés sans traduction gardent le repli mis en forme (#2200.45).
 */
function stepFallbackLabel(t: (key: string) => string, key: string): string {
  return key === 'effect' ? t('center.stepEffect') : humanizeTechnicalKey(key)
}

/** Un UUID n'est pas une référence qu'un commercial sait lire : il ne s'affiche pas (#4163 LF). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * #2200.34 — LE ROLLBACK D'UN PAS DÉJÀ EXÉCUTÉ, câblé au routeur qui sait déjà
 * le faire (épopée #2771) : `intentReversibility` classait un pas ANNULÉ sans
 * jamais déclencher de compensation réelle — c'est exactement ce que
 * l'épopée #2866 reprochait. Les deux clés ci-dessous sont les seules où le
 * pas d'origine et son rollback se correspondent 1-pour-1 sur `targetId` =
 * `WorkflowRunStep.externalRef` (l'id que le geste d'origine a produit) :
 *
 *   `schedule_reminder`/`snooze` → `cancel_reminder` (éteint le rappel)
 *   `create_mail_draft`          → `delete_draft` (retire le brouillon)
 *
 * `restore_status` et `stop_sequence` restent HORS de cette table : aucun des
 * `ActionIntentType` que `RunList` affiche ne produit la ligne qu'ils
 * ciblent — les y brancher inventerait un lien que le code ne tient pas.
 *
 * ⚠️ #2866 — RÉFUTÉ EN PROD LE 27/09/2026 : `create_crm_task` en faisait
 * partie et n'aurait jamais dû. Son `externalRef` (`dispatchCrmTask`,
 * `action-router.service.ts`) est l'id CHEZ LE CRM — gardé tel quel pour
 * « LA PREUVE » affichée en pied de carte (#2200.20/#2201.40), donc jamais un
 * UUID. `remove_crm_task` (`removeCrmTaskIntentSchema.targetId`) cherche à
 * l'inverse une ligne `user_actions` PAR SON ID, pour y relire
 * `metadata.external_ref` et savoir où écrire la note rectificative. Le clic
 * envoyait donc TOUJOURS un id que le rollback ne pouvait pas résoudre —
 * silencieusement pour la personne, qui ne voyait qu'un bouton sans effet.
 * Faire voyager un second id (celui de la ligne `user_actions`) jusqu'au pas
 * de run est un chantier à part ; la règle du dépôt tranche déjà le cas ICI :
 * « si la compensation d'un type n'existe pas, le bouton ne s'affiche pas
 * pour ce type — jamais un bouton qui ne fait rien. »
 */
const UNDO_ROLLBACK: Partial<Record<ActionIntentType, 'cancel_reminder' | 'delete_draft'>> = {
  schedule_reminder: 'cancel_reminder',
  snooze: 'cancel_reminder',
  create_mail_draft: 'delete_draft',
}

/**
 * #2866 — recette 27/09 (réel) : « Annuler » n'était borné par AUCUNE fenêtre
 * — un pas exécuté il y a des mois restait annulable comme s'il datait de la
 * minute. 72h (le rappel démo se pose 3 jours à l'avance, `demo-seed.service`)
 * — assez large pour rattraper une vraie erreur de geste, jamais assez pour
 * qu'« Annuler » réécrive un historique ancien (doctrine « on archive, on ne
 * supprime pas »).
 */
const UNDO_WINDOW_MS = 72 * 60 * 60 * 1000

function undoableStep(
  step: WorkflowRunView['steps'][number],
): { rollbackType: 'cancel_reminder' | 'delete_draft'; targetId: string } | null {
  if (step.outcome !== 'done' || step.externalRef === null) return null
  // `finishedAt` absent (pas antérieur à ce champ) : on ne fabrique pas un
  // refus sur une date qu'on n'a pas — seule une date CONNUE ferme la fenêtre.
  if (step.finishedAt !== null && Date.now() - new Date(step.finishedAt).getTime() > UNDO_WINDOW_MS) return null
  const rollbackType = UNDO_ROLLBACK[step.intentType]
  return rollbackType ? { rollbackType, targetId: step.externalRef } : null
}

/** Le geste UNDO lui-même : dispatche le rollback déjà testé côté routeur. */
function UndoStepButton({
  runId,
  stepKey,
  rollbackType,
  targetId,
}: {
  runId: string
  stepKey: string
  rollbackType: 'cancel_reminder' | 'delete_draft'
  targetId: string
}) {
  const { t } = useTranslation('actions')
  const queryClient = useQueryClient()
  // #2866 (décision 3) — la ligne `run.steps[].outcome` reste celle de
  // L'EXÉCUTION D'ORIGINE (doctrine « on archive, on ne supprime pas » : ce
  // pas a bien tourné, le rollback est un SECOND geste, pas une correction du
  // premier). Le fil « Annulée » que la carte doit montrer après un UNDO
  // réussi vit donc ICI, pas dans les données du run — un remontage (F5) peut
  // le reperdre, ce qui reste honnête : la trace du VRAI retrait est la note
  // rectificative versée au fournisseur, ou la ligne `user_actions` marquée,
  // jamais ce badge.
  const [withdrawn, setWithdrawn] = useState(false)

  const undo = useMutation({
    mutationFn: async () => {
      // Même règle que `LaunchWorkflowButton` : la clé identifie CE geste
      // (ce run, ce pas), pas ce rendu — voir `gestureIdempotency`.
      const gesture = gestureIdempotency('action-os.undo-step', [runId, stepKey])
      const result = await actionsApi.dispatch({ type: rollbackType, targetId, idempotencyKey: gesture.key })
      if (result.status !== 'unknown') gesture.release()
      return result
    },
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.runs() })
      if (result.status === 'done') {
        setWithdrawn(true)
        toast.success(t('center.undone'))
        return
      }
      toast.error(result.reason || t('center.undoError'))
    },
    onError: (error: Error) => toast.error(error.message || t('center.undoError')),
  })

  // #2866 (décision 3) — un succès NOMME ce qui a été défait (jamais un simple
  // « Terminée » muet, jamais un second bouton qui rejouerait le rollback).
  if (withdrawn) {
    return (
      <Text size="xs" weight="medium" color="text-[var(--success-soft-text)]">
        {t(`center.undoneLabel.${rollbackType}`)}
      </Text>
    )
  }

  return (
    <Button size="sm" variant="ghost" disabled={undo.isPending} onClick={() => undo.mutate()}>
      {undo.isPending ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
      {t(`center.undoStep.${rollbackType}`)}
    </Button>
  )
}

/** #3416 — ce qu'une exécution terminée a donné, tiré de ses pas réels. */
function RunResultLine({ run, showNextAction }: { run: WorkflowRunView; showNextAction: boolean }) {
  const { t } = useTranslation('actions')
  const stepsLearned = run.steps
    .filter(step => step.outcome === 'done' && step.reason)
    .map(step => step.reason)
    .join(' ')
  // #3416.x2 — une analyse de compte n'a pas de pas : ce qu'elle apprend est le
  // résultat RÉEL stocké sur le run (contacts trouvés). Absent = aucune ligne.
  const found = run.result?.analysisFound
  const learned =
    stepsLearned ||
    (found && found.contacts > 0
      ? t('center.runResult.analysisFound', { count: found.contacts, verified: found.verifiedEmails })
      : '')
  // X37 / #3416 — la prochaine action vient des tâches ouvertes du compte (serveur) ;
  // elle se lit même quand le run n'a aucun pas à résumer.
  const nextAction =
    run.nextAction && showNextAction ? (
      <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        <span className="font-medium text-[var(--bellum-text-primary)]">{t('center.runResult.nextActionLabel')}</span>
        {' · '}
        {run.nextAction.title}
        {run.nextAction.dueOn
          ? ` — ${t('center.runResult.nextActionDue', { date: formatDate(run.nextAction.dueOn) })}`
          : ''}
      </Text>
    ) : null
  // Aucun pas : rien à résumer — jamais « 0 sur 0 » (une absence n'est pas un zéro).
  if (run.steps.length === 0)
    return (
      <>
        {learned ? (
          <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
            <span className="font-medium text-[var(--bellum-text-primary)]">{t('center.runResult.learnedLabel')}</span>
            {' · '}
            {learned}
          </Text>
        ) : null}
        {nextAction}
      </>
    )
  const doneCount = run.steps.filter(step => step.outcome === 'done').length
  // « Ce que ça apprend » : les raisons réelles des pas passés, quand il y en a —
  // sa ligne n'existe pas sinon. « Résultat » garde alors le compte de pas,
  // jamais la même phrase deux fois.
  return (
    <>
      <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
        <span className="font-medium text-[var(--bellum-text-primary)]">{t('center.runResult.label')}</span>
        {' · '}
        {t('center.runResult.stepsDone', { done: doneCount, total: run.steps.length })}
      </Text>
      {learned ? (
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          <span className="font-medium text-[var(--bellum-text-primary)]">{t('center.runResult.learnedLabel')}</span>
          {' · '}
          {learned}
        </Text>
      ) : null}
      {nextAction}
    </>
  )
}

/** Les exécutions, avec leurs pas et ce qu'ils ont réellement coûté. */
function RunList({ runs }: { runs: WorkflowRunView[] }) {
  const { t } = useTranslation('actions')
  if (runs.length === 0) return <EmptyState text={t('center.empty.runs')} />
  // #3416 (recette démo 10/10) — la prochaine action est celle du COMPTE, pas du run : deux cartes du
  // même compte la répétaient mot pour mot. Elle se lit sur la première carte de chaque compte seulement.
  const seenNextActionAccounts = new Set<string>()
  const runsShowingNextAction = new Set<string>()
  for (const run of runs) {
    if (!run.nextAction || run.status !== 'done') continue
    if (run.account_id) {
      if (seenNextActionAccounts.has(run.account_id)) continue
      seenNextActionAccounts.add(run.account_id)
    }
    runsShowingNextAction.add(run.id)
  }
  return (
    <ul className="flex flex-col gap-2">
      {runs.map(run => (
        <li key={run.id} className="w-full min-w-0">
          <Card className="w-full min-w-0 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="sm" weight="medium">
                {t(`center.workflow.${run.definition_key}`, { defaultValue: humanizeTechnicalKey(run.definition_key) })}
              </Text>
              <div className="flex items-center gap-2">
                <StatusBadge status={run.status} />
                {/* #2865 — `canRetry` est calculé côté serveur
                    (`workflowRunCanRetry`) : jamais recalculé ici. Un pas
                    `unknown` ou un run déjà entièrement réussi ne montre
                    jamais ce bouton. */}
                {run.canRetry ? <RetryRunButton runId={run.id} /> : null}
              </div>
            </div>
            <ul className="mt-2 space-y-1">
              {run.steps.map(step => {
                const undo = undoableStep(step)
                return (
                  <li key={step.key} className="flex items-start justify-between gap-1.5">
                    <div className="flex items-start gap-1.5">
                      <OutcomeIcon outcome={step.outcome} />
                      <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                        {t(`center.step.${step.key}`, { defaultValue: stepFallbackLabel(t, step.key) })}
                        {/* #3416 — une exécution TERMINÉE porte les raisons de ses
                            pas dans « Ce que ça apprend » (RunResultLine) : les
                            répéter ici faisait lire la même phrase deux fois. */}
                        {step.reason && run.status !== 'done' ? ` — ${step.reason}` : ''}
                        {/* #2384.7 — l'audit complet nomme la TENTATIVE, pas
                            seulement le résultat final : un succès au 3ᵉ essai ne
                            se lit plus comme un succès au premier coup. Un pas
                            jamais repris (1) ne l'affiche pas — bruit inutile sur
                            l'immense majorité des pas. */}
                        {step.attempts > 1 ? ` — ${t('center.stepAttempts', { count: step.attempts })}` : ''}
                        {/* #2384.7 — RÉFUTÉ en prod le 23/09 : l'audit nommait
                            plan/tentative/retry/résultat mais JAMAIS la
                            compensation. Un pas ANNULÉ nomme désormais s'il reste
                            rattrapable — `intentReversibility` (déjà tenue par le
                            gate d'approbation, #2400.8) le lit sur le TYPE
                            d'intent, jamais inventé pour l'occasion. Un pas
                            irréversible nomme explicitement qu'aucune
                            compensation n'est possible, plutôt que de se taire. */}
                        {step.outcome === 'cancelled'
                          ? ` — ${t(`center.stepCompensation.${intentReversibility(step.intentType)}`)}`
                          : ''}
                      </Text>
                    </div>
                    {/* #2200.34 — un pas DÉJÀ EXÉCUTÉ (`done`) dont le rollback
                        existe réellement (épopée #2771) propose de le défaire
                        pour de vrai, pas seulement de le nommer. */}
                    {undo ? (
                      <UndoStepButton
                        runId={run.id}
                        stepKey={step.key}
                        rollbackType={undo.rollbackType}
                        targetId={undo.targetId}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
            {/* #3416 — une exécution TERMINÉE dit ce qu'elle a donné (jamais un
                « Terminée » muet) : les raisons réelles de ses pas, sinon le
                compte de pas passés — rien d'inventé. */}
            {run.status === 'done' ? (
              <RunResultLine run={run} showNextAction={runsShowingNextAction.has(run.id)} />
            ) : null}
            {/* #1498 — QUI, QUAND, DEPUIS QUOI. Les cinq réponses étaient déjà
                en base et n'arrivaient nulle part. */}
            <RunTraceLine run={run} />
            {/* #2200.23 — « Action : Ouvrir ». `account_id`/`contact_id`
                arrivaient déjà avec le run (`workflowRunSchema`) ; aucune
                carte ne renvoyait vers la fiche concernée. */}
            {run.account_id || run.contact_id ? (
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {run.account_id ? (
                  <Link
                    to="/accounts/$id"
                    params={{ id: run.account_id }}
                    className="text-xs underline text-[var(--bellum-text-accent)]"
                  >
                    {t('center.openAccount')}
                  </Link>
                ) : null}
                {run.contact_id ? (
                  <Link
                    to="/contacts/$id"
                    params={{ id: run.contact_id }}
                    className="text-xs underline text-[var(--bellum-text-accent)]"
                  >
                    {t('center.openContact')}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </Card>
        </li>
      ))}
    </ul>
  )
}

/** Le catalogue : ce que le produit sait automatiser, même quand rien n'a tourné. */
function WorkflowList({
  workflows,
  outcomes,
}: {
  workflows: {
    key: string
    name: { fr: string; en: string }
    description: { fr: string; en: string }
    steps: WorkflowStep[]
  }[]
  outcomes: Record<string, WorkflowOutcomeView>
}) {
  const { t, i18n } = useTranslation('actions')
  const locale = i18n.language.startsWith('en') ? 'en' : 'fr'
  if (workflows.length === 0) return <EmptyState text={t('center.empty.workflows')} />
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {workflows.map(workflow => (
        <li key={workflow.key}>
          <Card className="flex h-full flex-col p-3">
            <Text size="sm" weight="medium">
              {workflow.name[locale]}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
              {workflow.description[locale]}
            </Text>
            <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2">
              {t('center.stepCount', { count: workflow.steps.length })}
            </Text>
            {/* #2200.8 / #2200.18 / #2201.20 — CE QUE CHAQUE PAS FERA, et sous
                quelle PERMISSION. `expectedResult` et `permission` existent au
                contrat depuis l'origine (`workflowStepSchema`,
                action-os.ts:324,331) sans AUCUN appelant d'affichage : le
                catalogue ne comptait que le NOMBRE de pas, jamais ce qu'ils
                font ni sous quelle autorisation. */}
            <ul className="mt-2 space-y-1.5">
              {workflow.steps.map(step => (
                <li key={step.key} className="flex flex-col gap-0.5">
                  <Text size="xs" weight="medium">
                    {t(`center.step.${step.key}`, { defaultValue: stepFallbackLabel(t, step.key) })}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                    {step.expectedResult}
                  </Text>
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t('center.permissionRequired', {
                      permission: humanizeTechnicalKey(step.permission.replace(/:/g, ' ')),
                    })}
                  </Text>
                </li>
              ))}
            </ul>
            {/* Ce que ce workflow peut PRODUIRE. Le catalogue des pas existait ;
                celui des issues manquait, et sans lui « 12 relances lancées » ne
                dit rien de ce qu'elles ont donné. */}
            <OutcomeCount contract={outcomes[workflow.key]} />
            <div className="mt-auto pt-3">
              <LaunchWorkflowButton definitionKey={workflow.key} />
            </div>
          </Card>
        </li>
      ))}
    </ul>
  )
}

/**
 * Combien d'issues ce workflow peut produire.
 *
 * ⚠️ Rien ne s'affiche SANS contrat d'issue — et surtout pas « 0 issue ». Deux
 * motions du corpus n'en ont aucun, et écrire zéro dirait qu'elles ne produisent
 * rien alors qu'on ne l'a simplement pas contractualisé. C'est la règle
 * « non mesuré n'est pas mesuré à zéro », et GA-19 l'a fait respecter sur la
 * première version de ce composant.
 */
function OutcomeCount({ contract }: { contract: WorkflowOutcomeView | undefined }) {
  const { t } = useTranslation('actions')
  if (!contract) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
      {t('center.outcomeCount', { count: contract.outcomes.length })}
    </Text>
  )
}

/**
 * Le bouton qui DÉMARRE un run.
 *
 * ⚠️ `POST /action-os/runs` n'avait aucun appelant : aucun `workflow_run` n'était
 * jamais créé en production, donc aucune approbation ne pouvait exister, donc le
 * seul chemin câblé du runner n'avait jamais rien à trancher. Tout l'Action OS
 * était un moteur sans démarreur.
 *
 * L'idempotence est portée par le CLIENT, et la clé est celle du GESTE — pas
 * celle du rendu : voir `gestureIdempotency`, qui porte la règle et sa raison.
 *
 * Le résultat est DIT tel quel, y compris quand rien n'est parti : un run
 * `blocked` veut dire qu'aucun pas n'avait de cible ou de connecteur, et
 * l'annoncer « lancé » serait exactement la fausse réussite que ce module a
 * passé un lot entier à corriger.
 */
function LaunchWorkflowButton({ definitionKey }: { definitionKey: string }) {
  const { t } = useTranslation('actions')
  const queryClient = useQueryClient()

  const start = useMutation({
    // #1959.18 — LA CLÉ EST CELLE DU GESTE, PAS CELLE DU RENDU.
    //
    // Avant : `useMemo(() => `${definitionKey}:${crypto.randomUUID()}`)`, donc
    // une clé neuve à chaque MONTAGE. Lancer, rafraîchir pendant que ça tourne,
    // relancer : deux runs pour un seul geste. Le jeton est maintenant rangé
    // dans le stockage de l'onglet sous les coordonnées du geste (« lancer
    // CETTE motion »), donc il survit au remontage ET au rafraîchissement.
    //
    // ⚠️ Il est réclamé DANS le `mutationFn`, au clic — jamais au rendu : une
    // carte du catalogue que personne ne lance ne doit rien écrire.
    mutationFn: async () => {
      const gesture = gestureIdempotency('action-os.run', [definitionKey])
      const outcome = await actionOsApi.start({ definitionKey, idempotencyKey: gesture.key })
      // L'issue est CONNUE et l'écran va la dire : le geste est fini, un
      // prochain clic en sera un autre. `unknown` (et une erreur remontée par
      // le `catch` de react-query, qui n'arrive pas ici) ne relâche rien —
      // doctrine « un timeout n'est pas un échec », la clé retenue est ce qui
      // empêche un re-clic de relancer un run peut-être déjà parti.
      if (outcome.run.status !== 'unknown') gesture.release()
      return outcome
    },
    onSuccess: ({ run, plan }) => {
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.runs() })
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.approvals })
      if (run.status === 'blocked') {
        toast.warning(t('center.launchBlocked'), { description: plan.blocked[0]?.missing })
        return
      }
      toast.success(t('center.launched', { count: plan.executableNow.length }))
    },
    onError: (error: Error) => toast.error(error.message || t('center.launchError')),
  })

  return (
    <Button size="sm" variant="secondary" disabled={start.isPending} onClick={() => start.mutate()}>
      {start.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
      {t('center.launch')}
    </Button>
  )
}

/**
 * #2865 — le bouton qui RELANCE un run MULTI-PAS depuis le pas en échec.
 *
 * ⚠️ N'est rendu QUE si `run.canRetry` (calculé par le serveur,
 * `workflowRunCanRetry`) : ni le statut affiché, ni l'issue d'un pas ne sont
 * relus ici. Un run `blocked` (rien n'est parti — le geste est de brancher un
 * outil) ou dont le pas à rejouer a fini `unknown` ne montre jamais ce bouton.
 *
 * Pas de clé d'idempotence côté client : le serveur réclame le run par une
 * mise à jour conditionnelle sur son statut (`RETRYABLE_RUN_STATUSES` →
 * `running`) — un double clic perd sa course, comme pour
 * `CopilotCardService.retry` (`copilotCardsApi.retry`), qui n'en porte pas
 * non plus.
 */
function RetryRunButton({ runId }: { runId: string }) {
  const { t } = useTranslation('actions')
  const queryClient = useQueryClient()

  const retry = useMutation({
    mutationFn: () => actionOsApi.retryRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: actionOsKeys.runs() })
      toast.success(t('center.retried'))
    },
    onError: (error: Error) => toast.error(error.message || t('center.retryError')),
  })

  return (
    <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate()}>
      {retry.isPending ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
      {t('center.retry')}
    </Button>
  )
}

// #2401.8 — l'observabilité demandée (en cours/terminé/échoué/en attente)
// tient sur cette étiquette + les onglets qui l'entourent (comptés lignes
// 185-227, filtrés lignes 366-373) : rien à ajouter, seule la preuve
// manquait — voir ActionCenter.test.tsx.
function StatusBadge({ status }: { status: WorkflowRunView['status'] }) {
  const { t } = useTranslation('actions')
  // `unknown` n'est pas un échec : le peindre en rouge invite à rejouer un
  // envoi qui a pu partir. Il partage le ton d'alerte de `partial`, qui appelle
  // lui aussi une vérification. `blocked` reste neutre — rien ne s'est passé.
  const tone =
    status === 'done'
      ? 'text-[var(--success-soft-text)]'
      : status === 'failed' || status === 'cancelled'
        ? 'text-[var(--danger-soft-text)]'
        : status === 'partial' || status === 'unknown'
          ? 'text-[var(--warning-soft-text)]'
          : 'text-[var(--bellum-text-secondary)]'
  return (
    <Text size="xs" className={tone}>
      {t(`center.status.${status}`)}
    </Text>
  )
}

function OutcomeIcon({ outcome }: { outcome: WorkflowRunStepOutcome }) {
  if (outcome === 'done') return <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-soft-text)]" />
  if (outcome === 'failed') return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--danger-soft-text)]" />
  // « On ne sait pas si c'est parti » n'est pas « c'est raté ». Même triangle,
  // ton d'alerte : ça se vérifie, ça ne se rejoue pas.
  if (outcome === 'unknown')
    return <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" />
  // #2384.7 — RÉFUTÉ en prod le 23/09 : un pas ANNULÉ n'avait pas d'icône
  // propre et tombait dans le repli Horloge, indistinct d'un pas jamais
  // lancé (`planned`/`queued`).
  if (outcome === 'cancelled') return <X className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
  return <Clock className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" />
}

type WorkflowRunStepOutcome = WorkflowRunView['steps'][number]['outcome']

/**
 * Un onglet vide dit POURQUOI il l'est — et, quand il y a un geste vrai à
 * proposer, il le pose. `action` reste optionnel et se laisse vide quand il n'y
 * a rien d'honnête à offrir : un chargement n'a pas de destination, et « rien à
 * valider » est une bonne nouvelle — y accrocher un bouton en ferait un
 * reproche.
 */
function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <Card className="p-4">
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {text}
      </Text>
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  )
}

/**
 * Les demandes d'écriture vers le CRM, dans la file unique des validations.
 *
 * Même forme que `ErpWriteList` — c'est le point : une décision humaine avant
 * exécution se présente pareil, quel que soit l'outil de destination.
 */
function CrmWriteList({
  requests,
  onDecide,
  onRevise,
  pendingId,
  routing,
  onBulkReject,
  bulkRejectPending,
}: {
  requests: CrmWriteRequestView[]
  onDecide: (id: string, approve: boolean) => void
  onRevise: (id: string, changes: Record<string, string>) => void
  pendingId?: string
  /** #2864 / #2856 — reste du lot précédent : confier et reporter. */
  routing?: {
    currentUserId: string | undefined
    members: readonly WorkspaceMember[]
    onAssign: (id: string, assigneeId: string | null) => void
    onSnooze: (id: string, until: string | null) => void
    pendingId?: string
  }
  /**
   * #2854 (#2201.32) — « Annuler le lot ». Optionnel : un appelant qui ne
   * le fournit pas (aucun aujourd'hui) se comporte exactement comme avant,
   * sans case à cocher.
   */
  onBulkReject?: (ids: string[]) => void
  bulkRejectPending?: boolean
}) {
  const { t } = useTranslation('actions')
  const [editing, setEditing] = useState<string | null>(null)
  // Les corrections en cours de saisie. Une `ref` et pas un état : chaque frappe
  // re-rendrait la liste entière, et le champ perdrait le curseur.
  const draft = useRef<Record<string, string>>({})
  // #2854 — la SÉLECTION est un état de l'écran, jamais du serveur : chaque
  // demande sélectionnée reste une ligne RÉELLE et INDÉPENDANTE, refusée une
  // par une côté serveur (`bulkReject`) — la sélection ne fait qu'éviter N clics.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  if (requests.length === 0) return null
  const selectedIds = requests.map(r => r.id).filter(id => selected.has(id))
  return (
    <>
      {onBulkReject && selectedIds.length > 0 ? (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-2">
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('center.crm.bulkReject.selectedCount', { count: selectedIds.length })}
          </Text>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:min-h-11"
            disabled={bulkRejectPending}
            onClick={() => {
              onBulkReject(selectedIds)
              setSelected(new Set())
            }}
          >
            <X className="size-4" aria-hidden />
            {t('center.crm.bulkReject.action')}
          </Button>
        </div>
      ) : null}
      <ul className="space-y-2">
        {requests.map(request => (
          <li key={request.id}>
            <Card className="p-3">
              <div className="flex items-start gap-2">
                {onBulkReject ? (
                  <input
                    type="checkbox"
                    checked={selected.has(request.id)}
                    aria-label={t('center.crm.bulkReject.checkboxLabel')}
                    className="mt-0.5 size-4 shrink-0"
                    onChange={event => {
                      const next = new Set(selected)
                      if (event.target.checked) next.add(request.id)
                      else next.delete(request.id)
                      setSelected(next)
                    }}
                  />
                ) : null}
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" />
                <div className="min-w-0 flex-1">
                  <Text size="xs" weight="medium" color="text-[var(--warning-soft-text)]">
                    {t(`center.crm.kind.${request.kind}`)}
                  </Text>
                  {/* #4186.2 — la porte sert tous les CRM : VERS LEQUEL part l'écriture,
                    nommé par l'espace CRM de l'utilisateur, jamais par l'éditeur.
                    Sans nom connu, rien ne s'affiche (« ton CRM » est déjà dans le type). */}
                  {request.destination ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]">
                      {t('center.crm.destination', { name: request.destination })}
                    </Text>
                  ) : null}
                  {/* #2200.13 — l'AUTEUR : `origin`/`requestedByYou` voyagent déjà
                    au contrat (`crm-write-request.ts`) sans aucun appelant
                    d'affichage — seul le TYPE de demande était nommé ici. */}
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {t(
                      `center.crm.origin.${request.origin === 'system' ? 'system' : request.requestedByYou ? 'you' : 'otherUser'}`,
                    )}
                  </Text>
                  {/* Le DIFF champ par champ, tel que le serveur l'a FIGÉ à la
                    demande — c'est ce que le retour réclame pour comprendre ce
                    qu'on autorise. Jamais un recalcul : entre la demande et la
                    décision, le monde a pu changer. */}
                  {/* #1498 — ANCIENNE VALEUR → NOUVELLE VALEUR, quand on connaît
                    l'ancienne. Elle est figée au MÊME instant que la nouvelle :
                    la relire à l'ouverture donnerait une valeur fraîche à côté
                    d'une valeur gelée, donc un diff qui ne décrit plus ce qui a
                    été autorisé.

                    ⚠️ `previous` absent = on ne SAIT pas, et ce n'est pas
                    « vide » : on écrit alors la nouvelle valeur seule, plutôt
                    que « non renseigné → … », qui affirmerait un champ vide. */}
                  <ul className="mt-1 space-y-0.5">
                    {request.preview.map(line => (
                      <li key={line.key ?? line.field}>
                        {editing === request.id && line.key ? (
                          <label className="flex items-center gap-2">
                            <Text size="sm" className="shrink-0 text-[var(--bellum-text-secondary)]">
                              {line.field}
                            </Text>
                            <input
                              className="min-w-0 flex-1 rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1 text-sm"
                              defaultValue={line.value}
                              onChange={event => {
                                draft.current[line.key as string] = event.target.value
                              }}
                            />
                          </label>
                        ) : (
                          <Text size="sm">
                            <span className="text-[var(--bellum-text-secondary)]">{line.field}</span> —{' '}
                            {line.previous == null ? (
                              line.value
                            ) : (
                              <>
                                <span className="text-[var(--bellum-text-muted)] line-through">{line.previous}</span>
                                {' → '}
                                {line.value}
                              </>
                            )}
                          </Text>
                        )}
                      </li>
                    ))}
                  </ul>
                  {/* #2201.19 — LA CONSÉQUENCE, nommée jamais nue : `target.risk`
                    (`crm-write-request-view.ts:13-15`) voyageait déjà dans le
                    contrat sans qu'aucun écran ne le lise. `null` = pas mesuré,
                    la ligne se tait plutôt que d'inventer une gravité. */}
                  {request.target?.risk ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                      {t(`center.consequence.${request.target.risk}`)}
                    </Text>
                  ) : null}
                  {/* #2855 (#2201.14) — LA PROVENANCE, nommée jamais devinée :
                    `target.source` voyage déjà dans le contrat depuis le lot
                    précédent, sans qu'aucun écran ne le lise. `null` = geste
                    direct ou provenance non tracée — la ligne se tait plutôt
                    que d'inventer une source. */}
                  {request.target?.source ? (
                    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                      {t(`center.source.${request.target.source.kind}`)}
                    </Text>
                  ) : null}
                  <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-1">
                    {t('center.expiresAt', { date: formatDate(new Date(request.expiresAt)) })}
                  </Text>
                  {routing ? (
                    <ApprovalRoutingControls
                      approval={{
                        id: request.id,
                        assigned_to: request.assignedTo ?? null,
                        expires_at: request.expiresAt,
                      }}
                      currentUserId={routing.currentUserId}
                      members={routing.members}
                      onAssign={routing.onAssign}
                      onSnooze={routing.onSnooze}
                      pending={routing.pendingId === request.id}
                    />
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {/* #1498 — « MODIFIER », ET IL NE MODIFIE RIEN EN PLACE.
                    Corriger crée une demande NEUVE, figée à son tour, et
                    l'ancienne passe en « remplacée » — ni approuvée, ni
                    refusée. C'est ce qui permet le geste sans casser la règle
                    qui rend cette file sûre : on approuve exactement ce qu'on
                    a lu.

                    Il n'apparaît que si les lignes portent leur clé : une
                    demande d'avant ce champ se relit très bien, elle ne se
                    révise simplement pas. */}
                  {editing === request.id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        className="pointer-coarse:min-h-11"
                        disabled={pendingId === request.id}
                        onClick={() => {
                          onRevise(request.id, { ...draft.current })
                          setEditing(null)
                          draft.current = {}
                        }}
                      >
                        {t('center.crm.saveRevision')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="pointer-coarse:min-h-11"
                        onClick={() => {
                          setEditing(null)
                          draft.current = {}
                        }}
                      >
                        {t('center.crm.cancelRevision')}
                      </Button>
                    </>
                  ) : (
                    <>
                      {request.preview.some(line => line.key) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="pointer-coarse:min-h-11"
                          disabled={pendingId === request.id}
                          onClick={() => {
                            draft.current = {}
                            setEditing(request.id)
                          }}
                        >
                          <Pencil className="size-4" aria-hidden />
                          {t('center.crm.revise')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="pointer-coarse:min-h-11"
                        disabled={pendingId === request.id}
                        onClick={() => onDecide(request.id, true)}
                      >
                        <Check className="size-4" aria-hidden />
                        {t('center.approve')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="pointer-coarse:min-h-11"
                        disabled={pendingId === request.id}
                        onClick={() => onDecide(request.id, false)}
                      >
                        <X className="size-4" aria-hidden />
                        {t('center.reject')}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * LA TRAÇABILITÉ D'UNE LIGNE — #1498.
 *
 * *« Chaque action importante doit permettre de comprendre : qui l'a déclenchée,
 * qui l'a validée, depuis quel objet, via quel outil, quel résultat a réellement
 * été confirmé. »*
 *
 * ⚠️ Chaque fragment ne s'écrit QUE s'il est connu. Une trace à trous se lit ;
 * une trace remplie de « — » ou de « Système » inventés ne se lit plus, et c'est
 * la seule ligne de l'écran qu'on rouvrira le jour où quelqu'un demandera qui a
 * autorisé quoi.
 *
 * ⚠️ « Via quel outil » ne nomme JAMAIS un éditeur : la doctrine du dépôt
 * nomme la CAPACITÉ (« ta messagerie », « ton CRM »), et le seul endroit où un
 * éditeur porte son nom est Réglages › Intégrations, là où l'utilisateur
 * autorise lui-même l'accès. C'est le pas qui porte l'intention, et l'intention
 * a déjà son libellé.
 */
function RunTraceLine({ run }: { run: WorkflowRunView }) {
  const { t } = useTranslation('actions')
  const trace = run.trace
  const fragments: string[] = []

  fragments.push(
    trace?.triggeredByName
      ? t('center.trace.triggeredBy', { name: trace.triggeredByName })
      : // ⚠️ Le repli s'appelle `unknown`, et il ne s'appelait pas comme ça.
        // La première version repliait sur `system` et déclarait `schedule` et
        // `event` — trois valeurs qui n'existent dans AUCUN déclencheur. Le
        // contrat en porte six (`workflowTriggerSchema`), et un run réel arrive
        // en `signal_detected` : l'écran écrivait donc « déclenchée
        // automatiquement » là où il pouvait dire « par un signal frais ». Une
        // garde compare désormais les deux listes.
        t(`center.trace.trigger.${trace?.trigger ?? run.trigger}`, {
          defaultValue: t('center.trace.trigger.unknown'),
        }),
  )

  if (trace?.approvedByName) fragments.push(t('center.trace.approvedBy', { name: trace.approvedByName }))
  if (trace?.accountName) fragments.push(t('center.trace.fromAccount', { account: trace.accountName }))

  // Le RÉSULTAT confirmé — l'horodatage de FIN, jamais celui de la demande : ce
  // qui compte est le moment où l'outil a répondu. Une exécution qui n'a pas
  // fini n'en porte aucun ; `formatDate` rend `null` plutôt qu'une date de 1970,
  // et un fragment vide ne se pousse pas.
  const finishedOn = formatDate(run.finished_at, { dateStyle: 'short', timeStyle: 'short' })
  if (finishedOn) fragments.push(finishedOn)

  // #2200.20 / #2201.40 — LA PREUVE : l'identifiant externe existe PAR PAS
  // depuis l'origine (`workflowRunStepSchema.externalRef`, `action-os.ts:471`)
  // sans AUCUN appelant d'affichage — seule la date de fin apparaissait ici.
  // On prend le DERNIER pas qui en porte un : c'est celui le plus proche de la
  // fin du run, donc la référence la plus probable d'être encore d'actualité.
  const stepWithRef = [...run.steps].reverse().find(step => step.externalRef)
  const runExternalRef = stepWithRef?.externalRef ?? null
  const showRef = runExternalRef !== null && !UUID_PATTERN.test(runExternalRef.trim())
  // #2201.44 — un lien seulement quand c'EN EST un : même règle que
  // `CopilotCards` (#1952.10) — une clé CRM interne ou un identifiant de job
  // reste une ligne de texte, une vraie URL devient un lien « Ouvrir ».
  const refIsLink = isHttpUrl(runExternalRef)

  // #2201.43 — LA CAPACITÉ (jamais l'éditeur), sur un run GÉNÉRIQUE. Le
  // catalogue `CAPABILITY_LABEL_KEYS` existait déjà pour le bandeau d'accès
  // (« ton CRM », « ta messagerie »…) sans aucun autre appelant — un deuxième
  // catalogue ici aurait dérivé du même réglage (GA-26).
  //
  // ⚠️ Dérivée du MÊME pas que la preuve ci-dessus, jamais d'un pas au hasard
  // qui porterait la capacité : `capability` NOMME ce que le pas REQUIERT, pas
  // ce qu'il a réellement atteint (`schedule_decision`, capacité `calendar`,
  // se replie sur un rappel interne sans agenda connecté — sa `reason` le dit
  // déjà). Sans preuve externe sur ce pas précis, nommer sa capacité
  // annoncerait un outil non réellement joint (doctrine : jamais un
  // connecteur non branché). Une capacité que le catalogue ne nomme pas
  // (`prospection`, `notifications`) ne pousse non plus aucun fragment : on
  // n'affiche pas ce qu'on n'a pas.
  const runCapability = runExternalRef ? (stepWithRef?.capability ?? null) : null
  const runCapabilityKey = runCapability
    ? Object.prototype.hasOwnProperty.call(CAPABILITY_LABEL_KEYS, runCapability)
      ? CAPABILITY_LABEL_KEYS[runCapability as keyof typeof CAPABILITY_LABEL_KEYS]
      : undefined
    : undefined
  if (runCapabilityKey) {
    // Un `t(...)` imbriqué avec un `ns` explicite dans les options d'un AUTRE
    // `t(...)` échappe à `keys-resolve.test.ts` : sa capture d'options tronque
    // au premier `}` (celui de l'appel interne), et lit `ns: 'access'` comme
    // si c'était le namespace de l'appel EXTERNE — un faux rouge, jamais une
    // clé manquante. La valeur intermédiaire l'évite sans toucher la garde.
    const capabilityLabel = t(runCapabilityKey, { ns: 'access' })
    fragments.push(t('center.trace.viaCapability', { capability: capabilityLabel }))
  }

  return (
    <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-2 flex flex-wrap items-center gap-1">
      <span>{fragments.join(' · ')}</span>
      {runExternalRef && showRef ? (
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true">·</span>
          {refIsLink ? (
            <a
              href={runExternalRef}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 text-[var(--bellum-text-accent)]"
            >
              {t('center.trace.refLink')}
            </a>
          ) : (
            t('center.trace.ref', { ref: runExternalRef })
          )}
        </span>
      ) : null}
    </Text>
  )
}

/** Une référence externe est un LIEN seulement si c'est vraiment une URL — une
 *  clé CRM interne ou un identifiant de job reste une ligne de texte (même
 *  règle que `CopilotCards`, #1952.10). */
function isHttpUrl(value: string | null | undefined): value is string {
  if (!value) return false
  return value.startsWith('http://') || value.startsWith('https://')
}
