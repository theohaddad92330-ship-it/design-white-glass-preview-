import { INTERVIEW_MODES, type InterviewMode } from '@bellum/contracts'
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
  Text,
  Textarea,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useScheduleInterview } from '../api'

const NOTES_MAX = 5000
const ATTENDEE_MAX = 200

/**
 * #2173.41 — « Planifier un entretien », depuis la LIGNE d'un positionnement.
 *
 * Le contrat (`scheduleInterviewSchema`, `submission.ts`), la route
 * (`POST /submissions/:id/interviews`) et le hook web (`useScheduleInterview`)
 * existaient depuis le chantier ATS — sans AUCUN appelant. Voir le docblock de
 * `SubmissionFeedbackDialog`, qui documente la même famille de défaut pour le
 * retour client, à trois lignes de là.
 *
 * Même patron que `SubmissionFeedbackDialog` : une seule fenêtre, montée par
 * `SubmissionRow`, réutilisée par le kebab comme par la ligne — il n'existe
 * qu'un seul endroit d'où planifier un entretien sur CE positionnement.
 *
 * Programmer un entretien fait AVANCER le positionnement côté serveur (le
 * service le fait déjà, `submissions.service.ts` — `scheduleInterview`) : ce
 * geste n'est donc PAS une donnée de plus à côté du statut, c'est un des
 * chemins qui le fait bouger, exactement comme les boutons de transition
 * voisins sur `SubmissionRow`.
 */
export function ScheduleInterviewDialog({
  submissionId,
  talentName,
  open,
  onClose,
}: {
  submissionId: string
  talentName: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')
  const schedule = useScheduleInterview(submissionId)

  const [scheduledAt, setScheduledAt] = useState('')
  const [mode, setMode] = useState<InterviewMode>('remote')
  const [attendees, setAttendees] = useState('')
  const [notes, setNotes] = useState('')

  // Réamorcé à CHAQUE ouverture : un second entretien ne doit pas hériter de
  // la date, du mode ou des présents du précédent.
  useEffect(() => {
    if (!open) return
    setScheduledAt('')
    setMode('remote')
    setAttendees('')
    setNotes('')
  }, [open])

  const canSubmit = scheduledAt.length > 0 && !schedule.isPending

  const submit = () => {
    if (!canSubmit) return
    schedule.mutate(
      {
        scheduledAt: new Date(scheduledAt).toISOString(),
        mode,
        clientAttendees: attendees
          .split(',')
          .map(name => name.trim())
          .filter(name => name.length > 0)
          .slice(0, 20)
          .map(name => name.slice(0, ATTENDEE_MAX)),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('interview.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('interview.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          <Box className="space-y-1.5">
            <Label htmlFor="interview-scheduled-at">{t('interview.at')}</Label>
            <Input
              id="interview-scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={event => setScheduledAt(event.target.value)}
            />
          </Box>

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('interview.mode')}
            </Text>
            <Box display="flex" className="flex-wrap gap-1.5">
              {INTERVIEW_MODES.map(value => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={mode === value ? 'default' : 'outline'}
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {t(`interview.modes.${value}`)}
                </Button>
              ))}
            </Box>
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="interview-attendees">{t('interview.attendees')}</Label>
            <Input
              id="interview-attendees"
              value={attendees}
              onChange={event => setAttendees(event.target.value)}
              placeholder={t('interview.attendeesPlaceholder')}
            />
          </Box>

          <Box className="space-y-1.5">
            <Label htmlFor="interview-notes">{t('interview.notes')}</Label>
            <Textarea
              id="interview-notes"
              value={notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={event => setNotes(event.target.value.slice(0, NOTES_MAX))}
            />
          </Box>
        </Box>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit} isLoading={schedule.isPending}>
            {t('interview.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
