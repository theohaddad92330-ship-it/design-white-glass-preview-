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
import {
  CONSULTANT_FEEDBACK_AXES,
  FEEDBACK_AXES,
  type RecordConsultantFeedbackInput,
  type RecordFeedbackInput,
} from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecordConsultantFeedback, useRecordFeedback } from '../api'

/**
 * Théo C projects-presentations.N5 + A2 — « CONSIGNER UN ENTRETIEN », un geste unique.
 *
 * Deux champs : le compte rendu FACTUEL (le retour du client) et « ce qu'en dit le consultant ». Le second
 * est INTERNE — il ne part jamais chez le client — et s'écrit dans l'objet séparé du retour consultant
 * (`recordConsultantFeedback`), jamais fusionné avec le retour client (#2335.5). Les huit axes détaillés
 * restent ouverts depuis « Historique et retours » : rien de l'existant ne se perd.
 */
export function ConsignInterviewDialog({
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
  const recordClient = useRecordFeedback(submissionId)
  const recordConsultant = useRecordConsultantFeedback(submissionId)
  const [clientText, setClientText] = useState('')
  const [consultantText, setConsultantText] = useState('')
  const pending = recordClient.isPending || recordConsultant.isPending
  const canSave = (clientText.trim().length > 0 || consultantText.trim().length > 0) && !pending

  const save = async () => {
    if (!canSave) return
    // Séquentiel : un échec du premier ne laisse pas croire que le second est parti.
    // Aucun axe n'est coché ici : « inconnu » n'est jamais un « non » — seul le verbatim est écrit.
    if (clientText.trim()) {
      const axes = Object.fromEntries(FEEDBACK_AXES.map(axis => [axis, 'unknown'])) as Pick<
        RecordFeedbackInput,
        (typeof FEEDBACK_AXES)[number]
      >
      await recordClient.mutateAsync({ ...axes, verbatim: clientText.trim() })
    }
    if (consultantText.trim()) {
      const axes = Object.fromEntries(CONSULTANT_FEEDBACK_AXES.map(axis => [axis, 'unknown'])) as Pick<
        RecordConsultantFeedbackInput,
        (typeof CONSULTANT_FEEDBACK_AXES)[number]
      >
      await recordConsultant.mutateAsync({ ...axes, verbatim: consultantText.trim() })
    }
    setClientText('')
    setConsultantText('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('presentations.consign.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('presentations.consign.description')}</DialogDescription>
        </DialogHeader>
        <Box className="space-y-3">
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.consign.client')}
            </Text>
            <Textarea
              value={clientText}
              onChange={event => setClientText(event.target.value)}
              rows={3}
              className="mt-1"
            />
          </label>
          <label className="block">
            <Text size="xs" weight="medium" element="span">
              {t('presentations.consign.consultant')}
            </Text>
            <Textarea
              value={consultantText}
              onChange={event => setConsultantText(event.target.value)}
              rows={3}
              className="mt-1"
            />
            <Text size="xs" color="text-muted-foreground" className="mt-1 block">
              {t('presentations.consign.internal')}
            </Text>
          </label>
        </Box>
        <DialogFooter>
          <Button type="button" variant="outline" className="pointer-coarse:min-h-11" onClick={onClose}>
            {t('presentations.add.cancel')}
          </Button>
          <Button type="button" className="pointer-coarse:min-h-11" disabled={!canSave} onClick={() => void save()}>
            {t('presentations.consign.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
