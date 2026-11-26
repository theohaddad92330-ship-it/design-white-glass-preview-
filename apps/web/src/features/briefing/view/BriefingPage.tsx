import { AccountFactLines } from '@/components/account/AccountFactLines'
import type { AgendaConflict, AgendaEvent, ContactAccessPath, MailThread, WorkspaceRole } from '@bellum/contracts'
import { isMeetingImminent, resolveRoleStageCell } from '@bellum/contracts'
import { Badge, Box, Button, Spinner, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  History,
  Inbox,
  ListChecks,
  NotebookPen,
  RefreshCw,
  Route,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CustomerPage } from '@/components/page/CustomerPage'
import { ObjectMention } from '@/components/primitives/ObjectMention'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { CompanyAvatar } from '@/components/ui/CompanyAvatar'
import { StructuralPotentialBadge } from '@/features/dashboard/components/perspective/StructuralPotentialBadge'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { ActivationChecklist } from '@/features/onboarding/components/ActivationChecklist'
import {
  BRIEFING_WINDOW_HOURS,
  currentOrNextEvent,
  dayLoad,
  timingOf,
  type AgendaViewMode,
  liveLeftText,
} from '@/features/agenda/agenda-view'
import { AgendaBoard, JoinButton } from '@/features/agenda/view/AgendaBoard'
import { MeetingPrepDialog } from '@/features/agenda/view/MeetingPrepDialog'
import { AskLaura } from '@/components/primitives/AskLaura'
import { useNow } from '@/lib/hooks/use-now'
import { useLauraContext } from '@/features/laura/bubble/page-context-store'
import { useAllBriefingActions, useCurrentUserRole, useDailyBriefing, useSlotProposalPriorityAccounts } from '../api'
import { agendaCompactSummary } from '../agenda-compact'
import {
  orderBriefingBlocks,
  orderMobileBriefingSections,
  type BriefingBlockId,
  type BriefingMobileSectionId,
} from '../lib/block-order'
import { classifyDailyDecisions, detectDispersion, roleForReadAs } from '../lib/daily-decisions'
import { DecisionsSection } from './DecisionsSection'
import { TaskList } from '@/features/tasks/view/TaskList'
import { BlockStateNotice } from './BlockState'
import { ConflictDialog } from './ConflictDialog'
import { DiscoverAlertsBlock } from './DiscoverAlertsBlock'
import { AccountLastOutcomeLine } from './AccountLastOutcomeLine'
import { SlotProposalPriorityAccountsBlock } from './SlotProposalPriorityAccountsBlock'
import { SourcesStrip } from './SourcesStrip'
import { conflictByEventId, conflictingEventIds } from '@/features/agenda/conflicting-events'
import { ActionsBlock } from './ActionsBlock'
import { ReadAsPicker } from './ReadAsPicker'
import { PreparationsBlock } from './PreparationsBlock'
import { briefingActionHeadline } from '../lib/action-task-transform'
import { buildBriefingExportText } from '../lib/export-text'
import { ChainBlockersBlock } from './ChainBlockersBlock'
import { CriticalRisksBlock } from './CriticalRisksBlock'
import { RunningJobsBlock } from './RunningJobsBlock'
import { DailyGesturesBlock } from './DailyGesturesBlock'
import { MyActivityBlock } from './MyActivityBlock'
import { SinceLastVisitBlock } from './SinceLastVisitBlock'
import { ArrivalEntries } from './ArrivalEntries'
import { BriefingHero } from './BriefingHero'
import { AgendaCompact } from './AgendaCompact'
import { QuickModesBlock } from './QuickModesBlock'
import { ActiveAnalysisBanner } from './ActiveAnalysisBanner'
import { TodayScopeSwitch } from './TodayScopeSwitch'
import { TodayStatTiles } from './TodayStatTiles'
import { TodayAddTaskButton } from './TodayAddTaskButton'
import { TodayAgendaCard } from './TodayAgendaCard'
import { TodayDecisionsCard } from './TodayDecisionsCard'
import { TodayMoreMenu, TodayUpdatedLine, type TodayView } from './TodayHeadParts'
import { TodayStartCallout } from './TodayStartCallout'
import { TodayDealsCard, TodayFollowedProfiles, TodayPipeTile, useTodayPipe } from './TodayPortfolio'
import { buildTodayTiles, TODAY_ANCHORS } from '../today-tiles'
import { orderByUrgency } from '../lib/urgency-queue'

const SLOW_LOADING_MS = 5000

/** Vrai quand `loading` dure depuis plus de 5 s ; repasse à faux dès qu'il s'arrête. */
function useSlowLoading(loading: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!loading) {
      setSlow(false)
      return
    }
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS)
    return () => clearTimeout(timer)
  }, [loading])
  return slow
}

/**
 * « Aujourd’hui » — le brief du matin.
 *
 * L'écran répond à une seule question, celle que les méta-analyses placent en
 * tête des jobs-to-be-done : « dites-moi ce qui mérite mon attention
 * maintenant ». D'où l'ordre à l'écran — les actions d'abord, les sources
 * ensuite. Un commercial qui ouvre Bellum à 8 h 30 doit savoir quoi faire avant
 * d'avoir à lire quoi que ce soit.
 *
 * Chaque bloc dit son état. Un bloc vide parce qu'une messagerie n'est pas
 * connectée le DIT, avec le bouton qui répare — il ne se contente pas d'être
 * vide, ce qui se lirait « rien à faire ».
 */
