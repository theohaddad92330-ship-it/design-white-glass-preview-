import {
  formatTeamPolicyMinute,
  isTeamPolicySet,
  parseTeamPolicyMinute,
  TEAM_POLICY_DAILY_CALLS_BOUNDS,
  TEAM_POLICY_MAX_MEETINGS_BOUNDS,
  TEAM_POLICY_WINDOWS_MAX,
  teamPolicySchema,
  type TeamPolicy,
  type TeamPolicyWindow,
} from '@bellum/contracts'
import { Box, Button, Input, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api'

const TEAM_POLICY_KEY = ['workspace', 'team-policy'] as const

type WindowKind = 'prospecting' | 'forbidden'
type WindowField = 'prospectingWindows' | 'forbiddenWindows'
const WINDOW_FIELD: Record<WindowKind, WindowField> = {
  prospecting: 'prospectingWindows',
  forbidden: 'forbiddenWindows',
}

/**
 * #2770 — une plage ajoutée s'ouvre DÉJÀ VALIDE (pause déjeuner / matinée de prospection) : une
 * ligne vide ne se distinguait pas d'un clic sans effet et n'enregistrait rien. Le gestionnaire
 * ajuste les heures ; les plages valent pour chaque jour (contrat `team-policy`).
 */
const NEW_WINDOW: Record<WindowKind, DraftWindow> = {
  prospecting: { start: '09:00', end: '10:00', weekdays: [] },
  forbidden: { start: '12:00', end: '14:00', weekdays: [] },
}

/** Une plage en cours de saisie : deux « HH:MM », éventuellement vides ou illisibles. */
type DraftWindow = { start: string; end: string; weekdays: number[] }
/** Jours ISO (1 = lundi … 7 = dimanche) ; liste vide = chaque jour. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const
type Draft = {
  prospecting: DraftWindow[]
  forbidden: DraftWindow[]
  maxMeetingsPerDay: string
  dailyCallTarget: string
}

function toDraft(policy: TeamPolicy): Draft {
  const windows = (list: readonly TeamPolicyWindow[]) =>
    list.map(window => ({
      start: formatTeamPolicyMinute(window.startMinute),
      end: formatTeamPolicyMinute(window.endMinute),
      weekdays: window.weekdays ?? [],
    }))
  return {
    prospecting: windows(policy.prospectingWindows),
    forbidden: windows(policy.forbiddenWindows),
    maxMeetingsPerDay: policy.maxMeetingsPerDay === null ? '' : String(policy.maxMeetingsPerDay),
    dailyCallTarget: policy.dailyCallTarget === null ? '' : String(policy.dailyCallTarget),
  }
}

const draftWindows = (list: DraftWindow[]) =>
  list.map(window => ({
    startMinute: parseTeamPolicyMinute(window.start) ?? -1,
    endMinute: parseTeamPolicyMinute(window.end) ?? -1,
    // Aucun jour choisi = chaque jour : la clé n'est pas envoyée (jamais une liste vide).
    ...(window.weekdays.length > 0 ? { weekdays: [...window.weekdays].sort((a, b) => a - b) } : {}),
  }))

/** La saisie relue par LE contrat (`teamPolicySchema`) — jamais une seconde validation à la main. */
function fromDraft(draft: Draft): TeamPolicy | null {
  const count = (value: string) => (value.trim() === '' ? null : Number(value))
  const parsed = teamPolicySchema.safeParse({
    prospectingWindows: draftWindows(draft.prospecting),
    forbiddenWindows: draftWindows(draft.forbidden),
    maxMeetingsPerDay: count(draft.maxMeetingsPerDay),
    dailyCallTarget: count(draft.dailyCallTarget),
  })
  return parsed.success ? parsed.data : null
}

/** Les plages SEULES, relues par le même contrat : une plage à l'envers ou deux qui se chevauchent. */
function windowsInvalidIn(draft: Draft): boolean {
  return !teamPolicySchema.safeParse({
    prospectingWindows: draftWindows(draft.prospecting),
    forbiddenWindows: draftWindows(draft.forbidden),
    maxMeetingsPerDay: null,
    dailyCallTarget: null,
  }).success
}

function range(window: TeamPolicyWindow, dayNames: (day: number) => string): string {
  const hours = `${formatTeamPolicyMinute(window.startMinute)}–${formatTeamPolicyMinute(window.endMinute)}`
  return window.weekdays === undefined ? hours : `${hours} (${window.weekdays.map(dayNames).join(', ')})`
}

/**
 * #2770.37 — recette R6 (14/10) : MÊME libellé que `range()` ci-dessus (lecture seule), mais lu
 * depuis la SAISIE en cours (`DraftWindow` : heures en texte, jours toujours un tableau). Des
 * heures illisibles ou vides ne rendent AUCUN libellé plutôt qu'une plage devinée.
 */
function draftRange(window: DraftWindow, dayNames: (day: number) => string): string | null {
  const start = parseTeamPolicyMinute(window.start)
  const end = parseTeamPolicyMinute(window.end)
  if (start === null || end === null) return null
  const hours = `${formatTeamPolicyMinute(start)}–${formatTeamPolicyMinute(end)}`
  return window.weekdays.length === 0 ? hours : `${hours} (${window.weekdays.map(dayNames).join(', ')})`
}

/**
 * #2770.37 — LA POLITIQUE D'ÉQUIPE (décision Louis 11/10/2026), sur l'écran Équipe :
 * un seul endroit (GA-26) pour les règles que Laura applique quand elle organise la
 * journée ou la semaine de chacun (`propose_focus_plan` / `propose_weekly_plan`).
 *
 * Lecture ouverte à tout membre — chacun doit savoir pourquoi son plan évite un
 * créneau ; saisie réservée à `team:manage`, le serveur tient la même règle
 * (`PATCH /workspaces/team-policy`). Rien saisi se DIT, jamais un « 0 » (GA-18/19).
 */
export function TeamPolicyCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation('team')
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: TEAM_POLICY_KEY,
    queryFn: () => apiFetch<TeamPolicy>({ path: '/workspaces/team-policy' }),
    retry: false,
  })
  const save = useMutation<TeamPolicy, Error, TeamPolicy>({
    mutationFn: policy =>
      apiFetch<TeamPolicy, TeamPolicy>({ path: '/workspaces/team-policy', method: 'PATCH', body: policy }),
    onSuccess: result => {
      qc.setQueryData(TEAM_POLICY_KEY, result)
      toast.success(t('teamPolicy.saved'))
    },
    onError: error => toast.error(t('teamPolicy.saveFailed'), { description: error.message }),
  })

  return (
    <SettingsBlock title={t('teamPolicy.title')} description={t('teamPolicy.subtitle')} testId="team-policy">
      {query.isLoading ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('teamPolicy.loading')}
        </Text>
      ) : query.isError || !query.data ? (
        <Text size="xs" color="text-[var(--danger-soft-text)]">
          {t('teamPolicy.error')}
        </Text>
      ) : canManage ? (
        <TeamPolicyForm policy={query.data} saving={save.isPending} onSave={policy => save.mutate(policy)} />
      ) : (
        <TeamPolicySummary policy={query.data} />
      )}
    </SettingsBlock>
  )
}

