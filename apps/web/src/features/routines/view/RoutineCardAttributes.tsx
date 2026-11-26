import { routineRiskOf, type RoutineDefinition } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #2843.24 (#2399.3) — LES ATTRIBUTS DE LA FICHE qui manquaient à l'écran : le
 * RISQUE 0-4 (dérivé de ce que la routine laisse, `routineRiskOf`), les rôles à qui
 * elle parle, son déroulé dans l'ordre, ce qu'elle laisse derrière elle. Mêmes deux
 * montages que les réglages (fiche `/settings/routines/:key`, fenêtre « Voir le
 * fonctionnement » ouverte depuis /actions/automatisations) — un seul composant (GA-26).
 *
 * Le COÛT n'y figure pas, à dessein : le budget de la fiche ne se lit qu'au
 * back-office (c132_credits_implicites, #2843.19/.21).
 */
export function RoutineCardAttributes({
  definition,
}: {
  definition: Pick<RoutineDefinition, 'roles' | 'steps' | 'preparedActions'>
}) {
  const { t, i18n } = useTranslation('routines')
  const list = new Intl.ListFormat(i18n.language.startsWith('en') ? 'en' : 'fr', { type: 'unit' })
  const risk = routineRiskOf(definition)

  return (
    <Box className="flex flex-col gap-1">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.risk', { level: risk, meaning: t(`risk.${risk}`) })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.roles', { roles: list.format(definition.roles.map(role => t(`role.${role}`))) })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.steps', { steps: definition.steps.map(step => t(`step.${step}`)).join(' → ') })}
      </Text>
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('field.preparedActions', {
          actions: list.format(definition.preparedActions.map(action => t(`preparedAction.${action}`))),
        })}
      </Text>
    </Box>
  )
}