export function BriefingPage({
  agendaMode: agendaModeProp,
  onAgendaModeChange,
  view: viewProp,
  onViewChange,
  planFor,
  onPlanned,
}: {
  /**
   * #2994 — la vue jour/semaine, CONTRÔLÉE par la route (`routes/briefing/
   * index.tsx`) pour survivre au retour (#2112) via `?mode=`. Optionnels : les
   * ~30 tests existants montent `<BriefingPage />` nue, sans route — l'état
   * local reprend la main dans ce cas, comme avant #2994.
   */
  agendaMode?: AgendaViewMode
  onAgendaModeChange?: (mode: AgendaViewMode) => void
  /**
   * Refonte Théo — la vue de la journée (« Mon activité » / « Mon agenda »), CONTRÔLÉE par la
   * route (`?vue=agenda`) pour survivre au retour. Absente : l'état local reprend la main.
   */
  view?: TodayView
  onViewChange?: (view: TodayView) => void
  /** #3693.6 — « Planifier un rendez-vous » venu d'une fiche contact (`?plan=`, résolu par la route). */
  planFor?: { name: string; email: string | null; accountName: string | null }
  onPlanned?: () => void
} = {}) {
  const { t, i18n } = useTranslation('briefing')
  // #3414 — « lire comme » (salle de démo) : l'ordre d'un autre rôle.
  const [readAs, setReadAs] = useState<WorkspaceRole | null>(null)
  const { data, isLoading, isError, refetch, isFetching } = useDailyBriefing(readAs)
  // #2107 (Centre d'actions, recette écran du 25/09/2026) — le compte RÉEL de
  // candidats, avant le plafond du brief : sans cette lecture, un genre évincé
  // du top 7 (mission sans date, profil sans retour, exigence AO non
  // couverte…) n'avait AUCUN lien nulle part. `data?.length` reste `undefined`
  // tant que la requête n'a pas répondu — `ActionsBlock` n'affirme rien avant.
  const allActions = useAllBriefingActions()
  // #2770 (#2101.14) — le classement par priorité, pour choisir à qui
  // proposer un rendez-vous en premier.
  const slotProposalPriorityAccounts = useSlotProposalPriorityAccounts()
  // La vue est portée ICI et non dans le plateau : en semaine, l'agenda prend
  // toute la largeur — sept colonnes dans une demi-page ne se lisent pas.
  // Refonte Théo — « Mon agenda » s'ouvre sur la SEMAINE (la grille horaire du jour reste à un clic).
  const [agendaModeState, setAgendaModeState] = useState<AgendaViewMode>('week')
  const agendaMode = agendaModeProp ?? agendaModeState
  const setAgendaMode = (mode: AgendaViewMode) => {
    onAgendaModeChange?.(mode)
    if (agendaModeProp === undefined) setAgendaModeState(mode)
  }
  const [viewState, setViewState] = useState<TodayView>(planFor ? 'agenda' : 'activity')
  const view = viewProp ?? viewState
  const setView = (next: TodayView) => {
    onViewChange?.(next)
    if (viewProp === undefined) setViewState(next)
  }
  // #2106.35 — LEVÉ depuis `NowStrip` : la porte « Préparer le rendez-vous »
  // n'était accessible que depuis LE bandeau du rendez-vous en cours. La carte
  // « À faire maintenant » (kind `meeting_prep`, via `ActionsBlock`) montre la
  // MÊME préparation (`meetingAttendeesArtifact`) mais ne pouvait l'ouvrir —
  // `href: null` faute d'accès à cet état et à l'`AgendaEvent` complet. Levé
  // ICI, avant les retours anticipés (même raison que `agendaMode` : l'ordre
  // des hooks ne doit pas changer au premier chargement qui aboutit), le
  // dialogue devient accessible depuis les DEUX portes, sans deux vérités sur
  // le rendez-vous à préparer.
  const [prepEvent, setPrepEvent] = useState<AgendaEvent | null>(null)
  // Louis 23/10 — « Affaires en cours » (vue jour PR11) : lue AVANT les retours anticipés, comme les hooks voisins.
  const todayPipe = useTodayPipe()
  const now = useNow()
  // BEL-SC-227 (#3256) — LE RÔLE, pour l'ORDRE des trois décisions du jour
  // (jamais leur contenu, doctrine CLAUDE.md). Même requête que l'écran
  // « Mon profil » (`esnProfileKeys.mine`, GA-26) — jamais un second appel
  // réseau pour la même réponse. `undefined` (profil pas encore lu, ou
  // question jamais répondue) retombe sur l'ordre par défaut, jamais un rôle
  // deviné.
  const currentUserRole = useCurrentUserRole()
  // #2097.40-.44 — SOUS 768PX, LES SOURCES PASSENT EN DERNIER, REPLIÉES.
  // Voir la note posée sur `BriefingDisclosure`, plus bas. AVANT les retours
  // anticipés, pour la même raison que `agendaMode`/`prepEvent` : l'ordre des
  // hooks ne doit pas changer au premier chargement qui aboutit.
  const isMobile = useIsMobile()
  // Le compteur « Conflits · N » vivait au-dessus d'une liste où RIEN ne
  // désignait les créneaux concernés. Les identifiants viennent du serveur, qui
  // fait le calcul : le recalculer ici finirait par contredire le compteur.
  const conflictingIds = useMemo(() => conflictingEventIds(data?.agenda.conflicts), [data])
  // #2926 (reste R05/R06) — la carte de la semaine ne s'ouvrait au clic
  // d'aucune façon ; une carte EN CONFLIT doit mener à la boîte de conflit
  // (réponses, délégation), pas au pré-brief qui ne les porte pas.
  const conflictsByEventId = useMemo(() => conflictByEventId(data?.agenda.conflicts), [data])
  const [openBoardConflict, setOpenBoardConflict] = useState<AgendaConflict | null>(null)

  // Ce que cet écran DÉCLARE montrer à Laura (bulle).
  //
  // ⚠️ AVANT les retours anticipés : sinon l'ordre des hooks changerait au
  // premier chargement qui aboutit. C'est aussi ce qui permet à Laura de dire
  // « ton brief charge encore » plutôt que de croire qu'aucun écran n'est
  // ouvert — et de ne surtout PAS déclarer « 0 action » pendant ce temps.
  useLauraContext({
    kind: 'briefing',
    label: t('page.title'),
    entityId: null,
    facets: data ? [{ label: t('actions.title'), value: String(data.actions.length) }] : [],
    state: isLoading ? 'loading' : 'ready',
  })

  // #VU.2 (18/10) — un chargement qui ne finit pas se DIT au bout de 5 s :
  // le spinner seul laisse croire à un écran vivant, alors que la requête est
  // peut-être perdue.
  const slowLoading = useSlowLoading(isLoading)

  if (isLoading) {
    return (
      <CustomerPage titleInScreen pageTitle={t('page.title')}>
        {/* #2097.54 — L'ICÔNE QUI TOURNE NE DIT RIEN À QUI NE LA VOIT PAS.
            `role="status"` + `aria-live="polite"` annoncent le chargement aux
            technologies d'assistance ; le texte visible porte la MÊME
            information — jamais un `sr-only` qui dédoublerait la traduction
            entre un libellé visible et un libellé lu. */}
        <Box role="status" aria-live="polite" className="flex h-64 flex-col items-center justify-center gap-3">
          <Spinner />
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {slowLoading ? t('page.loadingSlow') : t('page.loading')}
          </Text>
          {slowLoading ? (
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              {t('error.retry')}
            </Button>
          ) : null}
        </Box>
      </CustomerPage>
    )
  }

  if (isError || !data) {
    return (
      <CustomerPage titleInScreen pageTitle={t('page.title')}>
        <Box className="flex flex-col items-start gap-3 rounded-lg border border-[var(--bellum-border)] p-6">
          <Text weight="medium">{t('error.title')}</Text>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t('error.retry')}
          </Button>
        </Box>
      </CustomerPage>
    )
  }

  const generatedTime = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: data.timeZone,
  }).format(new Date(data.generatedAt))

  const agendaServed = data.agenda.state === 'ready' || data.agenda.state === 'partial'

  // Un brief sans action ne dit pas la même chose selon que les sources
  // répondent ou non : « journée calme » n'est vrai que si on a pu regarder.
  // `partial` ne compte donc pas comme servi — la source muette peut cacher
  // précisément ce qui aurait rempli la journée.
  const everySourceReady = data.agenda.state === 'ready' && data.mail.state === 'ready'

  // BEL-SC-227.1-.5 (#3256) — LES TROIS DÉCISIONS DU JOUR, catégorisées à
  // partir du MÊME classement serveur que `ActionsBlock` (`data.actions`,
  // `priority`) — jamais un second score (#3249, règle 4). Le rôle déclaré
  // (`esnProfile`) n'en change que l'ORDRE, jamais le contenu.
  const dailyDecisions = classifyDailyDecisions(
    data.actions,
    now,
    roleForReadAs(readAs, currentUserRole.data?.user_role ?? null),
  )
  // BEL-SC-227.24 — la dispersion administrative, comptée sur les MÊMES actions.
  const decisionsDispersion = detectDispersion(data.actions, now)
  // BEL-SC-227.22 — le budget de temps réel : la MÊME capacité déjà calculée
  // pour le bandeau agenda (`AgendaCompact`, GA-26 — jamais un second calcul).
  // `null` tant que l'agenda n'a pas répondu, jamais un « 0 dossier » deviné.
  const decisionsCapacity = agendaServed
    ? agendaCompactSummary(data.agenda.events, now, data.protectedTime, data.agendaPreferences).capacity
    : null
  // Une carte promue en décision ne se REPROPOSE pas plus bas dans « À faire
  // maintenant » — la même carte affichée deux fois sur le même écran serait
  // le doublon exact que la doctrine interdit (GA-26), jamais une seconde
  // vérité sur le même sujet.
  const decisionActionIds = new Set(dailyDecisions.map(decision => decision.action.id))

  // #2097.43 — SOUS 768PX SEULEMENT, les cartes `meeting_prep` quittent « À
  // faire maintenant » pour un bloc « Préparations » à part (position 4 de
  // l'ordre mobile demandé). Au bureau, `ActionsBlock` continue de les
  // recevoir avec le reste — rien ne change, c'est le MÊME calcul de carte,
  // jamais un second producteur (GA-26). Absent quand il n'y en a aucune :
  // une absence ne fait aucun bloc, jamais un titre au-dessus d'une liste
  // vide.
  const meetingPrepActions = isMobile
    ? data.actions.filter(action => action.kind === 'meeting_prep' && !decisionActionIds.has(action.id))
    : []
  // « Aujourd'hui » est UNE file triée par urgence (refonte Théo, 23/10) : l'urgent d'abord,
  // l'ordre du serveur conservé à urgence égale — voir `lib/urgency-queue.ts`.
  const actionsForActionsBlock = orderByUrgency(
    (isMobile ? data.actions.filter(action => action.kind !== 'meeting_prep') : data.actions).filter(
      action => !decisionActionIds.has(action.id),
    ),
    now,
  )

  /**
   * #2994 — EXPORTER, sur le patron déjà posé par `agenda.brief.export`
   * (`MeetingPrepDialog.tsx`) : un texte copié dans le presse-papiers, RIEN
   * n'est envoyé (doctrine — le copilote prépare, il n'envoie jamais seul).
   * Les priorités reprennent le MÊME libellé que la carte (`PriorityCard`,
   * `briefingActionHeadline`, GA-26) — jamais un second calcul.
   */
  const exportBriefing = () => {
    const text = buildBriefingExportText({
      dayLabel: t('page.export.header', { time: generatedTime }),
      priorityLines: data.actions.map(action => briefingActionHeadline(action, t)),
    })
    void navigator.clipboard
      .writeText(text)
      .then(() => toast.success(t('page.export.done')))
      .catch(() => toast.error(t('page.export.failed')))
  }

  // #2097 (correctif du 26/09) — CHAQUE SECTION EST ÉCRITE UNE SEULE FOIS
  // (GA-26), même JSX aux deux paliers. Seule leur DISPOSITION diffère plus
  // bas : au bureau, les deux grilles `lg:grid-cols-*` d'origine (inchangées,
  // « bureau INCHANGÉ ») ; sous 768px, un empilement linéaire dans l'ordre
  // RÉEL demandé (`mobileSections`). Écrire deux fois la même carte pour deux
  // ordres aurait recréé exactement le défaut mesuré — un ordre qui se défait
  // dès qu'on touche à l'un des deux sans l'autre.
  // BEL-SC-227 (#3256) — « TES DÉCISIONS » : au plus trois, catégorisées
  // (protéger l'existant / prochain mouvement / simplifier), jamais sept
  // priorités équivalentes. Absente quand aucune catégorie n'a de candidat —
  // une absence ne fait aucun bloc (GA-18/19).
  const decisionsBody = (
    <DecisionsSection
      decisions={dailyDecisions}
      dispersionDetected={decisionsDispersion}
      capacity={decisionsCapacity}
      onOpenMeetingPrep={actionId => {
        const event = meetingEventFromActionId(actionId, [
          ...data.agenda.events,
          ...(data.agenda.unfollowedMeetings ?? []),
        ])
        if (event) setPrepEvent(event)
      }}
    />
  )
  const decisionsSection =
    dailyDecisions.length > 0 ? (
      <Section icon={<Target className="size-4" />} title={t('decisions.title')} tone="primary">
        {decisionsBody}
      </Section>
    ) : null

  const actionsSection = (
    <Section
      icon={<Sparkles className="size-4" />}
      // Refonte Théo — « Le plan de Maëlle » : la file unique porte le prénom de qui la lit.
      title={data.firstName ? t('today.plan.title', { name: data.firstName }) : t('actions.title')}
      tone="primary"
      mobileOrder="2"
      anchorId={TODAY_ANCHORS.queue}
      aside={
        <>
          {/* #1395 — LE COPILOTE SUR CET ÉCRAN : un lien, pas un bloc. `AskLaura` n'appelle
              aucune route et ne poste rien : la question arrive dans le composer, l'utilisateur
              la relit. Refonte Théo : rangé dans l'en-tête de la carte des priorités. */}
          <AskLaura question={t('laura.prioritizePrompt')} label={t('laura.prioritize')} />
          <Link
            to="/actions"
            className="flex min-h-11 items-center gap-1 text-sm font-medium text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]"
          >
            <ChevronRight className="size-3.5" aria-hidden="true" />
            {t('today.plan.allTasks')}
          </Link>
        </>
      }
    >
      <ActionsBlock
        actions={actionsForActionsBlock}
        everySourceReady={everySourceReady}
        totalCandidateCount={allActions.data?.length}
        // #2106.35 — la même porte que le bandeau « prochain rendez-vous » :
        // une carte `meeting_prep` retrouve son `AgendaEvent` par préfixe
        // d'identifiant et ouvre le MÊME dialogue, jamais une seconde
        // résolution du compte (voir `meetingEventFromActionId`).
        onOpenMeetingPrep={actionId => {
          // #2095.12 (épopée #2993) — `meeting_no_followup` pointe vers un
          // rendez-vous déjà PASSÉ : `unfollowedMeetings` porte ce bassin,
          // distinct de `events` (la fenêtre À VENIR qu'`AgendaCompact` rend).
          const event = meetingEventFromActionId(actionId, [
            ...data.agenda.events,
            ...(data.agenda.unfollowedMeetings ?? []),
          ])
          if (event) setPrepEvent(event)
        }}
        conflicts={data.agenda.conflicts}
      />
    </Section>
  )

  const tasksSection = (
    <Section icon={<CheckSquare className="size-4" />} title={t('tasks.title')} mobileOrder="9">
      <BlockStateNotice state={data.tasks.state} capability="tasks" reason={data.tasks.reason} />
      {/* #1396 — BORNÉE À CINQ, et elle DIT ce qui reste.
          Mesuré le 06/09 : la page faisait sept écrans de haut (4 970 px
          pour 805 de fenêtre), dont quatre blocs à ~1 330 px chacun. « Sans
          scroller, l'utilisateur doit déjà savoir ce qu'il doit faire dans
          l'heure qui vient » — dix tâches en retard empilées, non.
          La borne vit ICI et pas dans `TaskList` : sur `/tasks`, la liste
          EST la page, et l'y borner cacherait du travail. */}
      {/* #2094.24 (épopée #2767) — le bloc 8 « tâches » vit DERRIÈRE un
          dépli : la liste reste à un tap, mais ne pousse plus les décisions
          du jour hors de l'écran. Même patron de repli que les sources. */}
      {data.tasks.state === 'ready' ? (
        <BriefingDisclosure label={t('tasks.showList')}>
          <TaskList scope="mine" maxItems={5} screen="/briefing/" />
        </BriefingDisclosure>
      ) : null}
    </Section>
  )

  const dailyGesturesSection = (
    <Section icon={<ListChecks className="size-4" />} title={t('dailyGestures.title')} mobileOrder="6">
      <DailyGesturesBlock />
    </Section>
  )

  // Refonte Théo (A · today-jour) — « Les rendez-vous du jour », colonne de droite : la
  // journée en une ligne (#2101), le compteur de conflits, puis une rangée par rendez-vous.
  // La semaine et la grille horaire (glisser, créneaux libres) vivent dans « Mon agenda ».
  const agendaSection = (
    <Section
      icon={<CalendarDays className="size-4" />}
      title={t('today.agendaCard.title')}
      mobileOrder="3"
      aside={
        <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setView('agenda')}>
          <CalendarDays className="size-3.5" aria-hidden="true" />
          {t('today.agendaCard.seeAgenda')}
        </Button>
      }
    >
      <BlockStateNotice state={data.agenda.state} capability="agenda" reason={data.agenda.reason} />
      {/* #2101 — montée seulement quand l'agenda a RÉPONDU : un résumé sur une source
          muette compterait un silence comme une journée vide. */}
      {agendaServed ? (
        <AgendaCompact
          events={data.agenda.events}
          now={now}
          protectedTime={data.protectedTime}
          agendaPreferences={data.agendaPreferences}
        />
      ) : null}
      {data.agenda.conflicts.length ? (
        <Badge variant="outline" className="w-fit gap-1 text-xs text-[var(--danger-soft-text)]">
          <AlertTriangle className="size-3" />
          {t('agenda.conflicts')} · {data.agenda.conflicts.length}
        </Badge>
      ) : null}
      {agendaServed ? (
        <TodayAgendaCard
          events={data.agenda.events}
          conflictsByEventId={conflictsByEventId}
          now={now}
          language={i18n.language}
          onOpenEvent={event => {
            const conflict = conflictsByEventId.get(event.id)
            if (conflict) setOpenBoardConflict(conflict)
            else setPrepEvent(event)
          }}
          onOpenConflict={setOpenBoardConflict}
        />
      ) : null}
    </Section>
  )

  // Refonte Théo (A · today-agenda) — « Mon agenda », un VRAI onglet : la semaine en colonnes
  // (le jour et sa grille horaire à un clic), « Ajouter un rendez-vous », « Proposer un créneau »,
  // l'agenda muet nommé. Le plateau reste monté quand l'agenda n'a pas répondu : son sélecteur
  // est précisément ce qui répare l'écran.
  const agendaView = (
    <Box className="flex w-full flex-col gap-4" data-testid="today-agenda-view">
      <BlockStateNotice state={data.agenda.state} capability="agenda" reason={data.agenda.reason} />
      {/* Refonte Théo (`today-agenda`) — la pastille de la semaine : ce qui se chevauche et ce
          qui mérite une préparation, comptés par le serveur. Rien à compter : aucune pastille. */}
      {agendaServed && (data.agenda.conflicts.length > 0 || data.agenda.needsPreparation.length > 0) ? (
        <Text
          size="xs"
          weight="medium"
          data-testid="today-agenda-points"
          className="w-fit rounded-badge bg-[var(--warning-soft-bg)] px-2.5 py-1 text-[var(--warning-soft-text)]"
        >
          {[
            data.agenda.conflicts.length > 0
              ? t('today.agendaView.conflicts', { count: data.agenda.conflicts.length })
              : null,
            data.agenda.needsPreparation.length > 0
              ? t('today.agendaView.toPrepare', { count: data.agenda.needsPreparation.length })
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {data.agenda.state === 'not_connected' ? null : (
        <AgendaBoard
          enabled
          mode={agendaMode}
          onModeChange={setAgendaMode}
          conflictingIds={conflictingIds}
          onOpenConflict={event => setOpenBoardConflict(conflictsByEventId.get(event.id) ?? null)}
          planFor={planFor}
          onPlanned={onPlanned}
        />
      )}
    </Box>
  )

  const mailSection = (
    <Section
      icon={<Inbox className="size-4" />}
      title={t('mail.title')}
      mobileOrder="8"
      anchorId={TODAY_ANCHORS.replies}
    >
      <BlockStateNotice state={data.mail.state} capability="mailbox" />
      {data.mail.state === 'ready' ? (
        <Box className="flex flex-col gap-4">
          <ThreadGroup label={t('mail.positiveReplies')} threads={data.mail.positiveReplies} />
          <ThreadGroup label={t('mail.unread')} threads={data.mail.unread} />
          {!data.mail.positiveReplies.length && !data.mail.unread.length ? (
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('mail.empty')}
            </Text>
          ) : null}
        </Box>
      ) : null}
    </Section>
  )

  // #2387.7 — « en attente des autres » : ce que quelqu'un d'autre doit encore
  // faire avant que je puisse avancer. Aujourd'hui la seule source déjà lue par
  // ce cockpit est la messagerie (fils envoyés sans réponse, `mail.awaitingReply`,
  // calculée par `buildMailBlock`) — consultants/partenaires/connecteurs restent
  // hors périmètre de cette tranche (tranché sans Louis, #2767) ; les profils envoyés au client sans
  // retour (`awaitingClientProfiles`) rejoignent la section. Sortie de la
  // section « Messagerie » pour ne pas mélanger deux questions différentes :
  // « qu'est-ce qu'on m'a écrit » vs « qu'est-ce que j'attends de quelqu'un ».
  const awaitingClientProfiles = data.awaitingClientProfiles ?? []
  const waitingOnOthersSection =
    (data.mail.state === 'ready' && data.mail.awaitingReply.length > 0) || awaitingClientProfiles.length > 0 ? (
      <Section icon={<Clock className="size-4" />} title={t('waitingOnOthers.title')}>
        <Box className="flex flex-col gap-4">
          {data.mail.state === 'ready' ? (
            <ThreadGroup label={t('mail.awaitingReply')} threads={data.mail.awaitingReply} showAge />
          ) : null}
          {/* #2387.7 — seconde source : les profils envoyés au client sans
              retour. Mêmes rangées que `ThreadGroup` (une seule grammaire). */}
          {awaitingClientProfiles.length > 0 ? (
            <Box className="flex flex-col gap-1.5">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                {t('waitingOnOthers.profilesLabel')} · {awaitingClientProfiles.length}
              </Text>
              {awaitingClientProfiles.map(profile => (
                <Link
                  key={profile.consultantId}
                  to="/consultants/$id"
                  params={{ id: profile.consultantId }}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
                >
                  <Text size="sm" className="truncate">
                    {profile.consultantName}
                  </Text>
                  <Text size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
                    {t('waitingOnOthers.profileDays', { count: profile.days })}
                  </Text>
                </Link>
              ))}
            </Box>
          ) : null}
        </Box>
      </Section>
    ) : null

  // #2097.43 — POSITION 4 : « Préparations ». SOUS 768PX SEULEMENT, et
  // seulement quand au moins une carte `meeting_prep` existe — une absence ne
  // fait aucun bloc, jamais un titre vide. Les MÊMES cartes que celles
  // qu'`ActionsBlock` aurait rendues (`PriorityCard`, GA-26), regroupées à
  // part plutôt que mêlées aux autres priorités sur un écran étroit.
  const preparationsSection =
    meetingPrepActions.length > 0 ? (
      <Section icon={<NotebookPen className="size-4" />} title={t('preparations.title')} mobileOrder="4">
        <PreparationsBlock
          actions={meetingPrepActions}
          onOpenMeetingPrep={actionId => {
            const event = meetingEventFromActionId(actionId, [
              ...data.agenda.events,
              ...(data.agenda.unfollowedMeetings ?? []),
            ])
            if (event) setPrepEvent(event)
          }}
        />
      </Section>
    ) : null

  // #2106.32 — le compte de tâches ENCORE ouvertes, déjà lu ci-dessus (`data.tasks`) :
  // jamais un second calcul, la même lecture voyage.
  const sinceLastVisitBody = (
    <SinceLastVisitBlock now={now} openTasksCount={data.tasks.state === 'ready' ? data.tasks.tasks.length : null} />
  )
  const sinceLastVisitSection = (
    <Section icon={<History className="size-4" />} title={t('sinceLastVisit.title')} mobileOrder="5">
      {sinceLastVisitBody}
    </Section>
  )

  // #2147.5 (épopée #2785) — LA CARTE DE SUIVI, MISE EN AVANT.
  // AVANT les blocages : le ticket #2147 la nomme explicitement « la demande
  // complexe ne doit plus dépendre uniquement d'une courte boucle de chat » —
  // un job qui tourne encore est ce qu'on veut voir en premier au réveil,
  // avant ce qui est simplement arrêté.
  const runningJobsSection = (
    <Section icon={<RefreshCw className="size-4" />} title={t('runningJobs.title')}>
      <RunningJobsBlock jobs={data.runningJobs} />
    </Section>
  )

  const chainBlockersSection = (
    <Section icon={<Route className="size-4" />} title={t('chains:blockers.title')} mobileOrder="7">
      <ChainBlockersBlock blockers={data.chainBlockers} />
    </Section>
  )

  // #3256 (BEL-SC-227.19) — LES RISQUES CRITIQUES AGRÉGÉS. Juste après les
  // blocages de parcours : les deux sont des lectures TRANSVERSES posées
  // avant les comptes individuels — « ce qui bloque » puis « ce qui menace
  // plusieurs objets à la fois ».
  const criticalRisksSection = (
    <Section icon={<AlertTriangle className="size-4" />} title={t('criticalRisks.title')}>
      <CriticalRisksBlock risks={data.criticalRisks} />
    </Section>
  )

  const discoverAlertsSection = (
    <Section icon={<BellRing className="size-4" />} title={t('discoverAlerts.title')} anchorId={TODAY_ANCHORS.signals}>
      <DiscoverAlertsBlock alerts={data.discoverAlerts} lastEventAt={data.discoverAlertsLastEventAt} />
    </Section>
  )

  // #2770 (#2101.14) — le classement par priorité, pour choisir à qui
  // proposer un rendez-vous en premier. Absente de `data` (bloc du brief
  // principal) : lue séparément, même découpage que `useSinceLastVisit`, pour
  // ne jamais faire échouer TOUT le brief si cette seule lecture échoue.
  const slotProposalPriorityAccountsSection = (
    <Section icon={<CalendarDays className="size-4" />} title={t('slotProposalPriorityAccounts.title')}>
      <SlotProposalPriorityAccountsBlock accounts={slotProposalPriorityAccounts.data} />
    </Section>
  )

  const accountsToWatchSection = (
    <Section icon={<TrendingUp className="size-4" />} title={t('accounts.title')}>
      {data.accountsToWatch.length ? (
        <Box className="flex flex-col gap-2">
          {/* #1396 — CINQ AU PLUS. Ce bloc faisait 840 px sur une page qui
              en faisait sept écrans. Un signal frais demande de la lecture,
              pas un geste : il n'a pas à pousser hors de l'écran ce qui, lui,
              en demande un. Le reste est compté et atteignable. */}
          {data.accountsToWatch.slice(0, ACCOUNTS_TO_WATCH_MAX).map(account => (
            // #2097.21 (correctif) — LE LOGO DU COMPTE, à côté de la
            // mention. Mesuré en recette le 25/09 : cette section ne
            // rendait AUCUNE image — `ObjectMention` (F1, tome 7) ne porte
            // volontairement pas d'avatar, donc rien ne le montrait avant
            // ce lot. `CompanyAvatar` retombe déjà sur le monogramme sans
            // logo ni site résolu — jamais un logo inventé. Décoratif,
            // hors du lien : c'est la mention, juste à côté, qui ouvre le
            // dossier — même découpage que `PriorityCard.tsx`.
            <Box
              key={account.accountId}
              className="flex w-full flex-col gap-1 rounded-lg border border-[var(--bellum-border)] px-3 py-2 hover:bg-[var(--bellum-surface-2)]"
            >
              <Box className="flex w-full items-center gap-2">
                <CompanyAvatar name={account.companyName} logoUrl={account.logoUrl} website={account.website} />
                {/* F1 · Mention (tome 7) : nom + UN attribut, action « ouvrir ».
                    C'était trois éléments recopiés à la main, comme aux quatorze
                    autres endroits où le produit mentionne un compte. */}
                <ObjectMention
                  kind="account"
                  id={account.accountId}
                  name={account.companyName}
                  // ⚠️ L'attribut disait « Nouveau signal détecté » — une
                  // phrase qui affirme qu'un signal EXISTE sans dire lequel ni
                  // de quand, donc qu'on ne peut ni vérifier ni contredire. La
                  // date était dans la table depuis le début. Trois formes,
                  // parce que trois situations différentes se ressemblaient :
                  // repéré à cette date, SUIVI depuis cette date (backfill —
                  // on ne sait pas quand il est apparu), et date illisible,
                  // qui se DIT plutôt que de se remplacer par aujourd'hui.
                  attribute={signalAttribute(account, i18n.language, t)}
                  className="min-w-0 flex-1 justify-between"
                />
                {/* #2107.40 — « potentiel structurel » : le MÊME badge que le
                    cockpit (`StructuralPotentialBadge`, #1573.4), sur la MÊME
                    lecture (`marketPaths`) déjà faite pour le TRI seul
                    (GA-262) — jamais un second attribut sur la mention F1,
                    qui refuse volontairement d'en porter plus d'un. Absent
                    sous le seuil de couverture ou mémoire marché
                    indisponible : jamais un badge deviné. */}
                {typeof account.structuralPotentialPaths === 'number' ? (
                  <StructuralPotentialBadge
                    companyName={account.companyName}
                    count={account.structuralPotentialPaths}
                  />
                ) : null}
              </Box>
              {/* #2107.41 — « CE QUI a bougé » (#2107.28 posait déjà le champ
                  sur le contrat et la démo, mais AUCUN appelant ne le rendait
                  — la date voyageait seule via `signalAttribute`). LIGNE
                  SÉPARÉE, même patron que #2107.33 juste en dessous : jamais
                  un second attribut sur la mention F1. Absente quand la
                  matérialisation n'a rien écrit — jamais un libellé deviné. */}
              {account.signalLabel ? (
                <Text size="xs" weight="medium" className="pl-8">
                  {account.signalLabel}
                </Text>
              ) : null}
              {/* Théo A today-jour — « sources cliquables, visibles directement » : le lien vers la page d'origine
                  du signal, sur la carte elle-même. Sans URL vérifiable, `SignalSourceLink` ne rend rien. */}
              {account.signalSourceUrl ? (
                <Box className="pl-8">
                  <SignalSourceLink url={account.signalSourceUrl} sourceKind={account.signalSourceKind} />
                </Box>
              ) : null}
              {/* #2107.33 — « la raison pour laquelle cela concerne cette
                  ESN », en LIGNE SÉPARÉE — jamais un second attribut sur la
                  mention F1, qui refuse volontairement plus d'un attribut
                  (`ObjectMention.tsx`). Absente quand l'analyse n'a rien
                  écrit sur CE signal : la carte omet la ligne, elle
                  n'affiche pas une raison devinée (« on n'affiche pas ce
                  qu'on n'a pas »). */}
              {account.esnReason ? (
                <Text size="xs" className="pl-8 text-[var(--bellum-text-secondary)]">
                  {account.esnReason}
                </Text>
              ) : null}
              {/* #3287 — le dernier résultat DÉCLARÉ du compte, même ligne que
                  sur la carte de priorité (`AccountLastOutcomeLine`). */}
              <AccountLastOutcomeLine accountId={account.accountId} />
              {/* #2107.42 — « accès réel » : la voie d'accès du contact le
                  mieux classé, en LIGNE SÉPARÉE — même patron que .33/.41,
                  jamais un second attribut sur la mention F1. Absente quand
                  aucune voie n'est connue (compte sans contact classable, ou
                  jamais cherchée) — jamais une voie devinée. */}
              {accessPathAttribute(account.accessPath, t) ? (
                <Text size="xs" className="pl-8 text-[var(--bellum-text-secondary)]">
                  {accessPathAttribute(account.accessPath, t)}
                </Text>
              ) : null}
              {/* #4068.6 — ce que l'espace SAIT déjà du compte : date absolue · TYPE · fait, jamais la
                  provenance. Une absence ne fait aucune ligne. */}
              <AccountFactLines
                facts={account.history}
                max={3}
                className="pl-8 text-xs text-[var(--bellum-text-secondary)]"
              />
            </Box>
          ))}
          {data.accountsToWatch.length > ACCOUNTS_TO_WATCH_MAX ? (
            <Link to="/accounts" className="underline">
              <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('accounts.more', { count: data.accountsToWatch.length - ACCOUNTS_TO_WATCH_MAX })}
              </Text>
            </Link>
          ) : null}
        </Box>
      ) : (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('accounts.empty')}
        </Text>
      )}
    </Section>
  )

  const activitySection = (
    <Section icon={<BarChart3 className="size-4" />} title={t('activity.title')}>
      <MyActivityBlock tasks={data.tasks.state === 'ready' ? data.tasks.tasks : undefined} />
    </Section>
  )

  // #2097 (correctif du 26/09) — LE BANDEAU DES SOURCES : ouvert et à sa place
  // d'origine au bureau, replié en DERNIÈRE position sur mobile (jamais un
  // ordre différent pour la même information — c'est sa POSITION qui change,
  // pas son contenu, doctrine « le rôle change l'ordre, jamais le contenu »).
  const sourcesStrip = (
    <SourcesStrip
      states={{ agenda: data.agenda.state, mailbox: data.mail.state, tasks: data.tasks.state }}
      reasons={{ agenda: data.agenda.reason, mailbox: data.mail.reason, tasks: data.tasks.reason }}
      // #2098.9 — la fraîcheur RÉELLE par source, rendue dans le tiroir.
      readAt={{ agenda: data.agenda.readAt, mailbox: data.mail.readAt, tasks: data.tasks.readAt }}
      timeZone={data.timeZone}
    />
  )

  const nowStrip = agendaServed ? (
    <NowStrip
      events={data.agenda.events}
      // Le verdict « ça mérite une préparation » vient du SERVEUR
      // (`needsPreparation` : externe, dans les 24 h). Il était calculé
      // et rendu depuis le premier jour, et RIEN ne le lisait — le motif
      // que ce dépôt connaît par cœur. Le refaire ici (`isExternal` et
      // une soustraction de dates) donnerait deux verdicts sur la même
      // ligne, et celui de l'écran finirait par contredire celui qui
      // décide ailleurs.
      needsPreparation={data.agenda.needsPreparation}
      now={now}
      language={i18n.language}
      onPrepare={setPrepEvent}
    />
  ) : null

  /**
   * #2994 — PARTAGER, décision du jour (tranché sans Louis) : le lien PROFOND
   * de la page, filtres compris (`?mode=week`, #2112 — « les filtres
   * pertinents survivent au retour »), copié dans le presse-papiers. Jamais un
   * lien PUBLIC (le brief est privé au compte) — `window.location.href` porte
   * déjà la session de qui l'ouvre, exactement comme `CopyContactLinkButton`.
   */
  const shareBriefing = () => {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success(t('page.share.done')))
      .catch(() => toast.error(t('page.share.failed')))
  }

  // #2918 / #2100.1-.13 — LES MODES DE TRAVAIL RAPIDES. Voir le docblock de
  // `../quick-modes.ts` pour la portée exacte de ce lot (le sélecteur, pas la
  // session guidée). Rendu commun aux deux paliers, juste après « ce qui se
  // passe maintenant » et avant les priorités : c'est la question qui précède
  // « quoi faire maintenant » quand rien n'est urgent — « avec le temps libre
  // que j'ai, par quoi je commence ? ». Pas de `mobileOrder` numéroté (comme
  // `discoverAlertsSection`/`accountsToWatchSection`/`activitySection`) : ce
  // bloc garde la MÊME position relative, juste après le bandeau « maintenant »,
  // aux deux paliers.
  const quickModesSection = (
    <Section icon={<Compass className="size-4" />} title={t('quickModes.title')}>
      <QuickModesBlock data={data} allActions={allActions.data} />
    </Section>
  )

  // #2145.9 / #2100.9 — le job d'analyse EN COURS, mis en avant. Avant les
  // modes de travail rapides : un job qui tourne déjà répond à la même
  // question qu'eux (« par quoi je commence ? ») avant même de la poser.
  // Rend `null` tant qu'aucun job ne tourne.
  const activeAnalysisSection = <ActiveAnalysisBanner />

  // #3386 — les blocs du bureau, une fois chacun. `Record` exhaustif : un bloc ajouté à
  // `BRIEFING_BLOCK_IDS` sans place ici ne compile pas, et inversement.
  // Refonte Théo (A · today-jour) — deux colonnes : à gauche la file et ce qui se décide
  // (`.v18-stack`), à droite ce qui se consulte (rendez-vous, messagerie, attentes, démarrage).
  // « Ce qui attend ta décision » (`dailyGestures`) vit DANS la carte « Tes décisions » ;
  // « Préparations » n'existe que sous 768 px (#2097.43).
  const desktopBlocks: Record<BriefingBlockId, React.ReactNode> = {
    actions: (
      <>
        {actionsSection}
        {tasksSection}
      </>
    ),
    dailyGestures: null,
    agenda: (
      <>
        {nowStrip}
        {agendaSection}
        {mailSection}
      </>
    ),
    waitingOnOthers: waitingOnOthersSection,
    preparations: preparationsSection,
    sinceLastVisit: null,
    runningJobs: runningJobsSection,
    chainBlockers: chainBlockersSection,
    criticalRisks: criticalRisksSection,
    discoverAlerts: discoverAlertsSection,
    slotProposalPriorityAccounts: slotProposalPriorityAccountsSection,
    accountsToWatch: accountsToWatchSection,
    activity: activitySection,
  }
  const mobileSections: Record<BriefingMobileSectionId, React.ReactNode> = {
    actions: actionsSection,
    agenda: agendaSection,
    preparations: preparationsSection,
    sinceLastVisit: sinceLastVisitSection,
    dailyGestures: dailyGesturesSection,
    runningJobs: runningJobsSection,
    chainBlockers: chainBlockersSection,
    criticalRisks: criticalRisksSection,
    mail: mailSection,
    waitingOnOthers: waitingOnOthersSection,
    tasks: tasksSection,
    discoverAlerts: discoverAlertsSection,
    slotProposalPriorityAccounts: slotProposalPriorityAccountsSection,
    accountsToWatch: accountsToWatchSection,
    activity: activitySection,
  }
  // Refonte Théo — « Tes décisions » : arbitrages et gestes de suivi, une carte à deux vues.
  const decisionsCard = (
    <TodayDecisionsCard
      decisions={decisionsSection ? decisionsBody : null}
      decisionCount={dailyDecisions.length}
      gestures={<DailyGesturesBlock />}
    />
  )
  // F2-FIX #4297 — ce qui OUVRAIT la page, désormais derrière sa première rangée (voir plus bas).
  const dayHead = (
    <>
      {isMobile ? nowStrip : null}
      {isMobile ? decisionsSection : decisionsCard}
      {quickModesSection}
      {/* Louis 23/10 — « Les affaires à faire avancer » (vue jour PR11), sous les modes rapides comme la maquette. */}
      <TodayDealsCard />
    </>
  )
  const readerRole = roleForReadAs(readAs, currentUserRole.data?.user_role ?? null)
  // #3386 (Louis 11/10, « fais tout ») — avec la taille déclarée de l'ESN, c'est la
  // COMBINAISON rôle × stade (`ROLE_STAGE_PLAYBOOK`) qui ordonne les blocs ; sans
  // taille, le rôle seul. L'ordre seul change (c76).
  const consultantSize = currentUserRole.data?.consultant_size ?? null
  const blockOrder = orderBriefingBlocks(readerRole, consultantSize)
  const leftBlocks = blockOrder.filter(id => !TODAY_ASIDE_BLOCKS.has(id))
  const asideBlocks = blockOrder.filter(id => TODAY_ASIDE_BLOCKS.has(id))

  // Refonte Théo (`.v18-head-actions`) — le périmètre, le geste principal, puis le menu « … ».
  const headActions = (
    <>
      <TodayScopeSwitch name={data.firstName} />
      <TodayAddTaskButton />
      <TodayMoreMenu
        onRefresh={() => void refetch()}
        refreshing={isFetching}
        onExport={exportBriefing}
        onShare={shareBriefing}
      />
    </>
  )

  return (
    <CustomerPage titleInScreen pageTitle={t('page.title')}>
      <Box className="flex w-full flex-col gap-5">
        {/* #3050 — « Bien démarrer avec Bellum » : /briefing reste son écran d'arrivée. Sur
            mobile en tête ; au bureau, refonte Théo : en bas de la colonne de droite. */}
        {isMobile ? <ActivationChecklist /> : null}
        {/* #3414 — « Lire comme » en HAUT de page : il change la lecture de tout le brief.
            Salle de démo seulement. */}
        <ReadAsPicker
          value={readAs}
          onChange={setReadAs}
          declaredRole={currentUserRole.data?.user_role ?? null}
          stade={resolveRoleStageCell(readerRole, consultantSize)?.stade ?? null}
        />
        {/* #2113 — L'EN-TÊTE EST UNE PIÈCE : titre (niveau 1, #2456), phrase de bénéfice,
            fraîcheur du brief, et ses gestes à droite (refonte Théo, `.v18-head`). */}
        <BriefingHero
          data={data}
          isMobile={isMobile}
          updatedLine={
            <TodayUpdatedLine generatedAt={data.generatedAt} timeZone={data.timeZone} language={i18n.language} />
          }
          actions={headActions}
        />
        {/* #4962.1 — trois entrées nommées, sans défiler : analyser, trouver, parler à Laura. */}
        <ArrivalEntries />

        {/* #2106.35 — les dialogues vivent ICI, hors des cartes qui les ouvrent : une carte
            qui disparaît n'emporte pas un dialogue ouvert depuis l'AUTRE porte. */}
        <MeetingPrepDialog event={prepEvent} language={i18n.language} onClose={() => setPrepEvent(null)} />
        {openBoardConflict ? (
          <ConflictDialog conflict={openBoardConflict} onClose={() => setOpenBoardConflict(null)} />
        ) : null}

        {view === 'agenda' ? (
          agendaView
        ) : (
          <>
            {/* #2145.9 — le job d'analyse EN COURS, mis en avant (`null` sans job). */}
            {activeAnalysisSection}
            {/* Refonte Théo (23/10) — la rangée de tuiles : ce qui attend, avant la file. */}
            {/* Louis 23/10 — « Affaires en cours » (vue jour PR11) ouvre la rangée, comme dans la maquette. */}
            <TodayStatTiles
              tiles={buildTodayTiles(data)}
              lead={todayPipe ? <TodayPipeTile pipe={todayPipe} /> : null}
            />
            {/* Refonte Théo — « Commencer ici » : la tête de la file unique et son geste. */}
            <TodayStartCallout
              data={data}
              first={actionsForActionsBlock[0] ?? data.actions[0]}
              onOpenMeetingPrep={actionId => {
                const event = meetingEventFromActionId(actionId, [
                  ...data.agenda.events,
                  ...(data.agenda.unfollowedMeetings ?? []),
                ])
                if (event) setPrepEvent(event)
              }}
            />
            {isMobile ? (
              /**
               * #2097 (correctif du 26/09) — L'ORDRE MOBILE RÉEL : sous 768 px, la page rend un
               * agencement linéaire, dans l'ordre 1→9 puis les blocs non numérotés, et enfin les
               * sources, TOUJOURS en dernier. Chaque section est la MÊME JSX qu'au bureau (GA-26)
               * — seule leur position dans le DOM change. #3386 — le rôle fait passer devant
               * les sections de ses rangées d'avant-garde (`orderMobileBriefingSections`).
               */
              <Box className="flex w-full flex-col gap-5">
                {orderMobileBriefingSections(readerRole, consultantSize).map((id, rank) => (
                  <Fragment key={id}>
                    {mobileSections[id]}
                    {rank === 0 ? dayHead : null}
                  </Fragment>
                ))}
                <TodayFollowedProfiles />
                {/* #2097 — SOURCES, TOUJOURS EN DERNIER sur mobile, repliées. */}
                <BriefingDisclosure label={t('sources.title')}>{sourcesStrip}</BriefingDisclosure>
              </Box>
            ) : (
              <>
                {/* Refonte Théo (`.t-acc`) — « Depuis ta dernière visite », replié sur une ligne. */}
                <TodayAccordion label={t('sinceLastVisit.title')}>{sinceLastVisitBody}</TodayAccordion>
                <Box className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
                  {/* #3386 — le rôle choisit par quel bloc la colonne COMMENCE ; chaque bloc,
                      écrit UNE fois, est inchangé — l'ordre varie, jamais le contenu (c76). */}
                  <Box className="flex min-w-0 flex-col gap-5" data-testid="today-main-column">
                    {leftBlocks.map((id, rank) => (
                      <Fragment key={id}>
                        {desktopBlocks[id]}
                        {rank === 0 ? dayHead : null}
                      </Fragment>
                    ))}
                  </Box>
                  <Box as="aside" className="flex min-w-0 flex-col gap-5" data-testid="today-aside-column">
                    {asideBlocks.map(id => (
                      <Fragment key={id}>{desktopBlocks[id]}</Fragment>
                    ))}
                    {/* Louis 23/10 — « Les profils suivis » (vue jour PR11), colonne de droite comme la maquette. */}
                    <TodayFollowedProfiles />
                    <ActivationChecklist />
                  </Box>
                </Box>
                {/* CE QUE LE BRIEF A PU LIRE (#1390, #1396.2) — refonte Théo (`.x-foot`) : en pied
                    de page, une ligne. */}
                {sourcesStrip}
              </>
            )}
          </>
        )}
      </Box>
    </CustomerPage>
  )
}

