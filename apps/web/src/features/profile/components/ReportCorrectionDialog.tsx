import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
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

type Props = {
  open: boolean
  /** La clé `EsnAnswers` signalée — jamais écrite par ce dialogue. */
  fieldKey: string
  onOpenChange: (open: boolean) => void
}

/**
 * #2018.7 — signaler une information d'entreprise fausse, SANS l'écraser.
 *
 * N'écrit jamais `EsnAnswers` : la seule mutation possible d'ici est
 * `POST /esn-profile/correction-requests` (`useReportCorrection`), qui ne
 * touche jamais le profil. La correction reste le geste de qui a le droit
 * d'écrire (owner/admin/sales_ops).
 */
export function ReportCorrectionDialog({ open, fieldKey, onOpenChange }: Props) {
  const { t } = useTranslation('profile')
  const [reason, setReason] = useState('')
  const { mutate, isPending } = useReportCorrection()

  const close = () => {
    setReason('')
    onOpenChange(false)
  }

  const submit = () => {
    const trimmed = reason.trim()
    if (trimmed.length === 0) return
    mutate(
      { fieldKey, reason: trimmed },
      {
        onSuccess: () => {
          toast.success(t('esn.correction.successTitle'))
          close()
        },
        onError: () => toast.error(t('esn.correction.errorBody')),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : close())}>
      <DialogContent closeLabel={t('common:actions.close')}>
        <DialogHeader>
          <DialogTitle>{t('esn.correction.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('esn.correction.dialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="correction-reason" className="text-sm font-medium">
            {t('esn.correction.reasonLabel')}
          </label>
          <Textarea
            id="correction-reason"
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={t('esn.correction.reasonPlaceholder') ?? undefined}
            rows={4}
            maxLength={2000}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={close}>
            {t('esn.correction.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={reason.trim().length === 0 || isPending}>
            {t('esn.correction.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
