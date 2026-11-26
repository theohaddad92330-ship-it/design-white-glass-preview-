import { Box, Button, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { PlanFeatureKey } from '@bellum/contracts'
import { useUpgradeTarget } from './useUpgradeTarget'

type UpgradeBenefitsProps = {
  feature: PlanFeatureKey
  /** Rendu resserré (carte, menu) : même contenu, moins d'air. */
  dense?: boolean
}

/**
 * Ce que le passage à l'offre du dessus apporte — le bloc partagé par TOUTES les
 * surfaces verrouillées (écran complet, carte grisée, fenêtre d'upsell).
 *
 * Le principe : partout où quelque chose est grisé, on ne dit pas seulement
 * « pas inclus ». On nomme le palier, son prix, et on liste les fonctions qu'il
 * débloque avec ce qu'elles font. Un seul composant, donc un seul endroit où
 * cette promesse est écrite — trois variantes divergentes finiraient par vendre
 * trois choses différentes.
 *
 * Tout vient du catalogue live : une fonction déplacée d'un palier à l'autre
 * dans le backoffice change ce bloc sans qu'une ligne change ici.
 */
export function UpgradeBenefits({ feature, dense = false }: UpgradeBenefitsProps) {
  const { t } = useTranslation('common')
  const upgrade = useUpgradeTarget(feature)

  return (
    <Box className="w-full space-y-3">
      {upgrade.alsoUnlocks.length > 0 && (
        <Box
          className={`rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-left ${
            dense ? 'p-3' : 'p-4'
          }`}
        >
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {upgrade.priceEuros != null
              ? t('planFeatures.locked.unlocksWithPrice', { plan: upgrade.planName, price: upgrade.priceEuros })
              : t('planFeatures.locked.unlocks', { plan: upgrade.planName })}
          </Text>
          <ul className="mt-2 space-y-1.5">
            {upgrade.alsoUnlocks.map(key => (
              <li key={key} className="flex items-start gap-2">
                <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--success-soft-text)]" />
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" element="span">
                  <span className="font-medium text-[var(--bellum-text-primary)]">
                    {t(`planFeatures.short.${key}`)}
                  </span>{' '}
                  — {t(`planFeatures.pitches.${key}`)}
                </Text>
              </li>
            ))}
          </ul>
        </Box>
      )}

      <Button asChild size="sm" fullWidth={dense}>
        {/* Le libellé nomme le palier quand on le connaît : « Passer à Team »
            engage plus que « Voir les offres », et dit où l'on va. */}
        <Link to="/billing">
          {upgrade.planName
            ? t('planFeatures.locked.upgradeCta', { plan: upgrade.planName })
            : t('planFeatures.locked.cta')}
        </Link>
      </Button>
    </Box>
  )
}