/** Refonte Théo — les blocs de la colonne de droite (`aside.v18-stack`), au bureau. */
const TODAY_ASIDE_BLOCKS: ReadonlySet<BriefingBlockId> = new Set<BriefingBlockId>([
  'agenda',
  'slotProposalPriorityAccounts',
  'waitingOnOthers',
])

/**
 * Refonte Théo (`.t-acc`) — une carte repliée sur une ligne, qui se déplie au clic. Même
 * mécanique que `BriefingDisclosure` (GA-26) : un `<button>` avec `aria-expanded`, le contenu
 * monté seulement une fois ouvert.
 */
function TodayAccordion({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Box className="flex min-w-0 flex-col rounded-card border border-[var(--bellum-border)] bg-card">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm font-semibold"
      >
        <History className="size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden="true" />
        <span className="min-w-0 flex-1">{label}</span>
        {open ? (
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        )}
      </button>
      {open ? <Box className="border-t border-[var(--bellum-border)] p-4">{children}</Box> : null}
    </Box>
  )
}

function Section({
  icon,
  title,
  children,
  className,
  tone = 'secondary',
  mobileOrder,
  anchorId,
  aside,
}: {
  icon: React.ReactNode
  title: string
  /** Refonte Théo (`.v18-card-head`) — les gestes de la carte, à droite de son titre. */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
  /**
   * #2097 (correctif du 26/09, mesuré en prod sur iPhone le 26/09 07:46) —
   * LA POSITION DE CE BLOC DANS L'ORDRE MOBILE RÉEL : 1 rendez-vous ·
   * 2 priorités · 3 agenda · 4 préparations · 5 ce qui a bougé ·
   * 6 ce qui attend ta décision · 7 ce qui bloque · 8 messagerie · 9 tâches.
   * Un simple attribut `data-*`, jamais une classe `order-*` : la CSS `order`
   * ne s'appliquait à AUCUN parent flex/grid réel (mesuré — l'attribut
   * existait déjà sans qu'aucune règle ne le lise), donc l'ordre VISUEL sous
   * 768px est celui du DOM lui-même, construit par `BriefingPage` (voir
   * `mobileSections`/`desktopSections` plus bas), pas une réorganisation CSS
   * d'un DOM resté identique aux deux paliers. L'attribut reste posé sur les
   * DEUX paliers : c'est ce qui rend l'ordre vérifiable par un test qui lit le
   * DOM plutôt que la structure de données.
   * Position 4 (« préparations ») n'existe QUE sous 768px et seulement quand
   * au moins une carte `meeting_prep` a été retirée du bloc 2 (`ActionsBlock`)
   * — une absence ne fait aucun bloc, jamais un titre vide (`PreparationsBlock`).
   */
  mobileOrder?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  /**
   * #2097.9 / #2097.13 / #2097.15 / #2097.66 — LA HIÉRARCHIE ÉDITORIALE DE LA
   * PAGE.
   *
   * Recette écran du 25/09 (#2097) : les dix titres de section étaient dix
   * `<p>` de 14px identiques (aucun `<h2>` sur toute la page), et les blocs
   * dits secondaires (1196 px de large) portaient le MÊME style que le bloc
   * de décision (« À faire maintenant », 586 px) — rien ne les subordonnait.
   * `tone="primary"` distingue le bloc qui porte une décision : un titre
   * au-dessus de l'échelle (GA-31) et une bordure plus marquée
   * (`--bellum-border-strong`, déjà le jeton du dépôt pour « un contour qui
   * doit se voir seul »). Les blocs secondaires GARDENT leur pleine largeur —
   * GA-34 la réserve aux listes/tableaux — la hiérarchie se lit dans le TITRE
   * et la BORDURE, jamais dans une largeur qu'il serait faux de réduire.
   */
  tone?: 'primary' | 'secondary'
  /** Ancre de la rangée : les tuiles de synthèse y font défiler la page. */
  anchorId?: string
}) {
  return (
    // `min-w-0` : un élément de grille a `min-width: auto` par défaut, donc il
    // prend la largeur de son contenu le plus long et refuse de rétrécir. Mesuré
    // sur un téléphone de 500 px : les sections faisaient 520 px, et l'agenda
    // dépassait de l'écran sans qu'aucun défilement ne l'annonce.
    // Refonte Théo (`.v18-card`) — rayon de carte, fond de carte, sans ombre au repos ; le
    // titre se lit sans icône. L'icône reste portée par l'appelant pour la barre mobile.
    <Box
      as="section"
      className={`flex min-w-0 flex-col gap-3 rounded-card border bg-card p-5 ${
        tone === 'primary' ? 'border-[var(--bellum-border-strong)]' : 'border-[var(--bellum-border)]'
      } ${className ?? ''}`}
      {...(mobileOrder ? { 'data-mobile-order': mobileOrder } : {})}
      {...(anchorId ? { id: anchorId } : {})}
    >
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex min-w-0 items-center gap-2 text-[var(--bellum-text-secondary)]">
          <span aria-hidden="true" className="contents md:hidden">
            {icon}
          </span>
          {/* #2097.9 / #2097.52 — un vrai titre de niveau 2. */}
          <Text
            element="h2"
            size={tone === 'primary' ? 'xl' : 'lg'}
            weight="semibold"
            className="text-[var(--bellum-text-primary)]"
          >
            {title}
          </Text>
        </Box>
        {aside ? <Box className="flex flex-wrap items-center gap-1">{aside}</Box> : null}
      </Box>
      {children}
    </Box>
  )
}

