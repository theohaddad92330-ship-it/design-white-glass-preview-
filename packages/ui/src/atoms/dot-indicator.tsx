import { cn } from '../lib/utils'
import type { ComponentSize, SemanticVariant } from './variants'

const sizeStyles: Record<ComponentSize, string> = {
  sm: 'size-1.5',
  md: 'size-2',
  lg: 'size-2.5',
}

const colorStyles: Record<SemanticVariant, string> = {
  default: 'bg-[var(--bellum-text-muted)]',
  info: 'bg-[var(--bellum-info)]',
  success: 'bg-[var(--bellum-success)]',
  warning: 'bg-[var(--bellum-warning)]',
  danger: 'bg-[var(--bellum-danger)]',
}

export type DotIndicatorProps = {
  variant?: SemanticVariant
  size?: ComponentSize
  pulse?: boolean
  className?: string
}

export function DotIndicator({ variant = 'default', size = 'md', pulse = false, className }: DotIndicatorProps) {
  return (
    <span
      className={cn(
        'inline-block rounded-full shrink-0',
        colorStyles[variant],
        sizeStyles[size],
        pulse && 'animate-pulse',
        className,
      )}
    />
  )
}
