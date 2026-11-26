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
import { googleApi, type CreateCalendarEventInput } from '@/features/google/api'
import { useGoogleStatus } from '@/features/google/hooks/useGoogleStatus'
import { GoogleConnectNotice } from '@/features/google/components/GoogleConnectNotice'

type AddToCalendarDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Event title (the action text). */
  initialSummary: string
  /** Context appended to the description (account/plan context). */
  initialDescription?: string
  /** Optional prefill for the start (a `datetime-local` value, `YYYY-MM-DDTHH:mm`). */
  initialStartLocal?: string
  /** Bellum account/contact URL appended to the event description. */
  link?: string
  contextLabel?: string
  /** #3287 (#3265.2) — appelé avec l'identifiant de l'événement RÉELLEMENT créé. */
  onCreated?: (eventId: string) => void
}

/** Default the picker to the next round hour when no deadline is known. */
function nextHourLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000)
  d.setMinutes(0, 0, 0)
  // `datetime-local` wants local wall-clock, so offset by the timezone before slicing.
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

/**
 * Turn a plan action + its due date into a Google Calendar event / relance
 * reminder. The start is picked as local wall-clock and sent as an RFC3339 UTC
 * timestamp; the backend defaults the end to +30 min and appends the Bellum link.
 */
export function AddToCalendarDialog({
  open,
  onOpenChange,
  initialSummary,
  initialDescription,
  initialStartLocal,
  link,
  contextLabel,
  onCreated,
}: AddToCalendarDialogProps) {
  const { t } = useTranslation('google')
  const { data: status } = useGoogleStatus()
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
    mutationFn: (input: CreateCalendarEventInput) => googleApi.createCalendarEvent(input),
    onSuccess: created => {
      // #3287 (#3265.2) — l'événement est RÉELLEMENT créé : son identifiant remonte.
      if (created?.id) onCreated?.(created.id)
      toast.success(t('calendar.created'))
      onOpenChange(false)
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : t('calendar.error')),
  })

  const connected = status?.connected ?? false
  const canCreate = status?.capabilities?.calendar ?? false
  const valid = summary.trim().length > 0 && startLocal.length > 0

  const submit = () => {
    const startDateTime = new Date(startLocal).toISOString()
    create.mutate({
      summary: summary.trim(),
      startDateTime,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(link ? { link } : {}),
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
          <GoogleConnectNotice level="read_write" message={t('calendar.notConnected')} />
        ) : (
          <Box className="space-y-3">
            <Box className="space-y-1.5">
              <Label htmlFor="cal-summary">{t('calendar.summary')}</Label>
              <Input id="cal-summary" value={summary} onChange={e => setSummary(e.target.value)} />
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="cal-start">{t('calendar.start')}</Label>
              <Input
                id="cal-start"
                type="datetime-local"
                value={startLocal}
                onChange={e => setStartLocal(e.target.value)}
              />
            </Box>
            <Box className="space-y-1.5">
              <Label htmlFor="cal-desc">{t('calendar.description')}</Label>
              <Textarea id="cal-desc" value={description} onChange={e => setDescription(e.target.value)} rows={4} />
            </Box>
            {/* #2078.23 — connexion en lecture seule (ou case décochée) : on
                propose l'élévation ici, plutôt qu'un bouton grisé sans issue. */}
            {!canCreate ? (
              <GoogleConnectNotice
                level="read_write"
                message={t('calendar.partialScopes')}
                ctaLabel={t('connect.allowWrite')}
              />
            ) : null}
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
              disabled={!valid || !canCreate}
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
