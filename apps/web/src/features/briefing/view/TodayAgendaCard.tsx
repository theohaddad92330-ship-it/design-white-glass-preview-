import type { AgendaConflict, AgendaEvent } from '@bellum/contracts'
import { Box, Button, Text } from '@bellum/ui'
import { ChevronRight, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isAllDay, timingOf } from '@/features/agenda/agenda-view'

/**
 * Refonte Théo (A · today-jour) — « Les rendez-vous du jour », la carte de la
 * colonne de droite : une rangée par rendez-vous (heure · titre · lieu ·
 * chevauchement · « Ouvrir le rendez-vous »). La semaine entière et la grille
 * horaire vivent dans l'onglet « Mon agenda » (`onSeeAgenda`), jamais recopiées ici.
 *
 * Chaque geste ouvre un état qui existe déjà : le pré-brief (`MeetingPrepDialog`)
 * et la boîte de conflit (`ConflictDialog`). Un titre absent ne fait aucune ligne
 * (#3533) ; une journée sans rendez-vous ne fait aucune rangée.
 */
export function TodayAgendaCard({
  events,
  conflictsByEventId,
  now,
  language,
  onOpenEvent,
  onOpenConflict,
}: {
  events: AgendaEvent[]
  conflictsByEventId: ReadonlyMap<string, AgendaConflict>
  now: Date
  language: string
  onOpenEvent: (event: AgendaEvent) => void
  onOpenConflict: (conflict: AgendaConflict) => void
}) {
  const { t } = useTranslation('briefing')
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })
  const visible = events.filter(event => !event.cancelled)
  if (visible.length === 0) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('agenda.board.emptyDay')}
      </Text>
    )
  }
  return (
    <ul data-testid="today-agenda-rows" className="flex flex-col">
      {visible.map(event => {
        const timing = timingOf(event, now)
        const conflict = conflictsByEventId.get(event.id) ?? null
        const title = event.summary?.trim()
        const place = event.location?.trim()
        return (
          <li
            key={event.id}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 border-b border-[var(--bellum-border)] py-3 last:border-b-0"
          >
            <Text element="span" size="sm" weight="semibold" className="font-mono text-[var(--bellum-text-accent)]">
              {isAllDay(event) || !event.start ? t('agenda.allDay') : time.format(new Date(event.start))}
            </Text>
            <Box className="flex min-w-0 flex-col gap-1">
              {title ? (
                <Text size="sm" weight="semibold" className="line-clamp-2">
                  {title}
                </Text>
              ) : null}
              {place || timing.phase === 'live' ? (
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {[place, timing.phase === 'live' ? t('agenda.board.live') : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
              {conflict ? (
                <button
                  type="button"
                  onClick={() => onOpenConflict(conflict)}
                  className="flex w-fit items-center gap-1.5 rounded-badge bg-[var(--warning-soft-bg)] px-2 py-1 text-xs font-medium text-[var(--warning-soft-text)] pointer-coarse:min-h-11"
                >
                  <Clock className="size-3" aria-hidden="true" />
                  {t('agenda.board.conflict')}
                </button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                className="w-fit px-0"
                onClick={() => onOpenEvent(event)}
                aria-label={title ? `${t('today.agendaCard.open')} — ${title}` : t('today.agendaCard.open')}
              >
                <ChevronRight className="size-3.5" aria-hidden="true" />
                {t('today.agendaCard.open')}
              </Button>
            </Box>
          </li>
        )
      })}
    </ul>
  )
}
