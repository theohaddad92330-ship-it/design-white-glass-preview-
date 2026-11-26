import type { AgendaCalendar } from '@bellum/contracts'
import { Badge, Box, Button, Checkbox, Popover, PopoverContent, PopoverTrigger, Text } from '@bellum/ui'
import { CalendarRange, Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { calendarKey, checkedCalendarKeys, toggleCalendarSelection } from '../agenda-view'
import { useAgendaCalendars, useSelectAgendaCalendars, useSelectAllAgendaCalendars } from '../api'

/**
 * Choisir QUELS agendas Bellum lit.
 *
 * Un commercial n'a presque jamais un seul agenda : le sien, celui de
 * l'équipe, un agenda partagé de rendez-vous, et souvent « Jours fériés » ou
 * « Numéros de semaine » qui n'ont rien à faire dans une journée de travail.
 * Les deux réponses extrêmes sont donc fausses toutes les deux : lire un seul
 * agenda affiche « journée vide » à quelqu'un dont la journée est pleine
 * ailleurs, tout lire noie les rendez-vous sous le bruit. On coche.
 *
 * Le sélecteur s'affiche à partir de DEUX agendas — proposer un choix unique
 * donne l'impression qu'il en manque — ou dès qu'un fournisseur n'a pas
 * répondu : c'est justement là que désigner explicitement l'agenda qui marche
 * répare l'écran. Il ne nomme jamais l'éditeur : seul le nom que l'utilisateur
 * a donné à son agenda est affiché.
 */
export function AgendaCalendarPicker({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation('briefing')
  const { data } = useAgendaCalendars(enabled)
  const selectMany = useSelectAgendaCalendars()
  const selectAll = useSelectAllAgendaCalendars()

  const calendars = data?.calendars ?? []
  const someProviderSilent = Boolean(data?.unavailable.length)
  if (calendars.length < 2 && !(calendars.length === 1 && someProviderSilent)) return null

  const readsAll = Boolean(data?.readsAll)
  const stored = data?.selectedCalendars ?? []
  const pending = selectMany.isPending || selectAll.isPending

  // Ce qui est LU en ce moment, coche par coche (calcul pur, testé à part).
  const checkedKeys = checkedCalendarKeys(calendars, { readsAll, selected: stored })

  const label = readsAll
    ? t('agenda.picker.all')
    : checkedKeys.size > 1
      ? t('agenda.picker.count', { count: checkedKeys.size })
      : (calendars.find(calendar => checkedKeys.has(calendarKey(calendar)))?.name ?? t('agenda.picker.placeholder'))

  const toggle = (calendar: AgendaCalendar) => {
    const next = toggleCalendarSelection(calendars, checkedKeys, calendar)
    // « Aucun agenda » n'est pas un réglage : la case reste cochée plutôt que
    // d'envoyer une requête qui sera refusée.
    if (next.kind === 'noop') return
    if (next.kind === 'all') {
      selectAll.mutate()
      return
    }
    selectMany.mutate(next.refs)
  }

  return (
    <Box className="flex flex-col gap-1">
      <Box className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 gap-2 text-xs" disabled={pending}>
              <CalendarRange className="size-3.5" />
              {label}
              <ChevronDown className="size-3.5 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <Box className="flex flex-col gap-0.5">
              {/* En tête, parce que c'est la réponse juste pour beaucoup de
                  gens : le prochain rendez-vous peut être dans n'importe lequel
                  de leurs agendas, et personne ne sait lequel à l'avance. */}
              <button
                type="button"
                disabled={pending}
                onClick={() => selectAll.mutate()}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--bellum-surface-2)] disabled:opacity-60"
              >
                <Text size="xs" weight="medium">
                  {t('agenda.picker.all')}
                </Text>
                {readsAll ? <Check className="size-3.5 text-[var(--bellum-text-accent)]" /> : null}
              </button>

              <Box className="my-1 h-px bg-[var(--bellum-border)]" />

              {calendars.map(calendar => {
                const key = calendarKey(calendar)
                const checked = checkedKeys.has(key)
                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bellum-surface-2)]"
                  >
                    <Checkbox checked={checked} disabled={pending} onCheckedChange={() => toggle(calendar)} />
                    <Box className="flex min-w-0 flex-1 flex-col">
                      <Text size="xs" className="truncate">
                        {calendar.name}
                      </Text>
                      {/* #2112.35 — « Menu riche : description ». `canWrite` est
                          déjà servi par l'API (jamais fabriqué ici) : un agenda
                          partagé en lecture seule le dit, plutôt que de laisser
                          découvrir l'impossibilité d'écrire au moment de créer
                          un événement dedans. */}
                      {!calendar.canWrite ? (
                        <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                          {t('agenda.picker.readOnly')}
                        </Text>
                      ) : null}
                    </Box>
                    {calendar.primary ? (
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {t('agenda.picker.default')}
                      </Badge>
                    ) : null}
                  </label>
                )
              })}
            </Box>
          </PopoverContent>
        </Popover>
      </Box>

      {/* « Rien » et « je n'ai pas pu regarder » ne sont pas la même chose : une
          liste amputée par une panne se lirait « je n'ai que ces agendas ». */}
      {someProviderSilent ? (
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('agenda.picker.incomplete')}
        </Text>
      ) : null}

      {selectMany.isError || selectAll.isError ? (
        <Text size="xs" className="text-[var(--danger-soft-text)]">
          {t('agenda.picker.failed')}
        </Text>
      ) : null}
    </Box>
  )
}
