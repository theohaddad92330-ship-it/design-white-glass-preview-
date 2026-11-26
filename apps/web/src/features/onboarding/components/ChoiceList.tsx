import type { ReactNode } from 'react'
import { cn } from '@bellum/ui'

/**
 * Bordered container that groups `ChoiceRow`s into a single list with hairline
 * dividers between rows (Orus-style), so options read as one cohesive surface
 * rather than a stack of separate cards.
 */
export function ChoiceList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-[var(--bellum-border)] divide-y divide-[var(--bellum-border)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
