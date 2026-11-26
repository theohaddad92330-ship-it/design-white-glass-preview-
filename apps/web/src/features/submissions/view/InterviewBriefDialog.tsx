import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '@/lib/locale'
import { consultantsApi } from '../../consultants/api'
import { useMarkInterviewBriefViewed, useSubmissionInterviews } from '../api'

/**
 * #2189.23-.30 (épopée #2940) — le brief D'ENTRETIEN : objectif, pitch, deux
 * expériences, ce qui manque, les objections probables, des questions prêtes
 * pour le consultant. Distinct du brief de SOUTENANCE (`ConsultantBriefDialog`).
 *
 * Les PARTICIPANTS et la LOGISTIQUE ne sont pas dans le brief lui-même : ils
 * viennent de l'entretien déjà PLANIFIÉ (`useSubmissionInterviews`, existant),
 * assemblés ICI plutôt que dupliqués côté serveur — « on n'affiche pas ce
 * qu'on n'a pas » : sans entretien programmé, la section le DIT.
 */
export function InterviewBriefDialog({
  open,
  submissionId,
  consultantId,
  projectId,
  consultantName,
  onClose,
}: {
  open: boolean
  submissionId: string
  consultantId: string
  projectId: string
  consultantName: string
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')

  const brief = useQuery({
    queryKey: ['interview-brief', consultantId, projectId],
    queryFn: () => consultantsApi.interviewBrief(consultantId, projectId),
    enabled: open,
    staleTime: 0,
  })
  const interviews = useSubmissionInterviews(open ? submissionId : undefined)
  const latestInterview = interviews.data?.[0] ?? null
  const participants = latestInterview ? [consultantName, ...latestInterview.clientAttendees] : []

  // #2875/#3398 (BM) — « entretien à préparer » : la trace de consultation se
  // pose à la première OUVERTURE réelle de ce dialogue, pas à son montage.
  const markBriefViewed = useMarkInterviewBriefViewed(submissionId)
  useEffect(() => {
    if (open && latestInterview && !latestInterview.briefViewedAt) {
      markBriefViewed.mutate({ interviewId: latestInterview.id })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, latestInterview?.id, latestInterview?.briefViewedAt])

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('interviewBrief.title', { name: consultantName })}</DialogTitle>
          <DialogDescription>{t('interviewBrief.description')}</DialogDescription>
        </DialogHeader>

        {brief.isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : null}

        {brief.isError ? (
          <Text size="sm" color="text-muted-foreground">
            {t('interviewBrief.loadError')}
          </Text>
        ) : null}

        {brief.data ? (
          <Box className="space-y-4">
            <Field label={t('interviewBrief.objective')} value={brief.data.objective} />
            <Field label={t('interviewBrief.pitch')} value={brief.data.pitch} />

            <ListSection
              title={t('interviewBrief.participants')}
              items={participants}
              empty={t('interviewBrief.noParticipants')}
            />
            <Box className="space-y-1">
              <Text element="h4" size="xs" weight="semibold" color="text-muted-foreground">
                {t('interviewBrief.logistics')}
              </Text>
              {latestInterview ? (
                <Text element="p" size="sm">
                  {t(`interview.modes.${latestInterview.mode}`)} — {formatDateTime(latestInterview.scheduledAt)}
                </Text>
              ) : (
                <Text element="p" size="sm" color="text-muted-foreground">
                  {t('interviewBrief.noInterviewScheduled')}
                </Text>
              )}
            </Box>

            <ListSection
              title={t('interviewBrief.keyExperiences')}
              items={brief.data.keyExperiences}
              empty={t('interviewBrief.noKeyExperiences')}
            />
            <ListSection title={t('interviewBrief.gaps')} items={brief.data.gaps} empty={t('interviewBrief.noGaps')} />
            <ListSection
              title={t('interviewBrief.objections')}
              items={brief.data.objections}
              empty={t('interviewBrief.noObjections')}
            />
            <ListSection
              title={t('interviewBrief.consultantQuestions')}
              items={brief.data.consultantQuestions}
              empty=""
            />
          </Box>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Box className="space-y-1">
      <Text element="h4" size="xs" weight="semibold" color="text-muted-foreground">
        {label}
      </Text>
      <Text element="p" size="sm">
        {value}
      </Text>
    </Box>
  )
}

/** Une liste vide le DIT — elle ne disparaît pas (sauf gabarit générique, sans absence à nommer). */
function ListSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  if (items.length === 0 && !empty) return null
  return (
    <Box className="space-y-1">
      <Text element="h4" size="xs" weight="semibold" color="text-muted-foreground">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text element="p" size="sm" color="text-muted-foreground">
          {empty}
        </Text>
      ) : (
        <ul className="space-y-1">
          {items.map(item => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-[var(--bellum-text-accent)]" />
              <Text element="p" size="sm">
                {item}
              </Text>
            </li>
          ))}
        </ul>
      )}
    </Box>
  )
}
