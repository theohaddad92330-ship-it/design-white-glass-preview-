import { Box, cn } from '@bellum/ui'
import type { ReactNode } from 'react'

type DashboardCardProps = {
  children: ReactNode
  /** Hauteur 100% par défaut quand la carte vit dans une grille 2-cols. */
  fullHeight?: boolean
  className?: string
}

/**
 * Wrapper unifié des cartes du dashboard. Centralise la combinaison
 * `bg-[var(--bellum-surface-2)] + border-subtle + rounded-xl + p-5` qui était dupliquée
 * dans chaque section. Toucher au look des cartes du dashboard ne se fait
 * que ici.
 */
export function DashboardCard({ children, fullHeight, className }: DashboardCardProps) {
  return (
    <Box
      p={5}
      className={cn(
        'rounded-card bg-[var(--bellum-surface-1)] border border-[var(--bellum-border)]',
        fullHeight && 'h-full',
        className,
      )}
    >
      {children}
    </Box>
  )
}
