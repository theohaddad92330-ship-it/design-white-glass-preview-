import { computeSegments } from './SegmentBar.logic'
import type { Segment } from './SegmentBar.logic'
import styles from './SegmentBar.module.css'

/** Cycle de tokens par défaut — jamais un littéral hexadécimal (#1642). */
const DEFAULT_COLORS = ['var(--accent)', 'var(--blue)', 'var(--green)', 'var(--amber)', 'var(--red)']

/**
 * #1642 — SegmentBar : barre segmentée avec légende. Un total nul ou négatif
 * n'affiche pas une barre remplie à 0 : la barre disparaît au profit d'une
 * mention explicite (doctrine : non mesuré n'est jamais 0).
 */
export function SegmentBar({
  segments,
  format = v => String(v),
}: {
  segments: readonly Segment[]
  format?: (v: number) => string
}) {
  const { slices, total } = computeSegments(segments)

  if (total == null) {
    return <p className={styles['unmeasured'] ?? ''}>Non mesuré</p>
  }

  return (
    <div>
      <div className={styles['bar'] ?? ''}>
        {slices.map((s, i) => (
          <span
            key={s.label}
            className={styles['slice'] ?? ''}
            style={{ width: `${s.pct}%`, background: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
          />
        ))}
      </div>
      <div className={styles['legend'] ?? ''}>
        {slices.map((s, i) => (
          <span key={s.label}>
            <span
              className={styles['swatch'] ?? ''}
              style={{ background: s.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
            />
            {s.label} · {format(s.value)}
          </span>
        ))}
      </div>
    </div>
  )
}
