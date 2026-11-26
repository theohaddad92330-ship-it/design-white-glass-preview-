import type { FreeSlot } from '@bellum/contracts'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'
import { slotFromInputs, slotToInputs } from '../agenda-slot-input'
import { parseGuestList } from '../guest-list'

/**
 * #2101.29 — LES RAPPELS PROPOSÉS, en minutes avant le rendez-vous.
 *
 * `null` laisse le fournisseur appliquer SON défaut (`google.service.ts` :
 * `useDefault: true`) — jamais confondu avec « aucun rappel », qui est `0`
 * (au moment même du rendez-vous, un choix explicite et différent).
 */
const REMINDER_OPTIONS: readonly (number | null)[] = [null, 0, 10, 30, 60, 1440]

/**
 * #2101.26 — LES RÉCURRENCES PROPOSÉES, chacune une RRULE (RFC 5545) complète
 * dans la forme exacte que `agendaEventDraftSchema.recurrence` valide et que
 * Google Calendar documente. `null` = pas de récurrence, jamais envoyé.
 */
const RECURRENCE_OPTIONS: readonly string[] = ['RRULE:FREQ=DAILY', 'RRULE:FREQ=WEEKLY', 'RRULE:FREQ=MONTHLY']

/**
 * Poser un rendez-vous dans un trou de l'agenda.
 *
 * `POST /agenda/events` existait, testé, sans qu'aucun écran ne l'appelle : le
 * produit savait créer un rendez-vous et ne l'offrait nulle part. Cliquer une
 * plage libre est l'endroit naturel — l'heure est déjà choisie, il ne reste
 * qu'à dire de quoi il s'agit.
 *
 * Le formulaire est volontairement court. Tout ce qui a une valeur par défaut
 * raisonnable en garde une : la visio est demandée (un rendez-vous commercial
 * sans lien se termine en échange de numéros), le rappel est posé à une heure.
 * Ce qui reste à saisir est ce que nous ne pouvons pas deviner — le sujet, et
 * qui l'on invite.
 */
