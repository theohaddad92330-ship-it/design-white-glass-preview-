import { CONSULTANT_FEEDBACK_AXES, FEEDBACK_VERDICTS, type FeedbackVerdict } from '@bellum/contracts'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FilterChips,
  Text,
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordConsultantFeedback, useSubmissionConsultantFeedback } from '../api'

/**
 * #2335.5 — le retour du CONSULTANT après une présentation, sur ses huit
 * propres axes. Un écran SÉPARÉ de `SubmissionFeedbackDialog` (retour client) —
 * même patron, même honnêteté (`unknown` par défaut, un retour vide refusé),
 * mais jamais le même formulaire ni la même table : la doctrine de l'issue
 * (« les deux feedbacks restent séparés ») se tient ici, pas seulement en base.
 */
export function SubmissionConsultantFeedbackDialog({
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
  const { data: existing } = useSubmissionConsultantFeedback(open ? submissionId : undefined)
  const record = useRecordConsultantFeedback(submissionId)

  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({})
  const [verbatim, setVerbatim] = useState('')

  const anyAxis = CONSULTANT_FEEDBACK_AXES.some(axis => (verdicts[axis] ?? 'unknown') !== 'unknown')
  const canSubmit = (anyAxis || verbatim.trim().length > 0) && !record.isPending

  const submit = () => {
    if (!canSubmit) return
    const axes = Object.fromEntries(
      CONSULTANT_FEEDBACK_AXES.map(axis => [axis, verdicts[axis] ?? 'unknown']),
    ) as Record<(typeof CONSULTANT_FEEDBACK_AXES)[number], FeedbackVerdict>
    record.mutate(
      {
        ...axes,
        ...(verbatim.trim() ? { verbatim: verbatim.trim() } : {}),
      },
      {
        onSuccess: () => {
          setVerdicts({})
          setVerbatim('')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('consultantFeedback.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('consultantFeedback.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          {CONSULTANT_FEEDBACK_AXES.map(axis => (
            <Box key={axis} className="space-y-1">
              <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
                {t(`consultantFeedback.axis.${axis}`)}
              </Text>
              {/* GA-249 : une rangée de choix exclusifs passe par `FilterChips`,
                  pas par des `<Button variant={…}>` écrits à la main —
                  voir `packages/ui/src/molecules/filter-chips.tsx`. */}
              <FilterChips
                ariaLabel={t(`consultantFeedback.axis.${axis}`)}
                size="sm"
                options={FEEDBACK_VERDICTS.map(verdict => ({
                  value: verdict,
                  label: t(`feedback.verdict.${verdict}`),
                }))}
                value={verdicts[axis] ?? 'unknown'}
                onChange={next => setVerdicts(prev => ({ ...prev, [axis]: next ?? 'unknown' }))}
              />
            </Box>
          ))}

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('feedback.verbatim')}
            </Text>
            <Textarea
              value={verbatim}
              onChange={event => setVerbatim(event.target.value)}
              placeholder={t('consultantFeedback.verbatimPlaceholder')}
              rows={3}
              maxLength={5000}
            />
          </Box>

          {existing && existing.length > 0 ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('consultantFeedback.alreadyRecorded', { count: existing.length })}
            </Text>
          ) : null}
        </Box>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {t('consultantFeedback.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
