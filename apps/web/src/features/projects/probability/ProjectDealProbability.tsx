import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { CalibratedProbabilityView } from './CalibratedProbabilityView'
import { useDealProbability } from './useDealProbability'

/**
 * #4016.1b — la probabilité de l'affaire dans SON dossier, en entier : chiffre,
 * intervalle, méthode, axes et axes non évaluables nommés. Une affaire hors du
 * trimestre (ou close) n'a pas de ligne : on n'affiche pas ce qu'on n'a pas.
 */
export function ProjectDealProbability({ opportunityId }: { opportunityId: string }) {
  const { t } = useTranslation('projects')
  const probabilityOf = useDealProbability()
  const probability = probabilityOf(opportunityId)
  if (!probability) return null
  return (
    <Box className="space-y-1" data-testid="project-deal-probability">
      <Text element="p" size="xs" color="text-muted-foreground">
        {t('probability.dossierTitle')}
      </Text>
      <CalibratedProbabilityView probability={probability} />
    </Box>
  )
}
