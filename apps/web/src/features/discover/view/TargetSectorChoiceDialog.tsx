import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MAX_SEARCH_SECTORS, applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import { ToggleChip } from './filter-controls'

type Props = {
  /** Les secteurs de la cible, dans l'ordre de priorité du profil. */
  sectors: readonly string[]
  onConfirm: (chosen: string[]) => void
  onCancel: () => void
}

/**
 * #3528 (Louis 01/10) — « quand on applique notre cible et qu'il y a plus que
 * 5 filtres, ça nous demande de choisir ». La cible dépasse le plafond de
 * recherche (`MAX_SEARCH_SECTORS`) : on NE TRONQUE PAS en silence, on demande.
 *
 * #3848.1 (lot V01, 08/10) RETOURNÉ — #3528 pré-cochait les cinq premiers
 * (ordre de priorité du profil) pour garder l'action principale à un clic.
 * Signalé en bêta sept jours plus tard, par le même Louis : « arrêté de
 * toujours présélectionner, il faut repartir de 0 à chaque fois ». Pas une
 * entrée du registre de doctrine — un réglage produit ordinaire, changé par
 * son propre auteur. La liste part donc VIDE ; « Appliquer » reste
 * désactivé (plus bas) jusqu'au premier choix explicite.
 */
export function TargetSectorChoiceDialog({ sectors, onConfirm, onCancel }: Props) {
  const { t, i18n } = useTranslation('discover')
  const [chosen, setChosen] = useState<string[]>([])

  const toggle = (code: string) =>
    setChosen(current =>
      current.includes(code)
        ? current.filter(value => value !== code)
        : current.length < MAX_SEARCH_SECTORS
          ? [...current, code]
          : current,
    )

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onCancel())}>
      <DialogContent closeLabel={t('targetChoice.close')}>
        <DialogHeader>
          <DialogTitle>{t('targetChoice.title', { count: sectors.length, max: MAX_SEARCH_SECTORS })}</DialogTitle>
          <DialogDescription>{t('targetChoice.description', { max: MAX_SEARCH_SECTORS })}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('targetChoice.groupLabel')}>
          {sectors.map(code => (
            <ToggleChip key={code} active={chosen.includes(code)} onClick={() => toggle(code)}>
              {applicationSectorLabel(code, i18n.language)}
            </ToggleChip>
          ))}
        </div>
        <p data-testid="target-choice-counter" className="text-xs tabular-nums text-[var(--bellum-text-muted)]">
          {t('rail.sectorCapCounter', { count: chosen.length, max: MAX_SEARCH_SECTORS })}
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('targetChoice.cancel')}
          </Button>
          <Button type="button" variant="black" disabled={chosen.length === 0} onClick={() => onConfirm(chosen)}>
            {t('targetChoice.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
