import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Text,
} from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * #3781 — « Supprimer définitivement » une sélection du vivier (retour bêta du
 * 06/10/2026) : l'EFFACEMENT RGPD (art. 17) de personnes, jamais un simple
 * retrait. Tranché sans Louis : la doctrine « on archive, on ne supprime pas »
 * a une seule exception écrite — l'effacement d'une personne (c67) — et un
 * consultant est une personne.
 *
 * LA CONFIRMATION EST EXPLICITE ET ANNONCE LA CONSÉQUENCE AVANT LE CLIC : ce
 * qui part, ce qui reste (une trace sans donnée personnelle, pour qu'elle ne
 * soit pas recollectée), et que rien ne se défait. Le bouton ne s'arme qu'une
 * fois le mot demandé tapé : cocher « tout » puis cliquer deux fois ne suffit
 * pas à effacer cinq cents personnes.
 */
export function TalentEraseDialog({
  count,
  open,
  pending,
  onOpenChange,
  onConfirm,
}: {
  count: number
  open: boolean
  pending: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('consultants')
  const [typed, setTyped] = useState('')
  const word = t('erase.word')
  const armed = typed.trim().toLowerCase() === word.toLowerCase()

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (!next) setTyped('')
        onOpenChange(next)
      }}
    >
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('erase.title', { count })}</DialogTitle>
          <DialogDescription>{t('erase.body')}</DialogDescription>
        </DialogHeader>
        <Text size="sm" color="text-muted-foreground">
          {t('erase.trace')}
        </Text>
        <Text size="sm" color="text-muted-foreground">
          {t('erase.skippedNote')}
        </Text>
        <label className="flex flex-col gap-1.5">
          <Text size="sm" weight="medium">
            {t('erase.typePrompt', { word })}
          </Text>
          <Input value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('erase.cancel')}
          </Button>
          <Button variant="destructive" disabled={!armed || pending} onClick={onConfirm}>
            {t('erase.confirm', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
