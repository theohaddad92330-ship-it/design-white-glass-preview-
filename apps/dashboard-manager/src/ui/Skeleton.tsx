import styles from './Skeleton.module.css'

/** #1642 — Skeleton : pour tout chargement. `width`/`height` en px, comme le reste du manager. */
export function Skeleton({ width = '100%', height = 14 }: { width?: number | string; height?: number | string }) {
  return (
    <span
      className={styles['skeleton'] ?? ''}
      style={{ width, height }}
      role="status"
      aria-label="Chargement en cours"
    />
  )
}