/**
 * #2097.40-.44 — UN REPLI : jadis le bandeau des sources sur mobile, désormais le patron de TOUS les replis de « Ta
 * journée » (depuis ta dernière visite, mon activité, modes rapides).
 *
 * Même mécanique que `MyRecentActivity` dans `SinceLastVisitBlock.tsx` (GA-26 —
 * un seul patron de repli sur cet écran) : un `<button type="button">`, jamais
 * un `<div onClick>` — ce qui se clique se tabule, s'active à Entrée et
 * s'annonce (GA-35) — avec `aria-expanded` pour un lecteur d'écran, et le
 * contenu remonté seulement quand il est ouvert, jamais masqué en CSS.
 *
 * Fermé par défaut : sur 375px, « qu'est-ce qui a lu quoi » n'est pas la
 * première question du matin — c'est celle qu'on pose en cas de doute.
 */
function BriefingDisclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Box className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-fit items-center gap-1.5 rounded-md py-1 text-xs text-[var(--bellum-text-secondary)] underline underline-offset-2 pointer-coarse:min-h-11"
      >
        {open ? (
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        )}
        {label}
      </button>
      {open ? children : null}
    </Box>
  )
}

// Les cartes du brief vivent dans `ActionsBlock` : elles portent maintenant un
// fait, un contexte, une provenance et un dépli, ce qui ne tient plus dans une
// ligne de cet écran. Une action sans destination (`href` à null) y reste un
// CONSTAT — la présenter comme cliquable promet une page qui n'existe pas.

