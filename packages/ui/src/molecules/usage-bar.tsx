import { memo } from 'react'
import { Box } from '../atoms/box'
import { Progress } from '../atoms/progress'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<
  ComponentSize,
  {
    padding: string
    progressSize: ComponentSize
    titleSize: 'xs' | 'sm' | 'base'
    countSize: 'sm' | 'base' | 'lg'
  }
> = {
  sm: { padding: 'p-3', progressSize: 'sm', titleSize: 'xs', countSize: 'sm' },
  md: { padding: 'p-4', progressSize: 'md', titleSize: 'sm', countSize: 'base' },
  lg: { padding: 'p-5', progressSize: 'lg', titleSize: 'base', countSize: 'lg' },
}

type UsageTheme = {
  bg: string
  border: string
  progressVariant: 'danger' | 'warning' | 'success'
  text: string
}

const getVariant = (ratio: number): UsageTheme => {
  if (ratio >= 0.9)
    return {
      bg: 'bg-[color-mix(in_srgb,var(--bellum-danger)_8%,transparent)]',
      border: 'border-[color-mix(in_srgb,var(--bellum-danger)_25%,transparent)]',
      progressVariant: 'danger',
      text: 'text-[var(--danger-soft-text)]',
    }
  if (ratio >= 0.7)
    return {
      bg: 'bg-[color-mix(in_srgb,var(--bellum-warning)_8%,transparent)]',
      border: 'border-[color-mix(in_srgb,var(--bellum-warning)_25%,transparent)]',
      progressVariant: 'warning',
      text: 'text-[var(--bellum-warning-text)]',
    }
  return {
    bg: 'bg-[color-mix(in_srgb,var(--bellum-success)_8%,transparent)]',
    border: 'border-[color-mix(in_srgb,var(--bellum-success)_25%,transparent)]',
    progressVariant: 'success',
    text: 'text-[var(--bellum-success-text)]',
  }
}

export type UsageBarProps = {
  label: string
  current: number
  max: number
  warningMessage?: string
  size?: ComponentSize
  className?: string
}

export const UsageBar = memo<UsageBarProps>(function UsageBar({
  label,
  current,
  max,
  warningMessage,
  size = 'md',
  className,
}) {
  const ratio = max > 0 ? current / max : 0
  const pct = Math.min(ratio * 100, 100)
  const variant = getVariant(ratio)
  const sizes = sizeStyles[size]

  return (
    <Box rounded="lg" className={cn('border', variant.bg, variant.border, sizes.padding, className)}>
      <Box display="flex" className="items-center justify-between mb-2">
        <Text size={sizes.titleSize} weight="semibold" element="span" className={variant.text}>
          {label}
        </Text>
        <Text size={sizes.countSize} weight="medium" element="div" className={variant.text}>
          {current} / {max}
        </Text>
      </Box>

      <Progress value={pct} variant={variant.progressVariant} size={sizes.progressSize} />

      {warningMessage && ratio >= 0.7 && (
        <Text size="xs" element="p" className={cn('mt-2', variant.text)}>
          {warningMessage}
        </Text>
      )}
    </Box>
  )
})
