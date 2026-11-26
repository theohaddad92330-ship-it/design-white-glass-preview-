import { cn } from '../lib/utils'

type SpacerSize = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16 | 20 | 24

type SpacerProps = {
  /** Size in Tailwind spacing units (1 = 4px, 4 = 16px, 8 = 32px, …) */
  size?: SpacerSize
  /** vertical (default) adds height; horizontal adds width */
  direction?: 'vertical' | 'horizontal'
  className?: string
}

/**
 * Spacer — adds consistent whitespace between elements.
 * Prefer `gap` on flex/grid containers when possible; use Spacer for one-offs.
 */
export function Spacer({ size = 4, direction = 'vertical', className }: SpacerProps) {
  const isVertical = direction === 'vertical'
  return (
    <div
      aria-hidden="true"
      className={cn(isVertical ? `h-${size}` : `w-${size}`, isVertical ? 'w-full' : 'h-full', 'shrink-0', className)}
    />
  )
}

export type { SpacerProps, SpacerSize }
