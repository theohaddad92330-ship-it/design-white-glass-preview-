import type { AgendaEvent, FreeSlot } from '@bellum/contracts'
import { personAttendeesOf } from '@bellum/contracts'
import { Badge, Box, Button, Spinner, Text } from '@bellum/ui'
import {
  AlertTriangle,
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  MapPin,
  Plus,
  Sparkles,
  Users,
  Video,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBellumCreatedEventIds } from '@/features/briefing/api'
import { useIsMobile } from '@/features/mobile/useIsMobile'
import { useNow } from '@/lib/hooks/use-now'
import {
  daysOf,
  eventsOfDay,
  agendaEventTitle,
  isAllDay,
  isBellumCreatedAgendaEvent,
  isProposedAgendaEvent,
  isSameDay,
  shiftAnchor,
  timingOf,
  undatedEvents,
  windowFor,
  agendaPointsOf,
  agendaVisualKind,
  type AgendaViewMode,
  liveLeftText,
} from '../agenda-view'
import {
  useAgendaCalendars,
  useAgendaStatus,
  useAgendaWindow,
  useCreateAgendaEvent,
  useFreeSlots,
  useRescheduleEvent,
} from '../api'
import { AgendaCalendarPicker } from './AgendaCalendarPicker'
import { AgendaGrid } from './AgendaGrid'
import { AgendaSlotProposalPicker } from './AgendaSlotProposalPicker'
import { AgendaKindLine } from './AgendaKindLine'
import { RoomLines } from './RoomLines'
import { RescheduleDialog } from './RescheduleDialog'
import { MeetingPrepDialog } from './MeetingPrepDialog'
import { NewEventDialog } from './NewEventDialog'
import { toIsoRange, type DragProposal } from '../agenda-drag'
import { defaultNewEventSlot } from '../agenda-slot-input'
import { toast } from 'sonner'

/**
 * L'AGENDA, tel qu'on le regarde vraiment : une journée, ou une semaine.
 *
 * L'écran ne se contente pas de lister les prochaines heures — il se cale sur
 * l'instant présent. Une réunion en cours se voit, le prochain rendez-vous
 * porte son compte à rebours, et le lien de visio est un BOUTON : le geste que
 * quelqu'un fait à 9 h 59 est de cliquer pour entrer, pas de recopier une URL.
 *
 * La fenêtre affichée est demandée au serveur telle quelle, plutôt que découpée
 * dans le brief : le brief regarde 36 heures, et une semaine découpée dedans
 * serait vide à partir de mercredi sans que rien ne le dise.
 */
