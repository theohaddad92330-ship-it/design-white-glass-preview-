import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { microsoftApi, type OutlookCalendarEventInput } from '@/features/microsoft/api'
import { useMicrosoftStatus } from '@/features/microsoft/hooks/useMicrosoftStatus'
import { MicrosoftConnectNotice } from '@/features/microsoft/components/MicrosoftConnectNotice'

/** Default event length when the user only picks a start (Graph needs an end). */
const DEFAULT_EVENT_MINUTES = 30

type OutlookScheduleDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Event title (the action text). */
  initialSummary: string
  /** Context appended to the event body (account/plan context). */
  initialDescription?: string
  /** Optional prefill for the start (a `datetime-local` value, `YYYY-MM-DDTHH:mm`). */
  initialStartLocal?: string
  contextLabel?: string
  /** #3287 (#3265.2) — appelé avec l'identifiant de l'événement RÉELLEMENT créé. */
  onCreated?: (eventId: string) => void
}

/** Default the picker to the next round hour when no deadline is known. */
function nextHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * Turn a plan action + its due date into an Outlook calendar event / follow-up
 * reminder (mirror of {@link AddToCalendarDialog}). The start is picked as local
 * wall-clock; both `start` and `end` are sent as RFC3339 timestamps (Microsoft
 * Graph requires an explicit end, so we derive start + 30 min).
 */
export function OutlookScheduleDialog({
  open,
  onOpenChange,
  initialSummary,
  initialDescription,
  initialStartLocal,
  contextLabel,
  onCreated,
}: OutlookScheduleDialogProps) {
  const { t } = useTranslation('microsoft')
  const { data: status } = useMicrosoftStatus()
  const [summary, setSummary] = useState('')
  const [startLocal, setStartLocal] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (open) {
      setSummary(initialSummary)
      setStartLocal(initialStartLocal || nextHourLocal())
      setDescription(initialDescription ?? '')
    }
  }, [open, initialSummary, initialStartLocal, initialDescription])

  const create = useMutation({
    mutationFn: (input: OutlookCalendarEventInput) => microsoftApi.createCalendarEvent(input),
    onSuccess: created => {
      // #3287 (#3265.2) — l'événement est RÉELLEMENT créé : son identifiant remonte.
      if (created?.id) onCreated?.(created.id)
      toast.success(t('calendar.created'))
      onOpenChange(false)
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : t('calendar.error')),
  })

  const connected = status?.connected ?? false
  const valid = summary.trim().length > 0 && startLocal.length > 0

  const submit = () => {
    const startDate = new Date(startLocal)
    const endDate = new Date(startDate.getTime() + DEFAULT_EVENT_MINUTES * 60 * 1000)
    create.mutate({
      subject: summary.trim(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      ...(description.trim() ? { body: description.trim() } : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
            <CalendarPlus className="size-4" aria-hidden />
            {t('calendar.title')}
          </DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {contextLabel ? contextLabel : t('calendar.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {!connected ? (
          <MicrosoftConnectNotice message={t('calendar.notConnected')} />
        ) : (
          <Box className="space-y-3">
            <Box className="space-y-1.5">
              <Label htmlFor="outlook-cal-summary">{t('calendar.summary')}</Label>
              <Input id="outlook-cal-summary" value={summary} onChange={e => setSummary(e.target.value)} />
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="outlook-cal-start">{t('calendar.start')}</Label>
              <Input
                id="outlook-cal-start"
                type="datetime-local"
                value={startLocal}
                onChange={e => setStartLocal(e.target.value)}
              />
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="outlook-cal-desc">{t('calendar.description')}</Label>
              <Textarea
                id="outlook-cal-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
              />
            </Box>
          </Box>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t('common:actions.cancel')}
          </Button>
          {connected ? (
            <Button
              variant="black"
              size="sm"
              icon={CalendarPlus}
              disabled={!valid}
              isLoading={create.isPending}
              onClick={submit}
            >
              {t('calendar.add')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
