import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { PlanFeatureKey } from '@bellum/contracts'
import { UpgradeBenefits } from './UpgradeBenefits'
import { useUpgradeTarget } from './useUpgradeTarget'

type PlanUpgradeDialogProps = {
  feature: PlanFeatureKey
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Ce qui s'ouvre quand on clique sur un bouton GRISÉ.
 *
 * Un contrôle grisé qui ne répond pas se lit comme une panne. Celui-ci répond :
 * il nomme la fonction, dit ce qu'elle fait, nomme le palier qui l'ouvre avec
 * son prix et liste tout ce que ce palier débloque. C'est le même contenu que
 * l'écran verrouillé pleine page — {@link UpgradeBenefits} — pour qu'un
 * commercial lise la même promesse quel que soit l'endroit où il a buté.
 */
export function PlanUpgradeDialog({ feature, open, onOpenChange }: PlanUpgradeDialogProps) {
  const { t } = useTranslation('common')
  const upgrade = useUpgradeTarget(feature)
  const name = t(`planFeatures.short.${feature}`)
  const availability = upgrade.planName
    ? t('planFeatures.locked.availableFrom', { plan: upgrade.planName })
    : t('planFeatures.locked.notIncluded')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-md">
        <DialogHeader>
          {/* `pr-8` : sans ça le titre passe SOUS la croix de fermeture. */}
          <DialogTitle className="pr-8">{name}</DialogTitle>
          <DialogDescription>
            {availability} — {t(`planFeatures.pitches.${feature}`)}
          </DialogDescription>
        </DialogHeader>
        <UpgradeBenefits feature={feature} dense />
      </DialogContent>
    </Dialog>
  )
}
