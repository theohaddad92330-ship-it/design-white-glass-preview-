import { computeDelta } from './Delta.logic'
import styles from './Delta.module.css'

const TONE_CLASS: Record<string, string> = {
  up: styles['up'] ?? '',
  down: styles['down'] ?? '',
  flat: styles['flat'] ?? '',
  unknown: styles['unknown'] ?? '',
}

/**
 * #1642 — badge coloré, flèche, jamais de couleur seule : la flèche et le
 * texte portent le signe, la couleur ne fait que le renforcer (accessibilité,
 * daltonisme). `value` absent (null/undefined) rend « non mesuré », jamais un
 * delta à 0 % inventé.
 */
export function Delta({ value, decimals = 1 }: { value: number | null | undefined; decimals?: number }) {
  const { tone, formatted, arrow } = computeDelta(value, decimals)
  return (
    <span className={`${styles['delta'] ?? ''} ${TONE_CLASS[tone]}`}>
      {arrow ? <span aria-hidden="true">{arrow}</span> : null}
      {formatted}
    </span>
  )
}
