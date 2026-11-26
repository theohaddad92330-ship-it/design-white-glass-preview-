import type { ReactNode } from 'react'
import styles from './Card.module.css'

/** #1642 — Card : surface, radius 12, padding 20, bordure 1px. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `${styles['card'] ?? ''} ${className}` : (styles['card'] ?? '')}>{children}</div>
}
