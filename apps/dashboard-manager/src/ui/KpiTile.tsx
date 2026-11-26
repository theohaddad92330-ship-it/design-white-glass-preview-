import { NON_MESURE } from '@/lib/mesure'
import { Delta } from './Delta'
import styles from './KpiTile.module.css'

/**
 * #1642 — KpiTile : « label · valeur · delta (+8,2% vert / -4,3% rouge) ·
 * période ». `value` absent (`null`, `undefined`, NaN) rend « non mesuré » (#4595.3),
 * avec `unmeasuredReason` quand on la sait — jamais un 0 inventé. Une vraie
 * mesure à 0 reste « 0 ».
 */
export function KpiTile({
  label,
  value,
  unmeasuredReason,
  delta,
  period,
}: {
  label: string
  value: string | number | null | undefined
  /** #4595.3 — pourquoi la mesure manque (arrêtée, non branchée…), dite sous « non mesuré ». */
  unmeasuredReason?: string
  /** Omis = pas de ligne de delta du tout. `null` = mesuré comme non disponible. */
  delta?: number | null
  period?: string
}) {
  const unmeasured = value == null || (typeof value === 'number' && !Number.isFinite(value))
  const hasFooter = delta !== undefined || Boolean(period)
  return (
    <div className={styles['tile'] ?? ''}>
      <div className={styles['label'] ?? ''}>{label}</div>
      {unmeasured ? (
        <>
          <div className={styles['value'] ?? ''}>{NON_MESURE}</div>
          {unmeasuredReason ? <div className={styles['period'] ?? ''}>{unmeasuredReason}</div> : null}
        </>
      ) : (
        <div className={styles['value'] ?? ''}>{value}</div>
      )}
      {hasFooter ? (
        <div className={styles['footer'] ?? ''}>
          {delta !== undefined ? <Delta value={delta} /> : null}
          {period ? <span className={styles['period'] ?? ''}>{period}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
