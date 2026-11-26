import type { ReactNode } from 'react'
import styles from './CardHeader.module.css'

/** #1642 — CardHeader : titre + action optionnelle à droite. */
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className={styles['header'] ?? ''}>
      <div className={styles['title'] ?? ''}>{title}</div>
      {action ? <div>{action}</div> : null}
    </div>
  )
}