/**
 * CE QUI SE PASSE MAINTENANT.
 *
 * Le bandeau porte une seule chose : le rendez-vous en cours, ou le prochain,
 * avec son compte à rebours et le bouton pour y entrer. C'est le geste de 9 h 58
 * — et le chercher dans une liste de dix lignes, c'est déjà être en retard.
 *
 * Il ne s'affiche pas quand il n'y a plus rien : une carte « aucun rendez-vous »
 * en tête d'écran occuperait la place de ce qui compte les jours où il se passe
 * quelque chose.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1392 — « PRÉPARER LE RDV » : UNE PORTE, PAS UNE COPIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le brief de rendez-vous existe en entier — qui je vois, ce qu'on s'est dit, ce
 * qui bouge, les enjeux, l'entourage, les profils à positionner, l'objectif,
 * chacun avec sa source et sa date (`MeetingPrepDialog`). Il n'avait qu'UNE
 * porte : ouvrir le plateau d'agenda et cliquer le créneau. Sur l'écran qui
 * annonce précisément ce rendez-vous, rien n'y menait — le motif que ce dépôt
 * connaît par cœur, du code juste que personne n'appelle.
 *
 * Le retour le dit lui-même : « ne pas recopier le brief sur Aujourd'hui,
 * seulement créer la porte d'entrée ». C'est exactement un bouton.
 *
 * ⚠️ Le bouton suit `needsPreparation`, rendu par le serveur (« externe, dans
 * les 24 h »), et non un `isExternal` relu ici : deux verdicts sur la même ligne
 * finissent par se contredire, et celui-là décide déjà ailleurs. Il était
 * calculé et servi depuis le premier jour sans qu'aucun écran ne le lise.
 *
 * ⚠️ Le NOM DU COMPTE ne s'affiche pas sur le bandeau, alors que le retour le
 * montre en exemple. Aucun champ d'`AgendaEvent` ne le porte : c'est
 * `MeetingPrepDialog` qui RÉSOUT le compte à partir des invités. Le refaire ici
 * serait une seconde résolution, donc deux vérités possibles sur la même ligne —
 * et le titre du brief, lui, nomme bien le compte (« Brief — sujet · société »).
 * Le bandeau dit ce qu'il sait : le sujet, l'heure, et si c'est un client.
 */
