import { useTranslation } from 'react-i18next'
import type { UnifiedFilters } from '@/features/discover/lib/discover-filters'
import { summarizeFilters, type SummaryLine } from '@/features/discover/lib/discover-filters-summary'
import { REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'

/**
 * #4301.3 — en tête de « Tous les filtres » : ce que la recherche RETIENT et ce qu'elle ÉCARTE, dit en
 * mots avant les champs. Lit les mêmes filtres que le rail (`summarizeFilters`) — jamais un second état.
 * Une ligne absente n'est pas affichée « vide » : un critère non posé ne fait aucune ligne.
 */
export function FilterSummary({ filters }: { filters: UnifiedFilters }) {
  const { t, i18n } = useTranslation('discover')
  const { kept, dropped } = summarizeFilters(filters)

  const valueLabel = (line: SummaryLine, value: string): string => {
    if (line.key === 'zones') return REGISTRY_REGIONS.find(region => region.code === value)?.label ?? value
    if (line.key === 'sectors' || line.key === 'excludedSectors') return applicationSectorLabel(value, i18n.language)
    if (line.key === 'size') return t(`rail.sizeBand.${value.toLowerCase()}`)
    if (line.key === 'intermediaries') return t('rail.summary.esn')
    return value
  }

  const renderLines = (lines: SummaryLine[]) =>
    lines.map(line => (
      <li key={line.key}>
        <span className="font-semibold">{t(`rail.summary.line.${line.key}`)}</span>
        {line.values.length > 0 && <> : {line.values.map(value => valueLabel(line, value)).join(', ')}</>}
      </li>
    ))

  return (
    <section
      data-testid="filter-summary"
      aria-label={t('rail.summary.title')}
      className="mb-5 flex flex-col gap-2 rounded-md p-3 text-sm"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-primary)',
      }}
    >
      <h3 className="text-sm font-semibold">{t('rail.summary.title')}</h3>
      {kept.length === 0 && dropped.length === 0 && (
        <p style={{ color: 'var(--text-secondary)' }}>{t('rail.summary.empty')}</p>
      )}
      {kept.length > 0 && (
        <div data-testid="filter-summary-kept">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--accent-soft-text)' }}>
            {t('rail.summary.kept')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{renderLines(kept)}</ul>
        </div>
      )}
      {dropped.length > 0 && (
        <div data-testid="filter-summary-dropped">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--danger-soft-text)' }}>
            {t('rail.summary.dropped')}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{renderLines(dropped)}</ul>
        </div>
      )}
    </section>
  )
}
