import { Box, Text } from '@bellum/ui'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PlanFeatureKey } from '@bellum/contracts'
import { UpgradeBenefits } from './UpgradeBenefits'
import { useUpgradeTarget } from './useUpgradeTarget'

type PlanFeatureLockedProps = {
  feature: PlanFeatureKey
  /** Rendu compact, à poser dans une carte plutôt qu'en pleine page. */
  compact?: boolean
}

/**
 * Ce qu'on affiche à la place d'une fonction que l'offre en cours n'ouvre pas.
 *
 * Quatre choses, délibérément : la fonction est NOMMÉE (« le Copilote IA »), ce
 * qu'elle fait est dit en une ligne, le palier qui l'ouvre est nommé AVEC son
 * prix, et tout ce que ce palier débloque en plus est listé. Un bouton grisé
 * sans explication se lit comme un bug ; « pas inclus dans votre offre » sans
 * suite laisse deviner laquelle prendre.
 *
 * Le bloc « ce que vous gagnez » + le bouton viennent de {@link UpgradeBenefits},
 * partagé avec la fenêtre qui s'ouvre au clic sur un contrôle grisé : une seule
 * promesse, écrite à un seul endroit.
 */
export function PlanFeatureLocked({ feature, compact = false }: PlanFeatureLockedProps) {
  const { t } = useTranslation('common')
  const upgrade = useUpgradeTarget(feature)
  // i18n keys: planFeatures.short.* / planFeatures.pitches.* (une clé par feature)
  //
  // Le titre est le NOM de la fonction, et la disponibilité est une phrase à
  // part. Une seule phrase à trou (« {{feature}} est inclus à partir de … »)
  // était condamnée à mal s'accorder en français : « l'API publique est inclus »,
  // « les Besoins est inclus ». Deux lignes, zéro accord à deviner.
  const name = t(`planFeatures.short.${feature}`)
  const pitch = t(`planFeatures.pitches.${feature}`)

  const availability = upgrade.planName
    ? t('planFeatures.locked.availableFrom', { plan: upgrade.planName })
    : t('planFeatures.locked.notIncluded')

  if (compact) {
    return (
      <Box
        role="status"
        rounded="lg"
        className="space-y-2 border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3 py-3"
      >
        <Box display="flex" className="min-w-0 items-center gap-2">
          <Lock className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            <span className="font-medium text-[var(--bellum-text-primary)]">{name}</span> — {availability}
          </Text>
        </Box>
        <UpgradeBenefits feature={feature} dense />
      </Box>
    )
  }

  return (
    <Box role="status" className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-16 text-center">
      <Box className="flex size-12 items-center justify-center rounded-full bg-[var(--bg-surface-hover)] text-[var(--text-muted)]">
        <Lock className="size-6" />
      </Box>
      <Box className="space-y-1">
        <Text element="h2" size="lg" weight="semibold" className="text-[color:var(--text-primary)]">
          {name}
        </Text>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-secondary)]">
          {availability}
        </Text>
        <Text size="sm" className="text-[var(--text-ghost)]">
          {pitch}
        </Text>
      </Box>

      <UpgradeBenefits feature={feature} />
    </Box>
  )
}