function TeamPolicySummary({ policy }: { policy: TeamPolicy }) {
  const { t } = useTranslation('team')
  if (!isTeamPolicySet(policy)) {
    return (
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('teamPolicy.none')}
      </Text>
    )
  }
  const dayName = (day: number) => t(`teamPolicy.weekday.${day}.short`)
  const rows: { key: string; label: string; values: string[] }[] = [
    {
      key: 'prospecting',
      label: t('teamPolicy.prospecting.label'),
      values: policy.prospectingWindows.map(w => range(w, dayName)),
    },
    {
      key: 'forbidden',
      label: t('teamPolicy.forbidden.label'),
      values: policy.forbiddenWindows.map(w => range(w, dayName)),
    },
    {
      key: 'maxMeetings',
      label: t('teamPolicy.maxMeetings.label'),
      values: policy.maxMeetingsPerDay === null ? [] : [String(policy.maxMeetingsPerDay)],
    },
    {
      key: 'callTarget',
      label: t('teamPolicy.callTarget.label'),
      values: policy.dailyCallTarget === null ? [] : [String(policy.dailyCallTarget)],
    },
  ]
  return (
    <Box className="space-y-2">
      {/* On n'affiche pas ce qu'on n'a pas : une règle non saisie ne fait aucune ligne. */}
      <dl className="space-y-1">
        {rows
          .filter(row => row.values.length > 0)
          .map(row => (
            <div key={row.key} className="flex flex-wrap gap-x-2">
              <dt>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {row.label}
                </Text>
              </dt>
              {row.values.map(value => (
                <dd key={value}>
                  <Text size="sm" weight="medium">
                    {value}
                  </Text>
                </dd>
              ))}
            </div>
          ))}
      </dl>
      <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
        {t('teamPolicy.readOnly')}
      </Text>
    </Box>
  )
}

function TeamPolicyForm({
  policy,
  saving,
  onSave,
}: {
  policy: TeamPolicy
  saving: boolean
  onSave: (policy: TeamPolicy) => void
}) {
  const { t } = useTranslation('team')
  const [draft, setDraft] = useState<Draft>(() => toDraft(policy))
  useEffect(() => setDraft(toDraft(policy)), [policy])
  const parsed = fromDraft(draft)
  const windowsInvalid = windowsInvalidIn(draft)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault()
        if (parsed) onSave(parsed)
      }}
    >
      {!isTeamPolicySet(policy) ? (
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('teamPolicy.none')}
        </Text>
      ) : null}
      {(['prospecting', 'forbidden'] as const).map(kind => (
        <WindowsEditor
          key={kind}
          kind={kind}
          windows={draft[kind]}
          onChange={next => setDraft(current => ({ ...current, [kind]: next }))}
        />
      ))}
      {windowsInvalid ? (
        <Text element="p" size="xs" color="text-[var(--danger-soft-text)]" role="alert">
          {t('teamPolicy.windowInvalid')}
        </Text>
      ) : null}
      <CountField
        field="maxMeetings"
        bounds={TEAM_POLICY_MAX_MEETINGS_BOUNDS}
        value={draft.maxMeetingsPerDay}
        onChange={value => setDraft(current => ({ ...current, maxMeetingsPerDay: value }))}
      />
      <CountField
        field="callTarget"
        bounds={TEAM_POLICY_DAILY_CALLS_BOUNDS}
        value={draft.dailyCallTarget}
        onChange={value => setDraft(current => ({ ...current, dailyCallTarget: value }))}
      />
      <Box>
        <Button type="submit" size="sm" disabled={parsed === null || saving} className="pointer-coarse:min-h-11">
          {t('teamPolicy.save')}
        </Button>
      </Box>
    </form>
  )
}

