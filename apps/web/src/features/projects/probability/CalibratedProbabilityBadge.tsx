import { calibratedProbabilitySchema, type CalibratedProbability } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

const percent = (value: number): number => Math.round(value * 100)

/**
 * #4016.1b — la probabilité calibrée sur une CARTE du pipe : le chiffre et son
 * intervalle, sur une ligne. Elle PARSE l'enveloppe (jamais un chiffre nu) et ne
 * rend RIEN quand rien n'est mesuré : dans une liste, une absence ne fait aucune
 * ligne — le « non mesuré » nommé, les axes et la méthode vivent dans le dossier
 * de l'affaire (`CalibratedProbabilityView`).
 */
export function CalibratedProbabilityBadge({ probability }: { probability: CalibratedProbability }) {
  const { t } = useTranslation('projects')
  if (!calibratedProbabilitySchema.safeParse(probability).success) return null
  if (probability.value === null || probability.interval === null) return null
  return (
    <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]" data-probability-badge>
      {t('probability.percent', { value: percent(probability.value) })}{' '}
      {t('probability.interval', { low: percent(probability.interval.low), high: percent(probability.interval.high) })}
    </Text>
  )
}
