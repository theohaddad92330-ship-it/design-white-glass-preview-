import * as ProgressPrimitive from '@radix-ui/react-progress'
import { cn } from '../lib/utils'

type ProgressVariant = 'default' | 'success' | 'warning' | 'danger'
type ProgressSize = 'sm' | 'md' | 'lg'

const trackStyles: Record<ProgressVariant, string> = {
  default: 'bg-[color-mix(in_srgb,var(--bellum-primary-500)_15%,transparent)]',
  success: 'bg-[color-mix(in_srgb,var(--bellum-success)_15%,transparent)]',
  warning: 'bg-[color-mix(in_srgb,var(--bellum-warning)_15%,transparent)]',
  danger: 'bg-[color-mix(in_srgb,var(--bellum-danger)_15%,transparent)]',
}

const indicatorStyles: Record<ProgressVariant, string> = {
  default: 'bg-[var(--bellum-primary-500)]',
  success: 'bg-[var(--bellum-success)]',
  warning: 'bg-[var(--bellum-warning)]',
  danger: 'bg-[var(--bellum-danger)]',
}

const sizeStyles: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

export type ProgressProps = {
  value?: number
  variant?: ProgressVariant
  size?: ProgressSize
  neutralTrack?: boolean
  className?: string
}

function Progress({ value, variant = 'default', size = 'md', neutralTrack = false, className }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        'relative w-full overflow-hidden rounded-full',
        neutralTrack ? 'bg-muted' : trackStyles[variant],
        sizeStyles[size],
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-full flex-1 rounded-full transition-transform duration-500 ease-out',
          indicatorStyles[variant],
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