export function AgendaBoard({
  enabled,
  mode,
  onModeChange,
  conflictingIds,
  onOpenConflict,
  planFor,
  onPlanned,
}: {
  enabled: boolean
  mode: AgendaViewMode
  onModeChange: (mode: AgendaViewMode) => void
  /**
   * Les rendez-vous qui se chevauchent, calculés PAR LE SERVEUR.
   *
   * Le brief annonçait « Conflits · 4 » au-dessus d'une liste où rien ne
   * désignait les quatre créneaux : un compteur sans référent annonce un
   * problème puis laisse chercher. Absent ⇒ aucune ligne marquée, comportement
   * inchangé pour les écrans qui n'ont pas cette information.
   */
  conflictingIds?: ReadonlySet<string>
  /**
   * #2926 (reste R05/R06) — une carte EN CONFLIT ouvre la boîte de conflit
   * (réponses, délégation) plutôt que le pré-brief : c'est là que vivent ces
   * détails, pas dans `MeetingPrepDialog`. Absent ⇒ la carte retombe sur le
   * pré-brief comme n'importe quel autre rendez-vous — jamais un clic muet.
   */
  onOpenConflict?: (event: AgendaEvent) => void
  /**
   * #3693.6 — « Planifier un rendez-vous » depuis une fiche contact : le sujet
   * et l'invité arrivent préremplis, le créneau reste au commercial. Rien n'est
   * posé tant qu'il n'a pas validé ; l'invitation part à cette validation.
   */
  planFor?: { name: string; email: string | null; accountName: string | null }
  /** Appelé une fois le rendez-vous posé — la route retire alors `?plan=`. */
  onPlanned?: () => void
}) {
  const { t, i18n } = useTranslation('briefing')
  const now = useNow()
  // #2097 (correctif du 26/09) — bascule la journée en LISTE sous 768px, voir
  // plus bas : `AgendaGrid` (colonne d'heures) rendait vide sur un téléphone.
  const isMobile = useIsMobile()
  const [anchor, setAnchor] = useState<Date>(() => new Date())

  const range = useMemo(() => windowFor(mode, anchor), [mode, anchor])
  const { data, isLoading, isError, refetch, isFetching } = useAgendaWindow(range, enabled)
  // Les trous ne servent qu'à la vue JOUR : sept colonnes de plages libres ne
  // se lisent pas, et la requête serait payée pour rien.
  const {
    data: freeSlots,
    isFetching: freeSlotsFetching,
    isPlaceholderData: freeSlotsPlaceholder,
  } = useFreeSlots(range, enabled && mode === 'day')
  // #2926 — on ne dessine « N h de libre » qu'une fois l'agenda LU : les plages venaient d'une
  // lecture en cours (ou de la journée précédente, gardée en attendant) et se corrigeaient à
  // vue (5 h, puis 3 h, puis 2 h). Tant que l'une des deux lectures n'est pas terminée : rien.
  const freeSlotsSettled = !isFetching && !freeSlotsFetching && !freeSlotsPlaceholder
  // #2770 (#2101.19/.21/.22/.37) — les évènements que BellumAI a écrits par la
  // porte de proposition de créneau, croisés ci-dessous avec `event.id` pour
  // que la grille/le plateau les distinguent visuellement.
  const { data: bellumCreatedEventIds } = useBellumCreatedEventIds(enabled)
  const bellumCreatedEventIdSet = useMemo(() => new Set(bellumCreatedEventIds?.eventIds ?? []), [bellumCreatedEventIds])
  // La capacité du fournisseur, lue AVANT d'ouvrir la confirmation : elle
  // décide si la case « prévenir les invités » peut être décochée.
  const { data: agendaStatus } = useAgendaStatus(enabled)
  // #2101.27 — les agendas où la création peut ATTERRIR. `AgendaService.createEvent`
  // écrit toujours chez le fournisseur CONNECTÉ (`agendaStatus.provider`,
  // même sélection que `connectedBackend(userId)` côté serveur) : un
  // calendrier d'un AUTRE fournisseur listé ici serait accepté à l'écran et
  // refusé au clic, sans qu'on sache pourquoi.
  const { data: agendaCalendars } = useAgendaCalendars(enabled)
  const writableCalendars = (agendaCalendars?.calendars ?? [])
    .filter(calendar => calendar.canWrite && calendar.provider === agendaStatus?.provider)
    .map(calendar => ({ id: calendar.id, name: calendar.name }))
  const reschedule = useRescheduleEvent()
  // Le geste PROPOSE, il n'écrit pas. Tant que ceci est renseigné, rien n'est
  // parti : c'est la confirmation qui déclenche l'appel.
  const [pendingMove, setPendingMove] = useState<{ event: AgendaEvent; proposal: DragProposal } | null>(null)
  // Le trou cliqué, en attente d'un sujet. Rien n'est créé tant qu'il est là.
  const [pendingSlot, setPendingSlot] = useState<FreeSlot | null>(null)
  // Le rendez-vous ouvert pour préparation — lecture seule, aucun risque.
  const [prepEvent, setPrepEvent] = useState<AgendaEvent | null>(null)
  // Théo A today-agenda.R3 — « Ajouter un rendez-vous » : même formulaire que le
  // trou cliqué, mais le créneau se tape. Rien n'est créé tant qu'il est ouvert.
  const [addingEvent, setAddingEvent] = useState(false)
  const addSlot = useMemo(() => (addingEvent ? defaultNewEventSlot(new Date()) : null), [addingEvent])
  const createEvent = useCreateAgendaEvent()

  // Théo A today-agenda.A2 — reprogrammer par la modale : la proposition de
  // départ est le créneau actuel, retapé (heure, jour) avant confirmation.
  const startReschedule = (event: AgendaEvent) => {
    if (!event.start || !event.end) return
    const start = new Date(event.start)
    const end = new Date(event.end)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
    const startMinutes = start.getHours() * 60 + start.getMinutes()
    const endMinutes = startMinutes + Math.round((end.getTime() - start.getTime()) / 60_000)
    setPendingMove({ event, proposal: { startMinutes, endMinutes } })
  }

  // #2926 (reste R05/R06) — LE geste d'ouverture d'une carte, jour ou semaine :
  // un rendez-vous en conflit va à la boîte de conflit (réponses, délégation),
  // les autres au pré-brief (fuseaux de l'invité). Un seul endroit décide,
  // plutôt qu'une règle recopiée dans la grille et dans la semaine (GA-26).
  const openCard = (event: AgendaEvent) => {
    if (conflictingIds?.has(event.id) && onOpenConflict) {
      onOpenConflict(event)
      return
    }
    setPrepEvent(event)
  }

  const confirmCreate = (draft: {
    startsAt?: string
    endsAt?: string
    summary: string
    attendees: string[]
    addConferencing: boolean
    reminderMinutes: number | null
    calendarId?: string
    recurrence?: string
  }) => {
    const slot = pendingSlot ?? addSlot
    if (!slot) return
    createEvent.mutate(
      {
        summary: draft.summary,
        startsAt: draft.startsAt ?? slot.start,
        endsAt: draft.endsAt ?? slot.end,
        attendees: draft.attendees,
        addConferencing: draft.addConferencing,
        // #2101.29 — CHOISI dans le formulaire quand le fournisseur le pose
        // réellement (`NewEventDialog`, `allowCustomReminder`) ; sinon le
        // formulaire renvoie déjà le défaut du contrat (60), inchangé.
        reminderMinutes: draft.reminderMinutes,
        // #2101.27 / #2101.26 — absents, le contrat retombe sur son
        // comportement historique (calendrier par défaut, évènement unique).
        ...(draft.calendarId ? { calendarId: draft.calendarId } : {}),
        ...(draft.recurrence ? { recurrence: draft.recurrence } : {}),
        ...(planFor?.accountName ? { accountName: planFor.accountName } : {}),
        inviteSelf: false,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      {
        onSuccess: () => {
          toast.success(t('agenda.newEvent.created'))
          setPendingSlot(null)
          setAddingEvent(false)
          onPlanned?.()
        },
        // Le refus vient souvent du serveur avec une raison lisible (espace de
        // démonstration, agenda en lecture seule) : on la relaie telle quelle
        // plutôt que de la remplacer par un message générique.
        onError: (error: Error) => {
          toast.error(error?.message || t('agenda.newEvent.failed'))
          setPendingSlot(null)
          setAddingEvent(false)
        },
      },
    )
  }

  const confirmMove = (notifyGuests: boolean) => {
    if (!pendingMove) return
    const range_ = toIsoRange(pendingMove.event, pendingMove.proposal)
    if (!range_) {
      // Sans date d'origine exploitable, on ne devine pas le jour : déplacer un
      // rendez-vous dont on ignore la date, c'est en créer un ailleurs.
      toast.error(t('agenda.reschedule.failed'))
      setPendingMove(null)
      return
    }
    reschedule.mutate(
      { eventId: pendingMove.event.id, ...range_, notifyGuests },
      {
        onSuccess: result => {
          // Le message dit ce qui s'est RÉELLEMENT passé, pas ce qui a été
          // demandé : sur un agenda qui prévient toujours, annoncer un
          // déplacement discret serait un mensonge que le client corrigerait.
          toast.success(
            result.guestsNotified ? t('agenda.reschedule.movedNotified') : t('agenda.reschedule.movedSilent'),
          )
          setPendingMove(null)
        },
        onError: () => {
          toast.error(t('agenda.reschedule.failed'))
          setPendingMove(null)
        },
      },
    )
  }

  const events = useMemo(
    () =>
      (data?.events ?? [])
        .filter(event => !event.cancelled)
        .map(event => (bellumCreatedEventIdSet.has(event.id) ? { ...event, createdByBellum: true } : event)),
    [data, bellumCreatedEventIdSet],
  )
  const days = useMemo(() => daysOf(mode, anchor), [mode, anchor])
  const orphans = useMemo(() => undatedEvents(events), [events])
  // #2103.27 — un rendez-vous ANNULÉ n'est pas jeté : filtré de la grille (dont
  // il romprait le positionnement/glisser-déposer), il reste nommé à côté,
  // lecture seule, plutôt que de simplement disparaître. Sans date exploitable
  // dans la période affichée, il ne fait aucune ligne — même règle que la grille.
  const cancelledEvents = useMemo(
    () =>
      (data?.events ?? []).filter(
        event => event.cancelled && event.start && days.some(day => isSameDay(new Date(event.start as string), day)),
      ),
    [data, days],
  )
  const isToday = mode === 'day' && isSameDay(anchor, now)
  const weekCount = useMemo(() => days.reduce((sum, day) => sum + eventsOfDay(events, day).length, 0), [days, events])

  const rangeLabel =
    mode === 'day'
      ? new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(anchor)
      : formatWeek(days, i18n.language)

  return (
    <Box className="flex flex-col gap-3">
      <Box className="flex flex-wrap items-center justify-between gap-2">
        <Box className="flex flex-wrap items-center gap-2">
          <AgendaCalendarPicker enabled={enabled} />
          <Box className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0"
              aria-label={t('agenda.board.previous')}
              onClick={() => setAnchor(shiftAnchor(mode, anchor, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="size-8 p-0"
              aria-label={t('agenda.board.next')}
              onClick={() => setAnchor(shiftAnchor(mode, anchor, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Text size="xs" weight="medium" className="ml-1 first-letter:uppercase">
              {rangeLabel}
            </Text>
            {isToday ? null : (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAnchor(new Date())}>
                {t('agenda.board.today')}
              </Button>
            )}
          </Box>
        </Box>

        <Box className="flex flex-wrap items-center gap-2">
          {/* Théo A today-agenda.R2 — plus de basculeur Jour/Semaine : la semaine
              est « Mon agenda ». Un simple lien reste pour passer de l'une à
              l'autre (l'onglet dédié relève de la navigation de Ma journée). */}
          <Button size="sm" variant="ghost" onClick={() => onModeChange(mode === 'week' ? 'day' : 'week')}>
            {t(mode === 'week' ? 'agenda.board.seeDay' : 'agenda.board.seeWeek')}
          </Button>
          <AgendaSlotProposalPicker />
          <Button size="sm" onClick={() => setAddingEvent(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('agenda.board.addEvent')}
          </Button>
        </Box>
      </Box>

      {planFor ? (
        <Box
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--bellum-border)] px-3 py-2"
        >
          <Text size="sm">
            {planFor.email
              ? t('agenda.plan.banner', { name: planFor.name })
              : t('agenda.plan.bannerNoEmail', { name: planFor.name })}
          </Text>
          {mode === 'week' ? (
            <Button size="sm" variant="outline" onClick={() => onModeChange('day')}>
              {t('agenda.plan.switchToDay')}
            </Button>
          ) : null}
        </Box>
      ) : null}

      {/* Un agenda muet est NOMMÉ : « aucun rendez-vous » se lirait « rien de
          prévu » alors que la journée est peut-être pleine dans celui qui n'a
          pas répondu. */}
      {/* Refonte Théo (A · today-agenda) — l'agenda muet est un BANDEAU, avec le geste qui
          répare (relire), jamais une ligne de texte perdue sous la barre d'outils. */}
      {data?.unavailable.length ? (
        <Box
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-4 py-3"
        >
          <Text size="sm" weight="medium" className="text-[var(--warning-soft-text)]">
            {data.unavailable[0]?.calendarName
              ? t('agenda.board.partialNamed', { name: data.unavailable[0].calendarName })
              : t('agenda.board.partial')}
          </Text>
          <Button size="sm" variant="ghost" className="min-h-11" onClick={() => void refetch()} disabled={isFetching}>
            {t('error.retry')}
          </Button>
        </Box>
      ) : null}

      {isLoading ? (
        <Box className="flex h-32 items-center justify-center">
          <Spinner />
        </Box>
      ) : isError ? (
        <Box className="flex flex-col items-start gap-2 rounded-lg border border-[var(--bellum-border)] p-4">
          <Text size="sm">{t('agenda.board.failed')}</Text>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            {t('error.retry')}
          </Button>
        </Box>
      ) : mode === 'day' && isMobile ? (
        // #2097 (correctif du 26/09, mesuré sur iPhone en prod le 26/09) —
        // SOUS 768px, la grille horaire rendait une colonne d'heures VIDE :
        // ses créneaux tiennent sur une largeur qu'un téléphone n'a pas, et
        // glisser-déposer un rendez-vous n'est de toute façon pas un geste au
        // pouce. La journée redevient une LISTE (heure + titre), le même
        // patron que la vue semaine (`DayColumn`, déjà utilisée plus bas dans
        // ce fichier pour `WeekDay` — même absence nommée : « Aucun
        // rendez-vous ce jour. », jamais une grille qui semble vide).
        <DayColumn
          events={eventsOfDay(events, anchor)}
          now={now}
          showNowLine={isToday}
          language={i18n.language}
          conflictingIds={conflictingIds}
        />
      ) : mode === 'day' ? (
        // La journée en GRILLE : la hauteur d'un rendez-vous EST sa durée, les
        // trous se voient, et deux rendez-vous simultanés se partagent la
        // largeur au lieu de se cacher l'un l'autre. La liste ne montrait rien
        // de tout cela — c'est le « ça devrait ressembler à un agenda » de la
        // bêta.
        <AgendaGrid
          events={eventsOfDay(events, anchor)}
          freeSlots={freeSlotsSettled && (isToday || anchor >= now) ? (freeSlots ?? []) : []}
          now={now}
          language={i18n.language}
          conflictingIds={conflictingIds}
          onDragEnd={(event, proposal) => setPendingMove({ event, proposal })}
          onPickFreeSlot={setPendingSlot}
          onOpenEvent={setPrepEvent}
        />
      ) : (
        <Box className="flex flex-col gap-3">
          {/* Théo A today-agenda.N2 — la phrase de synthèse de la semaine. */}
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('agenda.board.weekSummary', { count: weekCount })}
          </Text>
          {/* Refonte Théo (A · today-agenda) — la semaine en COLONNES, un jour par colonne, dans
              un seul cadre ; sur mobile, les jours s'empilent. */}
          <Box className="grid overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card lg:grid-cols-7">
            {days.map(day => (
              <WeekDay
                key={day.toISOString()}
                day={day}
                conflictingIds={conflictingIds}
                events={eventsOfDay(events, day)}
                now={now}
                language={i18n.language}
                onOpen={openCard}
                onReschedule={startReschedule}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* #2103.27 — lecture seule, hors grille : aucune action, juste le fait
          nommé. On n'affiche pas ce qu'on n'a pas : zéro annulation ⇒ rien. */}
      {cancelledEvents.length ? (
        <Box className="flex flex-col gap-1.5 rounded-lg border border-[var(--bellum-border)] p-2">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {t('agenda.board.cancelled', { count: cancelledEvents.length })}
          </Text>
          {cancelledEvents.map(cancelledEvent => (
            <Box key={cancelledEvent.id} className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
              <Ban className="size-3 shrink-0" aria-hidden="true" />
              <Text size="xs" className="line-through">
                {agendaEventTitle(cancelledEvent, { busy: t('agenda.grid.busy'), untitled: t('agenda.grid.untitled') })}
              </Text>
              {hourLabel(cancelledEvent, i18n.language) ? (
                <Text size="xs">{hourLabel(cancelledEvent, i18n.language)}</Text>
              ) : null}
            </Box>
          ))}
        </Box>
      ) : null}

      {/* Un évènement sans date exploitable existe : le jeter serait la seule
          façon de le rendre invisible pour de bon. */}
      {orphans.length ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('agenda.board.undated', { count: orphans.length })}
        </Text>
      ) : null}

      {/* La confirmation d'un déplacement. Elle est la SEULE porte vers
          l'écriture : tant qu'elle n'est pas validée, le geste n'a rien changé
          ni chez le fournisseur, ni chez les invités.
          `silentReschedule` absent se lit « on ne sait pas se taire » — le cas
          prudent, qui affiche une case cochée et verrouillée plutôt qu'un choix
          qui ne serait pas honoré. */}
      <RescheduleDialog
        event={pendingMove?.event ?? null}
        proposal={pendingMove?.proposal ?? null}
        language={i18n.language}
        canStaySilent={agendaStatus?.capabilities.silentReschedule === true}
        pending={reschedule.isPending}
        onConfirm={confirmMove}
        onCancel={() => setPendingMove(null)}
        // #2938 — le créneau HORS GRILLE : la proposition du glisser-déposer
        // s'ajuste encore ici en tapant une heure, même patron que
        // `ConflictDialog.tsx` (RescheduleDialog est partagé, GA-26).
        onProposalChange={proposal => setPendingMove(previous => (previous ? { ...previous, proposal } : previous))}
      />

      <NewEventDialog
        slot={pendingSlot ?? addSlot}
        pickSlot={addingEvent && !pendingSlot}
        language={i18n.language}
        pending={createEvent.isPending}
        allowCustomReminder={agendaStatus?.capabilities.customReminder === true}
        allowRecurrence={agendaStatus?.capabilities.recurrence === true}
        writableCalendars={writableCalendars}
        defaults={planFor ? { guests: planFor.email ?? '' } : undefined}
        onCreate={confirmCreate}
        onCancel={() => {
          setPendingSlot(null)
          setAddingEvent(false)
        }}
      />

      <MeetingPrepDialog event={prepEvent} language={i18n.language} onClose={() => setPrepEvent(null)} />
    </Box>
  )
}

/** Le libellé d'une semaine : « 17 – 23 août ». */
function formatWeek(days: Date[], language: string): string {
  const first = days[0]
  const last = days[days.length - 1]
  if (!first || !last) return ''
  const dayOnly = new Intl.DateTimeFormat(language, { day: 'numeric' })
  const full = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long' })
  return first.getMonth() === last.getMonth()
    ? `${dayOnly.format(first)} – ${full.format(last)}`
    : `${full.format(first)} – ${full.format(last)}`
}

function hourLabel(event: AgendaEvent, language: string): string | null {
  if (isAllDay(event) || !event.start) return null
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(new Date(event.start))
}

/**
 * La journée, heure par heure.
 *
 * Le repère « maintenant » est posé ENTRE deux rendez-vous, à sa place réelle
 * dans la liste. C'est ce qui donne d'un coup d'œil ce qui est derrière soi et
 * ce qui reste — l'information que l'écran devait déjà porter, et qu'une liste
 * uniforme ne donne pas.
 */
function DayColumn({
  events,
  now,
  showNowLine,
  language,
  conflictingIds,
}: {
  events: AgendaEvent[]
  now: Date
  showNowLine: boolean
  language: string
  conflictingIds?: ReadonlySet<string>
}) {
  const { t } = useTranslation('briefing')
  if (!events.length) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('agenda.board.emptyDay')}
      </Text>
    )
  }

  // Le repère se place avant le premier rendez-vous qui n'a pas encore
  // commencé ; s'il n'y en a plus, il ferme la journée.
  const nowIndex = events.findIndex(event => {
    if (isAllDay(event) || !event.start) return false
    return Date.parse(event.start) > now.getTime()
  })
  const nowPosition = showNowLine ? (nowIndex === -1 ? events.length : nowIndex) : -1

  return (
    <Box className="flex flex-col gap-2">
      {events.map((event, index) => (
        <Box key={event.id} className="flex flex-col gap-2">
          {index === nowPosition ? <NowLine now={now} language={language} /> : null}
          <EventCard event={event} now={now} language={language} conflicting={conflictingIds?.has(event.id) ?? false} />
        </Box>
      ))}
      {nowPosition === events.length ? <NowLine now={now} language={language} /> : null}
    </Box>
  )
}

function NowLine({ now, language }: { now: Date; language: string }) {
  const { t } = useTranslation('briefing')
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(now)
  return (
    <Box className="flex items-center gap-2" aria-label={t('agenda.board.now')}>
      <Text size="xs" weight="medium" className="text-[var(--danger-soft-text)]">
        {time}
      </Text>
      <Box className="h-px flex-1 bg-[var(--bellum-danger)]" />
    </Box>
  )
}

/** Un rendez-vous, avec ce qu'on en fait : le rejoindre. */
function EventCard({
  event,
  now,
  language,
  conflicting = false,
}: {
  event: AgendaEvent
  now: Date
  language: string
  conflicting?: boolean
}) {
  const { t } = useTranslation('briefing')
  const timing = timingOf(event, now)
  const time = hourLabel(event, language)
  // #2390.9 — une salle réservée n'est jamais une personne : elle est exclue du
  // compte d'invités externes, et nommée à part ci-dessous.
  const externals = personAttendeesOf(event).filter(attendee => attendee.external).length

  // Un chevauchement se voit AVANT l'état d'avancement du rendez-vous : c'est
  // la seule chose qui demande une décision maintenant.
  const tone = conflicting
    ? 'border-[var(--bellum-danger)] bg-[color-mix(in_srgb,var(--bellum-danger)_8%,transparent)]'
    : timing.phase === 'live'
      ? 'border-[var(--bellum-primary-400)] bg-[color-mix(in_srgb,var(--bellum-primary-400)_8%,transparent)]'
      : timing.phase === 'past'
        ? 'border-[var(--bellum-border)] opacity-60'
        : 'border-[var(--bellum-border)]'

  return (
    <Box className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 ${tone}`}>
      <Box className="flex min-w-0 flex-col gap-0.5">
        <Box className="flex flex-wrap items-center gap-2">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
            {time ?? t('agenda.allDay')}
          </Text>
          {conflicting ? (
            <Badge
              variant="outline"
              className="gap-1 border-[var(--bellum-danger)] text-xs text-[var(--danger-soft-text)]"
            >
              <AlertTriangle className="size-2.5" />
              {t('agenda.board.conflict')}
            </Badge>
          ) : null}
          {event.summary?.trim() ? (
            <Text size="sm" weight="medium" className="truncate">
              {event.summary}
            </Text>
          ) : null}
        </Box>
        <Box className="flex flex-wrap items-center gap-2">
          <TimingHint timing={timing} />
          {event.location ? (
            <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
              <MapPin className="size-3" />
              <span className="max-w-[16rem] truncate">{event.location}</span>
            </Text>
          ) : null}
          {externals ? (
            <Text size="xs" className="flex items-center gap-1 text-[var(--bellum-text-secondary)]">
              <Users className="size-3" />
              {t('agenda.board.externalGuests', { count: externals })}
            </Text>
          ) : null}
          {/* #2390.9 — une salle réservée n'est jamais un invité : elle
              s'affiche à part, sur sa propre ligne. Pas de salle, aucune ligne
              (on n'affiche pas ce qu'on n'a pas). */}
          <RoomLines event={event} />
          <AgendaKindLine event={event} />
        </Box>
      </Box>

      <Box className="flex shrink-0 items-center gap-2">
        <JoinButton event={event} phase={timing.phase} />
        <Badge variant="outline" className="text-xs">
          {event.isExternal ? t('agenda.external') : t('agenda.internal')}
        </Badge>
      </Box>
    </Box>
  )
}

/**
 * « En cours », « dans 12 min ».
 *
 * Rien n'est affiché pour un rendez-vous lointain ou passé : une mention par
 * ligne noierait celle qui compte, et c'est précisément celle-là qu'on ouvre
 * l'écran pour lire.
 */
function TimingHint({ timing }: { timing: ReturnType<typeof timingOf> }) {
  const { t } = useTranslation('briefing')
  if (timing.phase === 'live') {
    return (
      <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
        {timing.minutesLeft === null ? t('agenda.board.live') : liveLeftText(t, timing.minutesLeft)}
      </Text>
    )
  }
  if (timing.phase === 'soon' && timing.minutesUntil !== null) {
    return (
      <Text size="xs" weight="medium" className="text-[var(--danger-soft-text)]">
        {t('agenda.board.inMinutes', { count: timing.minutesUntil })}
      </Text>
    )
  }
  return null
}

/**
 * Le bouton « Rejoindre ».
 *
 * Il n'apparaît QUE s'il y a un lien : un bouton présent mais inerte se clique
 * quand même, et on découvre à ce moment-là qu'il n'y a pas de visio — trente
 * secondes avant la réunion. L'absence de bouton est l'information.
 *
 * Il se met en avant quand la réunion est en cours ou imminente, parce que
 * c'est là qu'on le cherche.
 */
export function JoinButton({
  event,
  phase,
  size = 'sm',
}: {
  event: Pick<AgendaEvent, 'conferenceUrl' | 'summary'>
  phase: string
  size?: 'sm' | 'default'
}) {
  const { t } = useTranslation('briefing')
  if (!event.conferenceUrl) return null
  const prominent = phase === 'live' || phase === 'soon'

  return (
    <Button asChild size={size} variant={prominent ? 'default' : 'outline'} className="h-7 gap-1.5 px-2 text-xs">
      <a href={event.conferenceUrl} target="_blank" rel="noopener noreferrer">
        <Video className="size-3.5" />
        {t('agenda.board.join')}
      </a>
    </Button>
  )
}

/**
 * Un jour de la semaine, en liste verticale (Théo A today-agenda.R1).
 *
 * Un jour sans rendez-vous garde son TITRE et rien d'autre (décision Louis
 * 22/10 : « jour vide = titre seul ») — le jour reste là, donc un mercredi
 * absent ne se lit pas « il manque un jour », sans ligne qui affirmerait une
 * absence.
 */
function WeekDay({
  day,
  events,
  now,
  language,
  conflictingIds,
  onOpen,
  onReschedule,
}: {
  day: Date
  events: AgendaEvent[]
  now: Date
  language: string
  conflictingIds?: ReadonlySet<string>
  /** Clic sur un rendez-vous — l'ouvrir (pré-brief, ou boîte de conflit). */
  onOpen?: (event: AgendaEvent) => void
  /** Théo A today-agenda.A2 — « Reprogrammer » : la modale, jamais un glisser. */
  onReschedule?: (event: AgendaEvent) => void
}) {
  const { t } = useTranslation('briefing')
  const today = isSameDay(day, now)
  const heading = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric' }).format(day)

  return (
    <Box
      data-testid="agenda-day"
      className="flex min-w-0 flex-col gap-2 border-b border-[var(--bellum-border)] p-3 last:border-b-0 lg:min-h-96 lg:border-b-0 lg:border-r lg:last:border-r-0"
    >
      <Text
        size="sm"
        weight="medium"
        className={`first-letter:uppercase ${today ? 'text-[var(--bellum-text-accent)]' : ''}`}
        aria-current={today ? 'date' : undefined}
      >
        {heading}
        {today ? ` · ${t('agenda.board.today').toLowerCase()}` : ''}
      </Text>

      {events.map(event => {
        const timing = timingOf(event, now)
        const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
        const conflicting = conflictingIds?.has(event.id) ?? false
        const points = agendaPointsOf(event, conflicting)
        const visual = agendaVisualKind(event)
        const canMove = Boolean(event.start && event.end) && timing.phase !== 'past'
        const counterpart = event.location?.trim()
        return (
          <Box
            key={event.id}
            className={`flex flex-col items-stretch rounded-control border border-l-2 bg-[var(--bellum-surface-2)] ${
              visual === 'busy'
                ? 'border-[var(--bellum-border)] bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,var(--bellum-surface-2)_6px,var(--bellum-surface-2)_12px)]'
                : visual === 'proposed'
                  ? 'border-dashed border-[var(--bellum-border)]'
                  : conflicting
                    ? 'border-[var(--bellum-danger)]'
                    : timing.phase === 'live'
                      ? 'border-[var(--bellum-border)] border-l-[var(--success-soft-text)]'
                      : timing.phase === 'past'
                        ? 'border-[var(--bellum-border)] border-l-[var(--bellum-primary-400)] opacity-60'
                        : 'border-[var(--bellum-border)] border-l-[var(--bellum-primary-400)]'
            }`}
          >
            {/* #2926 (reste R05/R06) — la carte s'OUVRE : les fuseaux de l'invité
                (pré-brief) et, pour un conflit, les réponses et la délégation.
                Un `<button>`, pas un `<div onClick>` (GA-35) — « Rejoindre » et
                « Reprogrammer » restent des éléments FRÈRES, jamais imbriqués. */}
            <button
              type="button"
              disabled={!onOpen}
              onClick={() => onOpen?.(event)}
              className="flex min-h-11 min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left transition-colors enabled:hover:brightness-110"
            >
              <Box className="flex flex-wrap items-center gap-2">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-accent)]">
                  {isAllDay(event) || !event.start ? t('agenda.allDay') : time.format(new Date(event.start))}
                </Text>
                {timing.phase === 'live' ? <TimingHint timing={timing} /> : null}
                {/* Un créneau PROPOSÉ n'est pas un rendez-vous FIXÉ : seul cet
                    état réclame un geste (relancer), donc seul lui est marqué. */}
                {isProposedAgendaEvent(event) ? (
                  <CircleDashed
                    className="size-3 shrink-0 text-[var(--warning-soft-text)]"
                    aria-label={t('agenda.board.proposed')}
                  />
                ) : null}
                {/* #2770 — un rendez-vous déjà FIXÉ dont seule l'ORIGINE est
                    distinguée, jamais confondu avec le créneau en attente. */}
                {isBellumCreatedAgendaEvent(event) ? (
                  <Sparkles
                    className="size-3 shrink-0 text-[var(--bellum-text-accent)]"
                    aria-label={t('agenda.board.createdByBellum')}
                  />
                ) : null}
                {/* Théo A today-agenda.A3 — UNE pastille « n points » (conflit,
                    invités externes…) au lieu de trois étiquettes empilées. */}
                {points > 0 ? (
                  <Badge variant="outline" className="text-xs">
                    {t('agenda.board.points', { count: points })}
                  </Badge>
                ) : null}
              </Box>
              {event.summary?.trim() ? (
                <Text size="sm" weight="medium" className="line-clamp-2 leading-snug">
                  {event.summary}
                </Text>
              ) : null}
              {counterpart ? (
                <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                  {counterpart}
                </Text>
              ) : null}
            </button>
            <Box className="flex shrink-0 flex-wrap items-center gap-1 px-2 pb-1">
              {event.conferenceUrl ? (
                <a
                  href={event.conferenceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-1 px-2 text-xs text-[var(--bellum-text-accent)] hover:underline"
                >
                  <Video className="size-3" />
                  {t('agenda.board.join')}
                </a>
              ) : null}
              {canMove && onReschedule ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-xs"
                  aria-label={`${t('agenda.board.reschedule')} — ${event.summary ?? ''}`.trim()}
                  onClick={() => onReschedule(event)}
                >
                  {t('agenda.board.reschedule')}
                </Button>
              ) : null}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}
