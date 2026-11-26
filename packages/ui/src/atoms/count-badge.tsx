import { cn } from '../lib/utils'
import { Text } from './text'
import { semanticColors, type ComponentSize, type SemanticVariant } from './variants'
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip'

const sizeStyles: Record<ComponentSize, string> = {
  sm: 'min-w-4 h-4 text-xs px-1',
  md: 'min-w-5 h-5 text-xs px-1.5',
  lg: 'min-w-6 h-6 text-sm px-2',
}

export type CountBadgeProps = {
  count: number
  max?: number
  variant?: SemanticVariant
  size?: ComponentSize
  /** `pill` (défaut) — badge rond façon notification.
   *  `square` — coins arrondis légers, façon Linear (badge à côté d'un titre de page). */
  shape?: 'pill' | 'square'
  tooltip?: string
  className?: string
}

/**
 * CountBadge — numeric badge for notifications, unread counts, or page-title counters.
 */
export function CountBadge({
  count,
  max = 99,
  variant = 'danger',
  size = 'md',
  shape = 'pill',
  tooltip,
  className,
}: CountBadgeProps) {
  const colors = semanticColors[variant]
  const display = count > max ? `${max}+` : count

  const badge = (
    <span
      className={cn(
        'inline-flex items-center justify-center font-medium tabular-nums',
        shape === 'pill' ? 'rounded-full' : 'rounded-md',
        colors.bg,
        colors.text,
        sizeStyles[size],
        tooltip && 'cursor-help',
        className,
      )}
    >
      {display}
    </span>
  )

  if (tooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <Text size="xs" element="span">
            {tooltip}
          </Text>
        </TooltipContent>
      </Tooltip>
    )
  }

  return badge
}
