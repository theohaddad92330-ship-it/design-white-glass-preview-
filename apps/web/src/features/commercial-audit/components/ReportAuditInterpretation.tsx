import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AUDIT_INTERPRETATION_FIELD_KEY } from '@bellum/contracts'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
} from '@bellum/ui'
import { useReportCorrection } from '@/features/profile/hooks/useReportCorrection'

/**
 * #2010.15 — Pouvoir PRÉCISER / SIGNALER une mauvaise interprétation, sur
 * `/settings/profile/audit`.
 *
 * DISTINCT de `ReportCorrectionDialog` (#2018.7) : celui-ci signale qu'une
 * RÉPONSE déclarée est fausse (`fieldKey` = une clé d'`EsnAnswers`), sur
 * `/settings/profile`. Celui-ci signale que ce que l'audit en a CONCLU — le
 * verdict, une recommandation, une hypothèse — ne semble pas juste, sans
 * viser un champ précis : `fieldKey` porte la valeur fixe
 * `AUDIT_INTERPRETATION_FIELD_KEY`, jamais une clé de réponse. Même porte
 * d'écriture (`POST /esn-profile/correction-requests`), même discipline :
 * rien n'est écrasé, rien ne propose de valeur de remplacement — le geste
 * dit CE QUI semble faux et POURQUOI, la correction reste ailleurs.
 *
 * Auto-suffisant : porte son propre bouton et son propre dialogue, pour que
 * `CommercialAuditScreen.tsx` le monte sans état local à gérer (même choix
 * que les autres cartes de cet écran, toutes autonomes sur leurs props).
 */
export function ReportAuditInterpretation() {
  const { t } = useTranslation('commercialAudit')
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const { mutate, isPending } = useReportCorrection()

  const close = () => {
    setReason('')
    setOpen(false)
  }

  const submit = () => {
    const trimmed = reason.trim()
    if (trimmed.length === 0) return
    mutate(
      { fieldKey: AUDIT_INTERPRETATION_FIELD_KEY, reason: trimmed },
      {
        onSuccess: () => {
          toast.success(t('reportInterpretation.successTitle'))
          close()
        },
        onError: () => toast.error(t('reportInterpretation.errorBody')),
      },
    )
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('reportInterpretation.trigger')}
      </Button>
      <Dialog open={open} onOpenChange={next => (next ? undefined : close())}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('reportInterpretation.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('reportInterpretation.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="audit-interpretation-reason" className="text-sm font-medium">
              {t('reportInterpretation.reasonLabel')}
            </label>
            <Textarea
              id="audit-interpretation-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder={t('reportInterpretation.reasonPlaceholder') ?? undefined}
              rows={4}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('reportInterpretation.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={reason.trim().length === 0 || isPending}>
              {t('reportInterpretation.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
