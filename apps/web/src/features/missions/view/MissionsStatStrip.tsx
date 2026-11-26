import { cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

type Stat = {
  key: 'endsSoon' | 'starting' | 'noEndDate'
  /** `null` = non mesuré : la tuile le dit, jamais « 0 ». */
  count: number | null
  pressed: boolean
  onToggle: () => void
}

/**
 * Théo C missions-planning (`.m5-stat`) — trois repères CLIQUABLES en tête de la liste : fins sous
 * 30 jours, démarrages prévus, fins non renseignées. Chacun resserre la liste et se retire au second
 * clic (`aria-pressed`). Un zéro mesuré s'écrit en mots (« Aucune ») ; un compte non mesuré se dit,
 * il ne devient jamais « 0 » (GA-18 / GA-19).
 */
export function MissionsStatStrip({ stats }: { stats: readonly Stat[] }) {
  const { t } = useTranslation('missions')
  return (
    <div data-theo-block="stats" data-testid="missions-stats" className="grid gap-2 sm:grid-cols-3">
      {stats.map(stat => (
        <button
          key={stat.key}
          type="button"
          aria-pressed={stat.pressed}
          onClick={stat.onToggle}
          className={cn(
            'flex min-h-11 flex-col items-start gap-0.5 rounded-card border bg-card px-4 py-3 text-left',
            'transition-colors duration-immediate ease-bellum-out hover:bg-[var(--bellum-surface-2)]',
            stat.pressed
              ? 'border-[var(--bellum-text-accent)] bg-[var(--accent-soft-bg)]'
              : 'border-[var(--bellum-border)]',
          )}
        >
          <span className="text-xs text-[var(--bellum-text-muted)]">{t(`stats.${stat.key}.label`)}</span>
          <strong className="text-2xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
            {stat.count === null
              ? t('stats.unmeasured')
              : stat.count === 0
                ? t(`stats.${stat.key}.none`)
                : String(stat.count).padStart(2, '0')}
          </strong>
          <span className="text-xs text-[var(--bellum-text-secondary)]">{t(`stats.${stat.key}.hint`)}</span>
        </button>
      ))}
    </div>
  )
}