function WindowsEditor({
  kind,
  windows,
  onChange,
}: {
  kind: WindowKind
  windows: DraftWindow[]
  onChange: (windows: DraftWindow[]) => void
}) {
  const { t } = useTranslation('team')
  const field = WINDOW_FIELD[kind]
  const dayName = (day: number) => t(`teamPolicy.weekday.${day}.short`)
  return (
    <fieldset className="space-y-2" data-field={field}>
      <legend>
        <Text size="sm" weight="medium">
          {t(`teamPolicy.${kind}.label`)}
        </Text>
      </legend>
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]">
        {t(`teamPolicy.${kind}.hint`)}
      </Text>
      {windows.length === 0 ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-muted)]">
          {t('teamPolicy.windowsEmpty')}
        </Text>
      ) : (
        <ul className="space-y-2">
          {windows.map((window, index) => {
            const id = `team-policy-${kind}-${index}`
            const update = (patch: Partial<DraftWindow>) =>
              onChange(windows.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)))
            return (
              <li key={id} className="flex flex-wrap items-center gap-2">
                <Input
                  id={`${id}-start`}
                  type="time"
                  value={window.start}
                  aria-label={t('teamPolicy.windowFrom', { index: index + 1 })}
                  onChange={event => update({ start: event.target.value })}
                  className="w-32 pointer-coarse:min-h-11"
                />
                <Text size="sm" aria-hidden>
                  –
                </Text>
                <Input
                  id={`${id}-end`}
                  type="time"
                  value={window.end}
                  aria-label={t('teamPolicy.windowTo', { index: index + 1 })}
                  onChange={event => update({ end: event.target.value })}
                  className="w-32 pointer-coarse:min-h-11"
                />
                {draftRange(window, dayName) ? (
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {draftRange(window, dayName)}
                  </Text>
                ) : null}
                <Box
                  role="group"
                  aria-label={t('teamPolicy.windowDays', { index: index + 1 })}
                  className="flex w-full flex-wrap gap-1"
                >
                  {WEEKDAYS.map(day => {
                    const pressed = window.weekdays.includes(day)
                    return (
                      <Button
                        key={day}
                        type="button"
                        variant={pressed ? 'default' : 'outline'}
                        size="sm"
                        aria-pressed={pressed}
                        aria-label={t(`teamPolicy.weekday.${day}.long`)}
                        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                        onClick={() =>
                          update({
                            weekdays: pressed ? window.weekdays.filter(d => d !== day) : [...window.weekdays, day],
                          })
                        }
                      >
                        {t(`teamPolicy.weekday.${day}.short`)}
                      </Button>
                    )
                  })}
                </Box>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label={t('teamPolicy.removeWindow', { range: `${window.start}–${window.end}` })}
                  onClick={() => onChange(windows.filter((_, at) => at !== index))}
                />
              </li>
            )
          })}
        </ul>
      )}
      {windows.length < TEAM_POLICY_WINDOWS_MAX ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={Plus}
          className="pointer-coarse:min-h-11"
          onClick={() => onChange([...windows, NEW_WINDOW[kind]])}
        >
          {t('teamPolicy.addWindow')}
        </Button>
      ) : null}
    </fieldset>
  )
}

function CountField({
  field,
  bounds,
  value,
  onChange,
}: {
  field: 'maxMeetings' | 'callTarget'
  bounds: { readonly min: number; readonly max: number }
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation('team')
  const inputId = useId()
  const label = t(`teamPolicy.${field}.label`)
  const trimmed = value.trim()
  const parsed = trimmed === '' ? null : Number(trimmed)
  const invalid = parsed !== null && (!Number.isInteger(parsed) || parsed < bounds.min || parsed > bounds.max)
  return (
    <Box className="flex flex-col gap-1">
      <label htmlFor={inputId}>
        <Text size="sm" weight="medium">
          {label}
        </Text>
      </label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={bounds.min}
        max={bounds.max}
        step="1"
        value={value}
        placeholder={t(`teamPolicy.${field}.unset`)}
        aria-invalid={invalid}
        onChange={event => onChange(event.target.value)}
        className="w-28 pointer-coarse:min-h-11"
      />
      {invalid ? (
        <Text size="xs" color="text-[var(--danger-soft-text)]">
          {t(`teamPolicy.${field}.invalid`, bounds)}
        </Text>
      ) : null}
    </Box>
  )
}
