import styles from './Stat.module.css'

/** #1642 — Stat : label + valeur, pour les grilles denses. */
export function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className={styles['stat'] ?? ''}>
      <div className={styles['label'] ?? ''}>{label}</div>
      <div className={styles['value'] ?? ''}>{value == null ? '—' : value}</div>
    </div>
  )
}
