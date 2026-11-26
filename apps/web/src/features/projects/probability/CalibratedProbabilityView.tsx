import { DEFAULT_STAGE_LABELS, calibratedProbabilitySchema, type CalibratedProbability } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'

const percent = (value: number): number => Math.round(value * 100)

/**
 * #4016 L1 (décision Louis 11/10/2026, renversement daté de `c26_probabilite`) —
 * LA SEULE façon d'afficher une probabilité dans le produit.
 *
 * Elle rend le chiffre, son INTERVALLE, sa MÉTHODE, ses AXES et — nommés — ceux
 * qui n'ont pas pu être évalués. Elle PARSE ce qu'on lui donne : une probabilité
 * nue (sans axes, sans intervalle, sans méthode) ne s'affiche pas, elle rend
 * `null`. « Non mesuré » s'écrit, jamais « 0 % ».
 */
export function CalibratedProbabilityView({ probability }: { probability: CalibratedProbability }) {
  const { t, i18n } = useTranslation('projects')
  if (!calibratedProbabilitySchema.safeParse(probability).success) return null
  const language = i18n.language === 'en' ? 'en' : 'fr'
  const evaluable = probability.axes.filter(axis => axis.evaluable)
  const unevaluable = probability.axes.filter(axis => !axis.evaluable)

  return (
    <Box className="flex min-w-0 flex-col gap-1">
      {probability.value === null || probability.interval === null ? (
        <UnknownValue
          reason={t(`probability.notMeasured.${probability.not_measured_reason ?? 'insufficient_history'}`)}
        />
      ) : (
        <Box display="flex" className="flex-wrap items-baseline gap-2">
          <Text element="span" size="lg" weight="semibold">
            {t('probability.percent', { value: percent(probability.value) })}
          </Text>
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('probability.interval', {
              low: percent(probability.interval.low),
              high: percent(probability.interval.high),
            })}
          </Text>
        </Box>
      )}
      <ul className="flex flex-col gap-0.5">
        {evaluable.map(axis => (
          <li key={axis.key}>
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {axis.key === 'stage'
                ? t('probability.axes.stage', {
                    stage:
                      DEFAULT_STAGE_LABELS[axis.reason as keyof typeof DEFAULT_STAGE_LABELS]?.[language] ?? axis.reason,
                  })
                : t(`probability.axes.${axis.key}`, {
                    // Un axe ÉVALUABLE porte toujours ses comptes (le schéma
                    // l'impose) ; aucun repli à zéro n'est écrit ici.
                    won: t('probability.won', { count: axis.won }),
                    lost: t('probability.lost', { count: axis.lost }),
                    dimension: t(`probability.dimension.${axis.reason}`),
                    weight: axis.weight === null ? null : percent(axis.weight),
                  })}
            </Text>
          </li>
        ))}
        {unevaluable.map(axis => (
          <li key={axis.key}>
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {t(`probability.unevaluable.${axis.key}`)}
            </Text>
          </li>
        ))}
      </ul>
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('probability.method')}
      </Text>
    </Box>
  )
}
