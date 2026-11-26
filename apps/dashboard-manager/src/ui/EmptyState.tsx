'use client'

import styles from './EmptyState.module.css'

/**
 * #1642 — EmptyState : icône, phrase, action. L'action, quand elle existe,
 * est typiquement le SEUL bouton primaire de l'écran vide : elle porte donc
 * `--action` plutôt que l'accent général (règle « un seul --action par
 * écran » de #1642).
 */
export function EmptyState({
  icon = '·',
  message,
  action,
}: {
  icon?: string
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className={styles['empty'] ?? ''}>
      <span className={styles['icon'] ?? ''} aria-hidden="true">
        {icon}
      </span>
      <p className={styles['message'] ?? ''}>{message}</p>
      {action ? (
        <button type="button" className={styles['action'] ?? ''} onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
