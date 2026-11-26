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
} from '@bellum/ui'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * #3416.2b — la date, FACULTATIVE, de l'issue « À rappeler ».
 *
 * Le serveur sait déjà faire UNE tâche datée quand `callback_date` accompagne
 * l'issue `callback_scheduled` (rien sans date) ; le sélecteur d'issue ne
 * demandait jamais la date. Ce dialogue la demande, une fois, au moment de
 * choisir l'issue — et n'invente rien : champ vide ⇒ aucune date envoyée.
 */
export function CallbackDateDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `undefined` quand le champ est vide : l'appelant n'envoie alors aucune date. */
  onConfirm: (callbackDate: string | undefined) => void
}) {
  const { t } = useTranslation('actions')
  const id = useId()
  const [value, setValue] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('common:actions.close')}
        className="sm:max-w-sm border-[var(--bellum-border)]"
        onClick={event => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">{t('callbackDate.title')}</DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('callbackDate.description')}
          </DialogDescription>
        </DialogHeader>
        <Box className="space-y-1.5">
          <Label htmlFor={id}>{t('callbackDate.label')}</Label>
          <Input
            id={id}
            type="date"
            value={value}
            onChange={event => setValue(event.target.value)}
            className="min-h-11 w-full"
          />
        </Box>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('callbackDate.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            onClick={() => {
              onConfirm(value ? value : undefined)
              setValue('')
              onOpenChange(false)
            }}
          >
            {t('executeMenu.markDone')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