function NowStrip({
  events,
  needsPreparation,
  now,
  language,
  onPrepare,
}: {
  events: AgendaEvent[]
  needsPreparation: AgendaEvent[]
  now: Date
  language: string
  // #2106.35 — le dialogue lui-même est LEVÉ au niveau de `BriefingPage` : la
  // carte « À faire maintenant » l'ouvre par une AUTRE porte, et un état local
  // ici l'aurait gardé hors de sa portée.
  onPrepare: (event: AgendaEvent) => void
}) {
  const { t } = useTranslation('briefing')
  const next = currentOrNextEvent(events, now)
  if (!next) return null

  const timing = timingOf(next, now)
  // #recette-live-14/09 : « 2 rendez-vous à venir · 50 h en réunion » sur une
  // fenêtre de 36 h — `events` vient du serveur, borné à cette même fenêtre
  // (`briefing.service.ts`, `buildAgendaBlock`). `meetingMinutes` doit
  // s'arrêter à `until`, sinon un évènement qui déborde de la fenêtre compte
  // au-delà d'elle.
  const until = new Date(now.getTime() + BRIEFING_WINDOW_HOURS * 3600_000)
  const load = dayLoad(events, now, until)
  const time = next.start
    ? new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(next.start))
    : null

  const headline =
    timing.phase === 'live'
      ? timing.minutesLeft === null
        ? t('agenda.board.live')
        : liveLeftText(t, timing.minutesLeft)
      : timing.minutesUntil !== null && timing.minutesUntil < 60
        ? t('agenda.board.inMinutes', { count: timing.minutesUntil })
        : (time ?? '')

  return (
    <Box
      // #2097.40 — position 1 de l'ordre mobile (« prochain rendez-vous ») :
      // voir la note sur `mobileOrder` dans `Section`, même mécanique.
      data-mobile-order="1"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        timing.phase === 'live' || timing.phase === 'soon'
          ? 'border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-400)_8%,transparent)]'
          : 'border-[var(--bellum-border)]'
      }`}
    >
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Box className="flex flex-wrap items-center gap-2">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
            {headline}
          </Text>
          {/* #3533 — un rendez-vous sans titre ne fait AUCUNE ligne : « (sans objet) »
              n'est pas une donnée, c'est l'aveu d'une absence. */}
          {next.summary?.trim() ? (
            <Text size="sm" weight="medium" className="truncate">
              {next.summary}
            </Text>
          ) : null}
        </Box>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {/* Le compte du jour, dit sans arrondir : un salon qui dure toute la
              journée n'est pas « 24 h de réunion ». */}
          {t('agenda.board.remaining', { count: load.remaining })}
          {load.meetingMinutes
            ? ` · ${t('agenda.board.meetingTime', { hours: formatDuration(load.meetingMinutes) })}`
            : ''}
        </Text>
      </Box>
      <Box className="flex shrink-0 flex-wrap items-center gap-2">
        {/* La préparation ne vaut que pour un rendez-vous CLIENT : un point
            interne n'a rien à préparer, et le brief le dirait lui-même
            (« Point interne : pas d'objectif commercial »). Proposer le bouton
            partout ferait promettre un contenu qui n'existe pas. */}
        {needsPreparation.some(event => event.id === next.id) ? (
          // #2319.21 — à T-1 h, le brief se PROPOSE : la même porte, mise en
          // avant, et qui dit « maintenant ». L'horizon est celui de la carte
          // « à préparer » côté serveur (`MEETING_PREP_IMMINENT_MINUTES`).
          isMeetingImminent(next.start, now) ? (
            <Button size="sm" onClick={() => onPrepare(next)}>
              <NotebookPen className="size-3.5" />
              {t('agenda.board.prepareNow')}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => onPrepare(next)}>
              <NotebookPen className="size-3.5" />
              {t('agenda.board.prepare')}
            </Button>
          )
        ) : null}
        <JoinButton event={next} phase={timing.phase} />
      </Box>
    </Box>
  )
}

/**
 * Ce qu'un compte qui a bougé dit de lui-même — un fait DATÉ, pas un constat
 * d'existence.
 *
 * Trois formes et non une : « repéré le … » n'est vrai que d'une détection
 * exacte. Une ligne issue du backfill sait seulement que le signal était DÉJÀ
 * là (`first_detection_exact` à faux), et une date illisible ne devient pas
 * aujourd'hui — elle se dit inconnue.
 */
function signalAttribute(
  account: { detectedAt: string | null; detectionExact: boolean },
  language: string,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  const parsed = account.detectedAt ? Date.parse(account.detectedAt) : Number.NaN
  if (Number.isNaN(parsed)) return t('accounts.signalUndated')
  const date = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(new Date(parsed))
  return account.detectionExact ? t('accounts.signalOn', { date }) : t('accounts.signalTrackedSince', { date })
}

/**
 * #2107.42 — « accès réel » : la voie d'accès du contact le mieux classé du
 * compte. MÊME dérivation que `accessPathLabel` (`PriorityPathSection.tsx`,
 * l'onglet Contacts) — jamais une seconde règle (GA-26) : `kind: null` +
 * `missing_reason: 'never_searched'` est une absence PURE, retirée, jamais
 * affichée (« on n'affiche pas ce qu'on n'a pas ») ; `searched_nothing_found`
 * RESTE nommé, une recherche qui n'a rien trouvé est un fait mesuré.
 */
function accessPathAttribute(path: ContactAccessPath | null, t: (key: string) => string): string | null {
  if (!path) return null
  const key = path.kind ?? path.missing_reason
  if (!key || key === 'never_searched') return null
  return t(`accounts.access.${key}`)
}

/** « 3 h 30 » plutôt que « 210 min » — personne ne compte sa journée en minutes. */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${String(rest).padStart(2, '0')}` : `${hours} h`
}

