import { computeSparkBars } from './Sparkline.logic'
import type { SparkPoint } from './Sparkline.logic'
import styles from './Sparkline.module.css'

/**
 * #1642 — Sparkline : barres verticales fines. Un point non mesuré est un
 * trou visible (repère en pointillés), jamais une barre à 0 inventée.
 */
export function Sparkline({ points, label }: { points: readonly SparkPoint[]; label?: string }) {
  const bars = computeSparkBars(points)
  return (
    <div className={styles['spark'] ?? ''} role="img" aria-label={label ?? 'Tendance'}>
      {bars.map((bar, i) => (
        <span
          key={i}
          className={`${styles['bar'] ?? ''} ${bar.missing ? (styles['missing'] ?? '') : ''}`}
          style={bar.missing ? undefined : { height: `${bar.heightPct}%` }}
        />
      ))}
    </div>
  )
}
