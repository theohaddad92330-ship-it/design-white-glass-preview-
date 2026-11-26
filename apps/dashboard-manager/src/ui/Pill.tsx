'use client'

import type { ReactNode } from 'react'
import styles from './Pill.module.css'

/**
 * #1642 — Pill : filtre cliquable, état actif. Ce qui se clique se tabule
 * (GA-35) : un vrai `<button type="button">`, jamais un `<div onClick>`.
 * `aria-pressed` porte l'état actif pour un lecteur d'écran.
 */
export function Pill({
  active = false,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={`${styles['pill'] ?? ''} ${active ? (styles['active'] ?? '') : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