/**
 * #2106.35 — L'`AgendaEvent` complet derrière une carte `meeting_prep`.
 *
 * `briefing-actions.ts` compose l'identifiant de la carte en `meeting:<id>`
 * (jamais l'inverse) : ce préfixe est la SEULE information qu'une carte porte
 * sur « quel rendez-vous ». Fonction PURE — retrouver l'événement est un
 * calcul, pas un effet, donc vérifiable sans monter un arbre React.
 *
 * `null` sur un préfixe absent ou un identifiant qui ne correspond à AUCUN
 * événement de la fenêtre lue : la carte ne promet pas un dialogue qui
 * s'ouvrirait sur rien.
 */
function meetingEventFromActionId(actionId: string, events: AgendaEvent[]): AgendaEvent | null {
  const MEETING_PREFIX = 'meeting:'
  if (!actionId.startsWith(MEETING_PREFIX)) return null
  const eventId = actionId.slice(MEETING_PREFIX.length)
  return events.find(event => event.id === eventId) ?? null
}

/**
 * Combien de fils AU PLUS par groupe, dans le brief du matin (#1396).
 *
 * Quatre. La messagerie faisait 1 346 px à elle seule — trois groupes rendus
 * sans borne — sur une page de sept écrans. Le brief dit ce qu'il faut faire
 * dans l'heure qui vient ; la boîte complète a sa maison, et le compteur du
 * titre reste le VRAI total, donc rien n'est caché en silence.
 */
