import { ENRICHED_MIN_AXES } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useTalentStats } from '@/features/consultants/hooks'
import { formatTimeAgo } from '@/lib/relative-time'

/**
 * #4349 V.1 — décision Louis 19/10 : « % profils enrichis » et « Mis à jour » quittent le Vivier et
 * vivent ICI, Réglages › Mes données (bloc qualité des fiches consultants). Un indicateur, un seul
 * endroit (GA-26) : le bandeau du Vivier ne les porte plus.
 *
 * Même source (`useTalentStats`), mêmes frontières : sans talent à mesurer, « non mesuré » — jamais « 0 % ».
 */
export function TalentQualityBlock() {
  const { t } = useTranslation('consultants')
  const { t: tc } = useTranslation('common')
  const { data: stats, isLoading } = useTalentStats()
  if (isLoading || !stats) return null

  const notMeasured = t('stats.notMeasuredShort')
  const rows = [
    {
      label: t('stats.enrichedPercent'),
      value: stats.enrichedPercent === null ? notMeasured : t('stats.percent', { value: stats.enrichedPercent }),
      // KEVIN-FIX K.2 — le seuil se DIT (« 3 axes sur 5 ») ; une seule définition, `ENRICHED_MIN_AXES`.
      reason:
        stats.enrichedPercent === null
          ? `${tc('unknownValue')} — ${t('stats.noTalentToMeasure')}`
          : t('stats.enrichedThreshold', { min: ENRICHED_MIN_AXES }),
    },
    {
      label: t('stats.lastUpdated'),
      value: stats.lastUpdatedAt === null ? notMeasured : formatTimeAgo(stats.lastUpdatedAt),
      reason: stats.lastUpdatedAt === null ? `${tc('unknownValue')} — ${t('stats.noTalentToMeasure')}` : null,
    },
  ]

  return (
    <Card className="mb-5 border-[var(--bellum-border)] p-4">
      <Text element="h2" size="lg" weight="semibold" color="text-[var(--bellum-text-primary)]">
        {t('qualityBlock.title')}
      </Text>
      <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t('qualityBlock.subtitle')}
      </Text>
      <Box className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {rows.map(row => (
          <Box key={row.label}>
            <Text size="xs" color="text-muted-foreground">
              {row.label}
            </Text>
            <Text size="lg" weight="semibold" className="block">
              {row.value}
            </Text>
            {row.reason ? (
              <Text size="xs" color="text-muted-foreground">
                {row.reason}
              </Text>
            ) : null}
          </Box>
        ))}
      </Box>
      <Link
        to="/consultants"
        className="mt-3 inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline"
      >
        {t('qualityBlock.link')}
      </Link>
    </Card>
  )
}
