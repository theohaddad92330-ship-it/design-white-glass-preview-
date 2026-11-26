import { useState } from 'react'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4158.31 — déléguer une action à un collègue EXIGE une note de contexte, montrée au délégataire avec
 * l'action. Le bouton reste inerte tant que la note est vide : le serveur la refuse aussi (400), cet
 * écran ne promet donc jamais un geste qui échouerait.
 */
export function HandoffNoteDialog({
  open,
  assigneeName,
  onConfirm,
  onCancel,
}: {
  open: boolean
  assigneeName: string
  onConfirm: (note: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation('actions')
  const [note, setNote] = useState('')
  const trimmed = note.trim()

  return (
    <Dialog open={open} onOpenChange={next => !next && onCancel()}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('handoff.title', { name: assigneeName })}</DialogTitle>
          <DialogDescription>{t('handoff.description', { name: assigneeName })}</DialogDescription>
        </DialogHeader>
        <textarea
          value={note}
          rows={4}
          maxLength={1000}
          aria-label={t('handoff.label')}
          placeholder={t('handoff.placeholder')}
          onChange={event => setNote(event.target.value)}
          className="w-full resize-y rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-2 py-1.5 text-sm text-[var(--bellum-text-primary)]"
        />
        {trimmed.length === 0 ? (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('handoff.required')}
          </Text>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={trimmed.length === 0}
            onClick={() => {
              onConfirm(trimmed)
              setNote('')
            }}
          >
            {t('handoff.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