const THREADS_PER_GROUP = 4

/** Combien de comptes à surveiller le brief montre au plus (#1396). */
const ACCOUNTS_TO_WATCH_MAX = 5

function ThreadGroup({ label, threads, showAge = false }: { label: string; threads: MailThread[]; showAge?: boolean }) {
  const { t } = useTranslation('briefing')
  if (!threads.length) return null
  const shown = threads.slice(0, THREADS_PER_GROUP)
  const hidden = threads.length - shown.length
  return (
    <Box className="flex flex-col gap-1.5">
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
        {/* Le compteur porte le total RÉEL, pas le nombre affiché : c'est lui
            qui empêche la borne de mentir. */}
        {label} · {threads.length}
      </Text>
      {shown.map(thread => (
        <Box
          key={thread.threadId}
          className="flex items-center justify-between gap-3 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
        >
          <Box className="flex min-w-0 flex-1 flex-col">
            {/* #3533 — une absence ne fait aucune ligne : sans objet (null ou
                blanc), l'interlocuteur prend la place, jamais « (sans objet) ». */}
            {thread.subject?.trim() ? (
              <Text size="sm" className="line-clamp-2 break-words" title={thread.subject}>
                {thread.subject}
              </Text>
            ) : null}
            {thread.counterpart ? (
              <Text
                size={thread.subject?.trim() ? 'xs' : 'sm'}
                className={thread.subject?.trim() ? 'truncate text-[var(--bellum-text-secondary)]' : 'truncate'}
              >
                {thread.counterpart}
              </Text>
            ) : null}
          </Box>
          {showAge && thread.daysSinceLastMessage !== null ? (
            <Text size="xs" className="shrink-0 text-[var(--bellum-text-secondary)]">
              {t('mail.days', { count: thread.daysSinceLastMessage })}
            </Text>
          ) : null}
        </Box>
      ))}
      {hidden > 0 ? (
        <Link to="/mailbox" className="underline">
          <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('mail.more', { count: hidden })}
          </Text>
        </Link>
      ) : null}
    </Box>
  )
}
