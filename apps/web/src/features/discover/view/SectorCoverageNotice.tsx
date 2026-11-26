import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import type { SectorCoverageReading } from '@/features/discover/lib/discover-sector-coverage'

/**
 * #4358.3 — un secteur sans donnée suffisante le DIT, sous la liste, au lieu d'une liste maigre muette.
 * Ton neutre (ce n'est pas une panne), comme `CoverageNotice`. Aucune lecture → rien.
 */
export function SectorCoverageNotice({ reading }: { reading: SectorCoverageReading | null }) {
  const { t } = useTranslation('discover')
  if (!reading) return null
  return (
    <div
      role="status"
      className="mt-4 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
    >
      <p className="flex items-start gap-1.5 text-xs leading-snug text-[var(--bellum-text-secondary)]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {reading.kind === 'thin'
          ? t('sectorCoverage.thin', { count: reading.count })
          : t('sectorCoverage.naf', { known: reading.known, total: reading.total })}
      </p>
    </div>
  )
}
