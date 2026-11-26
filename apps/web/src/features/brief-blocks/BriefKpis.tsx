import type { CommercialBrief } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { formatCount } from '@/lib/locale'

/**
 * Bandeau KPI. Une tuile sans valeur lisible ne s'affiche pas — jamais « 0 »
 * fabriqué (GA-18/19) ; aucune tuile lisible = aucun bandeau.
 */
export function BriefKpis({ kpis }: { kpis: CommercialBrief['kpis'] }) {
  const readable = kpis.filter(kpi => (typeof kpi.value === 'number' ? Number.isFinite(kpi.value) : true))
  if (readable.length === 0) return null
  return (
    <ul data-testid="brief-kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {readable.map(kpi => (
        <li
          key={kpi.label}
          className="min-w-0 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
        >
          <Text size="xl" weight="semibold">
            {typeof kpi.value === 'number' ? formatCount(kpi.value) : kpi.value}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {kpi.label}
          </Text>
          {kpi.caption ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {kpi.caption}
            </Text>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
