import { Box, Text } from '@bellum/ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { MeasuredValue, UnknownValue } from '@/components/primitives/UnknownValue'
import { useProspectingSessionMetrics } from '@/features/prospecting-session/api'

/**
 * #2386.9 — LA TÉLÉMÉTRIE DE LA SESSION DE PROSPECTION, PAR PARCOURS.
 *
 * Même patron que `DeliverabilityBlock` juste à côté : un parcours qui n'a
 * pas encore assez de sessions (ou qui n'a encore aucun fait mesuré — aucun
 * message envoyé, aucune tentative connecteur) rend `null`, et `null` se lit
 * « non mesuré », jamais 0 (`MeasuredValue`/`UnknownValue`, GA-18/GA-19).
 * Aucune ligne n'affiche de PERSONNE : `journey` est la seule clé
 * (`aggregateProspectingSessionMetrics`, GA-240/241/264/266/267) — un parcours
 * sans session ne rend AUCUNE ligne, jamais une ligne à zéro inventée.
 */
export function ProspectingSessionMetricsBlock() {
  const { t } = useTranslation('outreach')
  const { data } = useProspectingSessionMetrics()
  const metrics = data?.metrics ?? []

  if (metrics.length === 0) return null

  return (
    <Box className="rounded-lg border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="medium">
        {t('prospectingMetrics.title')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="mt-0.5 block">
        {t('prospectingMetrics.subtitle')}
      </Text>

      <div className="mt-3 space-y-3">
        {metrics.map(metric => (
          <div key={metric.journey} className="border-t border-[var(--bellum-border)] pt-3 first:border-t-0 first:pt-0">
            <Text size="sm" weight="medium" className="block">
              {t(`prospectingSession.mode.${metric.journey}`, { ns: 'discover', defaultValue: metric.journey })}
            </Text>
            <div className="mt-1.5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t('prospectingMetrics.timeToFirstMessage')}>
                <MeasuredValue
                  value={metric.timeToFirstMessageSeconds}
                  reason={t('prospectingMetrics.notMeasured')}
                  format={v => t('prospectingMetrics.seconds', { count: Math.round(Number(v)) })}
                />
              </Stat>
              <Stat label={t('prospectingMetrics.modifiedMessageRate')}>
                <MeasuredValue
                  value={metric.modifiedMessageRate}
                  reason={t('prospectingMetrics.notMeasured')}
                  format={v => `${(Number(v) * 100).toFixed(0)}%`}
                />
              </Stat>
              <Stat label={t('prospectingMetrics.connectorSuccessRate')}>
                <MeasuredValue
                  value={metric.connectorSuccessRate}
                  reason={t('prospectingMetrics.notMeasured')}
                  format={v => `${(Number(v) * 100).toFixed(0)}%`}
                />
              </Stat>
              <Stat label={t('prospectingMetrics.duplicatesAvoided')}>{metric.duplicatesAvoided}</Stat>
            </div>
          </div>
        ))}
      </div>
    </Box>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" color="text-[var(--bellum-text-muted)]" className="block">
        {label}
      </Text>
      <Text size="sm" weight="medium">
        {children}
      </Text>
    </div>
  )
}
