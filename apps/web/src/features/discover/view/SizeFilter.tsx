import { useTranslation } from 'react-i18next'
import type { HeadcountRange } from '@/features/discover/lib/discover-types'
import { SIZE_BANDS, type SizeBand } from '@/features/discover/lib/discover-size-bounds'
import { ToggleChip } from './filter-controls'

/**
 * #4362.2 — UN SEUL filtre de taille (définition BellumAI : TPE < 10 · PME 10-249 · ETI 250-999 · GC ≥ 1 000).
 * Il écrit dans `headcount`, jamais dans une seconde catégorie : « Taille d'entreprise » et « Tranche
 * d'effectif » ne peuvent plus se contredire. La tranche fine n'est que l'AFFINAGE de la PME (10-49, 50-249),
 * montré quand la PME est posée.
 */
export function SizeFilter({
  headcount,
  onChange,
}: {
  headcount: readonly HeadcountRange[]
  onChange: (next: HeadcountRange[]) => void
}) {
  const { t } = useTranslation('discover')
  const bandActive = (band: SizeBand) => band.ranges.some(range => headcount.includes(range))

  const toggleBand = (band: SizeBand) => {
    if (bandActive(band))
      return onChange(headcount.filter(range => !(band.ranges as readonly HeadcountRange[]).includes(range)))
    onChange([...headcount, ...band.ranges.filter(range => !headcount.includes(range))])
  }
  const toggleRange = (range: HeadcountRange) =>
    onChange(headcount.includes(range) ? headcount.filter(r => r !== range) : [...headcount, range])

  const refinable = SIZE_BANDS.filter(band => band.ranges.length > 1 && bandActive(band))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {SIZE_BANDS.map(band => (
          <ToggleChip
            key={band.code}
            title={t(`rail.sizeBandBounds.${band.code.toLowerCase()}`)}
            active={bandActive(band)}
            onClick={() => toggleBand(band)}
          >
            {t(`rail.sizeBand.${band.code.toLowerCase()}`)}
          </ToggleChip>
        ))}
      </div>
      {refinable.map(band => (
        <div
          key={band.code}
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={t('rail.sizeRefineLabel')}
        >
          {band.ranges.map(range => (
            <ToggleChip key={range} active={headcount.includes(range)} onClick={() => toggleRange(range)}>
              {t(`headcount.${range}`)}
            </ToggleChip>
          ))}
        </div>
      ))}
    </div>
  )
}
