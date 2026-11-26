import type { StaffingOverview } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { useMissingExpertise } from '@/features/consultants/hooks'

/**
 * Théo D pilotage › Staffing — la bande de quatre chiffres (`stat-strip`) en tête de la section,
 * notre `#staffing-faits` (PIL-I11) : intercontrat · fins de mission à 30, 60, 90 jours · TACE
 * du mois · expertises manquantes. Chaque chiffre est relu dans la MÊME lecture que les blocs
 * dessous (`/pilotage/staffing`, `missing-expertise`), jamais recalculé ailleurs. Le TACE dont le
 * réalisé n'est pas mesuré dit « Non mesuré », jamais « 0 % » ; une lecture absente ne fait pas
 * de tuile.
 */
export function StaffingFacts({ overview }: { overview: StaffingOverview }) {
  const { t } = useTranslation('pilotage')
  const missing = useMissingExpertise()
  const current = overview.tace.periods[0]
  const tace = current?.global.actual.percent ?? null
  const endings = overview.endings

  const tiles = [
    {
      key: 'bench',
      label: t('staffing.facts.bench'),
      value: String(overview.bench.consultants.length),
      meta: t('staffing.facts.benchMeta'),
    },
    {
      key: 'endings',
      label: t('staffing.facts.endings'),
      value: [endings.within30, endings.within60, endings.within90].map(list => list.length).join(' · '),
      meta: t('staffing.facts.endingsMeta'),
    },
    {
      key: 'tace',
      label: t('staffing.facts.tace'),
      value: tace === null ? t('objective.notMeasured') : `${Math.round(tace)} %`,
      meta: t('staffing.facts.taceMeta'),
    },
    ...(missing.isSuccess
      ? [
          {
            key: 'missing',
            label: t('staffing.facts.missing'),
            value: String(missing.data.items.length),
            meta: t('staffing.facts.missingMeta'),
          },
        ]
      : []),
  ]

  return (
    <section aria-label={t('staffing.facts.region')} data-testid="staffing-facts">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-border)] lg:grid-cols-4">
        {tiles.map(tile => (
          <div key={tile.key} data-fact={tile.key} className="bg-[var(--bellum-surface-1)] px-5 py-4">
            <dt className="text-sm text-[var(--bellum-text-secondary)]">{tile.label}</dt>
            <dd className="mt-2 text-2xl font-semibold leading-none tabular-nums text-[var(--bellum-text-primary)] md:text-3xl">
              {tile.value}
            </dd>
            <dd className="mt-2 text-xs text-[var(--bellum-text-muted)]">{tile.meta}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
