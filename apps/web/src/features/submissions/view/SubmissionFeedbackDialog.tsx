import { FEEDBACK_AXES, FEEDBACK_VERDICTS, type FeedbackVerdict } from '@bellum/contracts'
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
  Textarea,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordFeedback, useSubmissionFeedback } from '../api'

/**
 * Le retour du client après une présentation de profil.
 *
 * ⚠️ Les quatre axes fermés, le verbatim, la table, le service et la route
 * existaient depuis le chantier ATS — et les quatre hooks web
 * (`useSubmissionFeedback`, `useRecordFeedback`, `useSubmissionInterviews`,
 * `useScheduleInterview`) n'avaient **aucun appelant**. Le seul retour réellement
 * câblé était un pouce haut / pouce bas sur la carte de match, dont les champs
 * `reason` et `learning` n'étaient jamais envoyés.
 *
 * Deux règles portent l'honnêteté de cet écran :
 *
 * - `unknown` est la valeur PAR DÉFAUT de chaque axe, et elle veut dire « le
 *   client n'en a pas parlé ». La confondre avec « en dessous » ferait un
 *   reproche que personne n'a formulé, et ce reproche remonterait ensuite dans
 *   la calibration du matching.
 * - un retour vide n'est pas un retour : le serveur refuse, et le bouton reste
 *   éteint tant qu'aucun axe n'est renseigné et que rien n'est écrit.
 */
export function SubmissionFeedbackDialog({
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
  const { data: existing } = useSubmissionFeedback(open ? submissionId : undefined)
  const record = useRecordFeedback(submissionId)

  const [verdicts, setVerdicts] = useState<Record<string, FeedbackVerdict>>({})
  const [verbatim, setVerbatim] = useState('')
  // #2335.6 — l'apprentissage : une note libre, JAMAIS lue pour réécrire le
  // profil consultant (voir `SubmissionsService.recordFeedback`).
  const [learning, setLearning] = useState('')

  const anyAxis = FEEDBACK_AXES.some(axis => (verdicts[axis] ?? 'unknown') !== 'unknown')
  const canSubmit = (anyAxis || verbatim.trim().length > 0) && !record.isPending

  const submit = () => {
    if (!canSubmit) return
    const axes = Object.fromEntries(FEEDBACK_AXES.map(axis => [axis, verdicts[axis] ?? 'unknown'])) as Record<
      (typeof FEEDBACK_AXES)[number],
      FeedbackVerdict
    >
    record.mutate(
      {
        ...axes,
        ...(verbatim.trim() ? { verbatim: verbatim.trim() } : {}),
        ...(learning.trim() ? { learning: learning.trim() } : {}),
      },
      {
        onSuccess: () => {
          setVerdicts({})
          setVerbatim('')
          setLearning('')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('feedback.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('feedback.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          {FEEDBACK_AXES.map(axis => (
            <Box key={axis} className="space-y-1">
              <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
                {t(`feedback.axis.${axis}`)}
              </Text>
              <Box display="flex" className="flex-wrap gap-1.5">
                {FEEDBACK_VERDICTS.map(verdict => {
                  const selected = (verdicts[axis] ?? 'unknown') === verdict
                  return (
                    <Button
                      key={verdict}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      aria-pressed={selected}
                      onClick={() => setVerdicts(prev => ({ ...prev, [axis]: verdict }))}
                    >
                      {t(`feedback.verdict.${verdict}`)}
                    </Button>
                  )
                })}
              </Box>
            </Box>
          ))}

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('feedback.verbatim')}
            </Text>
            <Textarea
              value={verbatim}
              onChange={event => setVerbatim(event.target.value)}
              placeholder={t('feedback.verbatimPlaceholder')}
              rows={3}
              maxLength={5000}
            />
          </Box>

          <Box className="space-y-1">
            <Text element="p" size="xs" weight="semibold" color="text-muted-foreground">
              {t('feedback.learning')}
            </Text>
            <Textarea
              value={learning}
              onChange={event => setLearning(event.target.value)}
              placeholder={t('feedback.learningPlaceholder')}
              rows={2}
              maxLength={2000}
            />
          </Box>

          {existing && existing.length > 0 ? (
            <Text element="p" size="xs" color="text-muted-foreground">
              {t('feedback.alreadyRecorded', { count: existing.length })}
            </Text>
          ) : null}
        </Box>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          {/* Éteint tant qu'il n'y a rien à enregistrer : le serveur refuse un
              retour vide, et un bouton qui mène à un refus est un piège. */}
          <Button type="button" onClick={submit} disabled={!canSubmit}>
            {t('feedback.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
