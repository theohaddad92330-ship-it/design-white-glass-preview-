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
  Text,
  Textarea,
} from '@bellum/ui'
import { useCommercialAuditFeedback, useCreateCommercialAuditFeedback } from '../hooks/useCommercialAuditFeedback'

/**
 * #2075.12 / #2075.13 (épopée #2774) — commenter une conclusion, refuser une
 * recommandation. `targetKey` est la clé de l'audit visée (un `AuditHeadlineKey`
 * pour une conclusion, un `AuditColumnKey` pour une recommandation) — la même
 * chaîne que `build-audit.ts` porte déjà, jamais un second identifiant.
 *
 * Auto-suffisant, même patron que `ReportAuditInterpretation.tsx` : porte sa
 * propre lecture, son propre dialogue, aucun état à faire remonter à l'écran
 * qui le monte.
 *
 * Un refus est le clic ET la décision (geste utilisateur = auto-approuvé,
 * même précédent que `useRecordAuditMoveDecision`) — pas de dialogue, pas de
 * texte. Un commentaire, lui, exige un texte non vide avant de partir.
 */
export function AuditFeedbackControls({ targetKey }: { targetKey: string }) {
  const { t } = useTranslation('commercialAudit')
  const { data } = useCommercialAuditFeedback()
  const { mutate, isPending } = useCreateCommercialAuditFeedback()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const current = data?.feedback[targetKey] ?? null

  const close = () => {
    setText('')
    setOpen(false)
  }

  const submitComment = () => {
    const trimmed = text.trim()
    if (trimmed.length === 0) return
    mutate(
      { target_key: targetKey, kind: 'comment', comment_text: trimmed },
      { onSuccess: close, onError: () => toast.error(t('feedback.errorBody')) },
    )
  }

  const refuse = () => {
    mutate({ target_key: targetKey, kind: 'refused' }, { onError: () => toast.error(t('feedback.errorBody')) })
  }

  return (
    <div className="space-y-1.5">
      {current ? (
        <Text
          element="p"
          size="xs"
          data-testid="audit-feedback-current"
          className="text-[var(--bellum-text-secondary)]"
        >
          {current.kind === 'refused'
            ? t('feedback.refusedNote')
            : current.kind === 'validated'
              ? t('feedback.validatedNote')
              : t('feedback.commentedNote', { text: current.comment_text })}
        </Text>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(true)}>
          {t('feedback.commentTrigger')}
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={refuse} disabled={isPending}>
          {t('feedback.refuseTrigger')}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={next => (next ? undefined : close())}>
        <DialogContent closeLabel={t('common:actions.close')}>
          <DialogHeader>
            <DialogTitle>{t('feedback.dialogTitle')}</DialogTitle>
            <DialogDescription>{t('feedback.dialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor={`audit-feedback-text-${targetKey}`} className="text-sm font-medium">
              {t('feedback.textLabel')}
            </label>
            <Textarea
              id={`audit-feedback-text-${targetKey}`}
              value={text}
              onChange={event => setText(event.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('feedback.cancel')}
            </Button>
            <Button type="button" onClick={submitComment} disabled={text.trim().length === 0 || isPending}>
              {t('feedback.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
