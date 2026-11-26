import type { Account, AttackAngle } from '@bellum/contracts'
import { Badge, Box, Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ExternalLink, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { googleApi, type CalendarEventSummary } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'

/** Format an event start (RFC3339 dateTime or all-day date) for display. */
function formatWhen(start: string | null, locale: string): string {
  if (!start) return ''
  const d = new Date(start)
  if (Number.isNaN(d.getTime())) return start
  // All-day events carry a bare `YYYY-MM-DD` (no time component).
  const allDay = /^\d{4}-\d{2}-\d{2}$/.test(start)
  return allDay
    ? d.toLocaleDateString(locale, { dateStyle: 'full' })
    : d.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * "Brief de prépa réunion" — surfaces the next upcoming Google Calendar event that
 * matches the account (filtered server-side by the account's registrable domain),
 * with date, participants and a reminder of the key attack angles. Renders nothing
 * unless Google is connected with the calendar.readonly scope AND a matching
 * meeting exists — never a placeholder.
 */
export function MeetingPrepBrief({ account, angles = [] }: { account: Account; angles?: AttackAngle[] }) {
  const { t, i18n } = useTranslation('google')
  const { data: status } = useGoogleStatus()
  const connected = status?.connected ?? false
  const canRead = status?.capabilities?.calendarRead ?? false

  const filter = account.website?.trim() || account.company_name?.trim() || ''
  const eventsQuery = useQuery({
    queryKey: ['google-upcoming-events', account.id, filter],
    queryFn: () => googleApi.upcomingEvents({ query: filter || undefined, maxResults: 5 }),
    enabled: connected && canRead && filter.length > 0,
    staleTime: 60_000,
  })

  const events = eventsQuery.data ?? []
  if (!connected || !canRead || events.length === 0) return null

  const next: CalendarEventSummary | undefined = events[0]
  if (!next) return null
  const angleTitles = angles
    .map(a => a.title?.trim())
    .filter((x): x is string => !!x)
    .slice(0, 3)

  return (
    <Card className="rounded-2xl border-violet-500/30 p-5">
      <Box display="flex" className="mb-3 items-center gap-2 text-[var(--bellum-text-accent)]">
        <CalendarClock className="size-4" />
        <Text element="h2" size="base" weight="semibold" color="text-foreground">
          {t('brief.title')}
        </Text>
      </Box>

      <Box className="space-y-2">
        <Box display="flex" className="items-baseline justify-between gap-2">
          <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
            {next.summary || t('brief.untitledEvent')}
          </Text>
          {next.htmlLink ? (
            <a
              href={next.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-[var(--bellum-text-accent)] hover:underline"
            >
              {t('brief.openInCalendar')}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </Box>

        <Text size="sm" color="text-[var(--bellum-text-secondary)]">
          {formatWhen(next.start, i18n.language)}
        </Text>

        {next.attendees.length > 0 ? (
          <Box display="flex" className="items-start gap-1.5">
            <Users className="mt-0.5 size-3.5 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {next.attendees.map(a => a.displayName || a.email).join(', ')}
            </Text>
          </Box>
        ) : null}

        {angleTitles.length > 0 ? (
          <Box className="pt-2">
            <Text size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
              {t('brief.keyAngles')}
            </Text>
            <Box display="flex" className="mt-1.5 flex-wrap gap-1.5">
              {angleTitles.map(title => (
                <Badge key={title} variant="secondary" className="text-xs">
                  {title}
                </Badge>
              ))}
            </Box>
          </Box>
        ) : null}
      </Box>
    </Card>
  )
}