export function NewEventDialog({
  slot,
  language,
  pending,
  allowCustomReminder,
  allowRecurrence,
  writableCalendars,
  defaults,
  pickSlot = false,
  onCreate,
  onCancel,
}: {
  slot: FreeSlot | null
  language: string
  pending: boolean
  /**
   * #2101.29 — le fournisseur actif POSE-t-il réellement le rappel choisi ?
   * (`AgendaStatus.capabilities.customReminder`, Google seul aujourd'hui.)
   * `false` garde le rappel à une heure, fixe et non éditable : proposer un
   * choix que le fournisseur ignorerait promettrait un réglage fictif.
   */
  allowCustomReminder: boolean
  /**
   * #2101.26 — le fournisseur actif POSE-t-il réellement une RRULE ?
   * (`AgendaStatus.capabilities.recurrence`, Google seul aujourd'hui.) Même
   * motif que `allowCustomReminder` : Microsoft n'a pas ce contrat, le champ
   * ne s'affiche donc pas pour lui.
   */
  allowRecurrence: boolean
  /**
   * #2101.27 — les agendas INSCRIPTIBLES chez le fournisseur qui créera
   * l'évènement (déjà filtrés par le même provider que celui qui écrira —
   * `AgendaBoard`). Un seul agenda n'offre aucun choix réel : le sélecteur
   * n'apparaît qu'à partir de deux, même règle que `AgendaCalendarPicker`
   * pour la lecture.
   */
  writableCalendars: Array<{ id: string; name: string }>
  /**
   * #3693.6 — un rendez-vous PLANIFIÉ DEPUIS une fiche contact arrive avec son
   * sujet et son invité déjà posés ; le commercial valide ou corrige.
   */
  defaults?: { summary?: string; guests?: string }
  /**
   * Théo A today-agenda.R3 — « Ajouter un rendez-vous » : le créneau n'est pas
   * celui d'un trou cliqué, il se TAPE (date, heure, durée). Le créneau reçu
   * n'est alors que le point de départ du formulaire.
   */
  pickSlot?: boolean
  onCreate: (draft: {
    /** Présents seulement avec `pickSlot` : le créneau tel que tapé. */
    startsAt?: string
    endsAt?: string
    summary: string
    attendees: string[]
    addConferencing: boolean
    reminderMinutes: number | null
    calendarId?: string
    recurrence?: string
  }) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('briefing')
  const isDemo = useIsDemo()
  const [summary, setSummary] = useState('')
  const [guests, setGuests] = useState('')
  const [addConferencing, setAddConferencing] = useState(true)
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(60)
  const [calendarId, setCalendarId] = useState<string | undefined>(undefined)
  const [recurrence, setRecurrence] = useState<string | undefined>(undefined)
  const [dateValue, setDateValue] = useState('')
  const [timeValue, setTimeValue] = useState('')
  const [durationValue, setDurationValue] = useState(30)

  // Chaque ouverture repart d'un formulaire vide : garder la saisie précédente
  // ferait créer deux fois le même rendez-vous à deux heures différentes.
  useEffect(() => {
    if (slot) {
      setSummary(defaults?.summary ?? '')
      setGuests(defaults?.guests ?? '')
      setAddConferencing(true)
      setReminderMinutes(60)
      setCalendarId(undefined)
      setRecurrence(undefined)
      const inputs = slotToInputs(slot)
      setDateValue(inputs.date)
      setTimeValue(inputs.time)
      setDurationValue(inputs.duration)
    }
  }, [slot, defaults?.summary, defaults?.guests])

  if (!slot) return null

  // Avec `pickSlot`, le créneau EST ce qui est tapé ; une saisie incomplète
  // bloque la validation plutôt que de poser un horaire deviné.
  const typedSlot = pickSlot ? slotFromInputs(dateValue, timeValue, durationValue) : slot

  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' })
  const shown = typedSlot ?? slot
  const when = `${day.format(new Date(shown.start))} · ${time.format(new Date(shown.start))} → ${time.format(new Date(shown.end))}`

  const parsed = parseGuestList(guests)
  // Un titre vide donnerait un rendez-vous « (sans objet) » dans l'agenda de
  // l'invité ; une adresse mal tapée ferait échouer l'appel après coup.
  // #3788.5 — en démo, le serveur refuse TOUJOURS cette écriture
  // (`AgendaService.createEvent`) : proposer le geste promettrait une
  // invitation qui ne partira jamais, découverte seulement au toast d'échec.
  const canSubmit =
    summary.trim().length > 0 && parsed.invalid.length === 0 && !pending && !isDemo && typedSlot !== null

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onCancel())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('agenda.newEvent.title')}</DialogTitle>
          <DialogDescription className="first-letter:uppercase">{when}</DialogDescription>
        </DialogHeader>

        <Box className="flex flex-col gap-3 px-1">
          <Box className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('agenda.newEvent.subject')}
            </Text>
            <Input
              value={summary}
              autoFocus
              placeholder={t('agenda.newEvent.subjectPlaceholder')}
              onChange={changed => setSummary(changed.target.value)}
            />
          </Box>

          {pickSlot ? (
            <Box className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('agenda.newEvent.date')}
                </Text>
                <Input type="date" value={dateValue} onChange={changed => setDateValue(changed.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('agenda.newEvent.startTime')}
                </Text>
                <Input type="time" value={timeValue} onChange={changed => setTimeValue(changed.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {t('agenda.newEvent.durationMinutes')}
                </Text>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={durationValue}
                  onChange={changed => setDurationValue(Number(changed.target.value))}
                />
              </label>
            </Box>
          ) : null}

          <Box className="flex flex-col gap-1">
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('agenda.newEvent.guests')}
            </Text>
            <Input
              value={guests}
              placeholder={t('agenda.newEvent.guestsPlaceholder')}
              onChange={changed => setGuests(changed.target.value)}
            />
            {/* Une adresse invalide est nommée AVANT l'envoi : la laisser passer
                ferait échouer la création une fois le bouton cliqué, sans dire
                laquelle des cinq adresses est en cause. */}
            {/* #3693.6 — valider ENVOIE l'invitation : le dire avant le clic. Sans invité, le
                rendez-vous n'est posé que dans l'agenda — aucune invitation ne part. */}
            {/* #3788.5 — en démo, aucune invitation ne partira JAMAIS : le dire
                D'EMBLÉE plutôt que de l'annoncer puis la refuser au clic. */}
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {isDemo
                ? t('agenda.newEvent.demoNotPossible')
                : parsed.valid.length > 0
                  ? t('agenda.newEvent.inviteNotice', { count: parsed.valid.length })
                  : t('agenda.newEvent.noInviteNotice')}
            </Text>
            {parsed.invalid.length > 0 ? (
              <Text size="xs" className="text-[var(--danger-soft-text)]">
                {t('agenda.newEvent.invalidGuests', { list: parsed.invalid.join(', ') })}
              </Text>
            ) : null}
          </Box>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={addConferencing}
              onCheckedChange={checked => setAddConferencing(checked === true)}
              aria-label={t('agenda.newEvent.conferencing')}
            />
            <Text size="sm">{t('agenda.newEvent.conferencing')}</Text>
          </label>

          {/* #2101.27 — à partir de DEUX agendas inscriptibles seulement :
              un sélecteur à une seule option n'offre aucun choix réel. */}
          {writableCalendars.length > 1 ? (
            <Box className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.newEvent.calendar')}
              </Text>
              <Select
                value={calendarId ?? DEFAULT_CALENDAR_KEY}
                onValueChange={value => setCalendarId(fromCalendarKey(value))}
              >
                <SelectTrigger aria-label={t('agenda.newEvent.calendar')} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_CALENDAR_KEY}>{writableCalendars[0]?.name}</SelectItem>
                  {writableCalendars.slice(1).map(cal => (
                    <SelectItem key={cal.id} value={cal.id}>
                      {cal.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          ) : null}

          {/* #2101.26 — MASQUÉ, même motif que le rappel personnalisé
              ci-dessous : un fournisseur qui n'honore pas la RRULE ne doit
              jamais laisser croire qu'il la pose. */}
          {allowRecurrence ? (
            <Box className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.newEvent.recurrence')}
              </Text>
              <Select
                value={recurrence ?? 'none'}
                onValueChange={value => setRecurrence(value === 'none' ? undefined : value)}
              >
                <SelectTrigger aria-label={t('agenda.newEvent.recurrence')} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('agenda.newEvent.recurrenceNone')}</SelectItem>
                  {RECURRENCE_OPTIONS.map(option => (
                    <SelectItem key={option} value={option}>
                      {recurrenceLabel(option, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          ) : null}

          {/* #2101.29 — MASQUÉ, pas désactivé, quand le fournisseur ne pose
              pas le rappel choisi : un contrôle visible mais inerte se clique
              quand même, et le rendez-vous garde le défaut sans le dire. */}
          {allowCustomReminder ? (
            <Box className="flex flex-col gap-1">
              <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('agenda.newEvent.reminder')}
              </Text>
              <Select
                value={reminderKey(reminderMinutes)}
                onValueChange={value => setReminderMinutes(reminderFromKey(value))}
              >
                <SelectTrigger aria-label={t('agenda.newEvent.reminder')} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(option => (
                    <SelectItem key={reminderKey(option)} value={reminderKey(option)}>
                      {reminderLabel(option, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Box>
          ) : null}
        </Box>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            {t('agenda.reschedule.cancel')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onCreate({
                ...(pickSlot && typedSlot ? { startsAt: typedSlot.start, endsAt: typedSlot.end } : {}),
                summary: summary.trim(),
                attendees: parsed.valid,
                addConferencing,
                reminderMinutes: allowCustomReminder ? reminderMinutes : 60,
                ...(calendarId ? { calendarId } : {}),
                ...(allowRecurrence && recurrence ? { recurrence } : {}),
              })
            }
          >
            {t('agenda.newEvent.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `null` → `'default'` (le mot n'est pas un nombre valide, donc jamais confondu
 *  avec une minute réelle) ; sinon la minute elle-même, en texte. */
function reminderKey(minutes: number | null): string {
  return minutes === null ? 'default' : String(minutes)
}

function reminderFromKey(key: string): number | null {
  return key === 'default' ? null : Number(key)
}

function reminderLabel(minutes: number | null, t: (key: string, vars?: Record<string, number>) => string): string {
  if (minutes === null) return t('agenda.newEvent.reminderDefault')
  if (minutes === 0) return t('agenda.newEvent.reminderAtStart')
  if (minutes >= 1440) return t('agenda.newEvent.reminderDays', { count: minutes / 1440 })
  if (minutes >= 60) return t('agenda.newEvent.reminderHours', { count: minutes / 60 })
  return t('agenda.newEvent.reminderMinutes', { count: minutes })
}

/** #2101.27 — le sentinel « rien de choisi » : jamais un identifiant réel de
 *  calendrier, pour ne jamais confondre l'absence de choix avec le premier
 *  agenda de la liste. */
const DEFAULT_CALENDAR_KEY = '__default__'

function fromCalendarKey(key: string): string | undefined {
  return key === DEFAULT_CALENDAR_KEY ? undefined : key
}

function recurrenceLabel(rule: string, t: (key: string) => string): string {
  if (rule === 'RRULE:FREQ=DAILY') return t('agenda.newEvent.recurrenceDaily')
  if (rule === 'RRULE:FREQ=WEEKLY') return t('agenda.newEvent.recurrenceWeekly')
  return t('agenda.newEvent.recurrenceMonthly')
}
