import { Card, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cardFade } from '../../motion'
import type { TrajectoryDestination } from './planViewData'

/**
 * #1611.6 — LE SECOND BLOC, AGRÉGÉ, DES TRAJECTOIRES.
 *
 * `ReverseProspectsSection` (juste au-dessus) nomme des personnes — le bloc
 * Apollo, une porte d'entrée chaude. Celui-ci est son OPPOSÉ : « Ce que Bellum
 * observe dans les trajectoires » — les destinations où plusieurs
 * ex-collaborateurs de ce compte sont allés, ZÉRO identité individuelle.
 *
 * `destinations` arrive déjà filtré au seuil `MARKET_MEMORY_MIN_PATHS`
 * (`aggregatedTrajectoryDestinations`, `planViewData.ts`) : ce composant ne
 * fait QUE rendre, il ne décide d'aucun seuil lui-même.
 */
export function AggregatedTrajectoriesSection({ destinations }: { destinations: TrajectoryDestination[] }) {
  const { t } = useTranslation('accountDetail')

  if (destinations.length === 0) return null

  return (
    <motion.div variants={cardFade} className="p-1 mt-4">
      <Card className="overflow-hidden p-0 [--card-spacing:0px]">
        <div className="border-b border-[var(--bellum-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-[var(--bellum-text-accent)]" />
            <Text element="h3" size="base" weight="semibold">
              {t('trajectoryDestinations.title')}
            </Text>
          </div>
          <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
            {t('trajectoryDestinations.subtitle')}
          </Text>
        </div>

        <ul className="divide-y divide-[var(--bellum-border)]">
          {destinations.map(destination => (
            <li key={destination.company} className="flex items-center justify-between gap-3 px-5 py-3">
              <Text size="sm" weight="semibold" className="break-words text-[var(--bellum-text-primary)]">
                {destination.company}
              </Text>
              <Text size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
                {t('trajectoryDestinations.persons', { count: destination.persons })}
              </Text>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  )
}
