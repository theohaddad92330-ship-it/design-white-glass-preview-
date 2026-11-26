import { Info, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Spacer } from '../atoms/spacer'
import { Text } from '../atoms/text'
import { semanticColors, type ComponentSize, type SemanticVariant } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<
  ComponentSize,
  { padding: string; iconSize: string; titleSize: 'xs' | 'sm' | 'base'; textSize: 'xs' | 'sm' }
> = {
  sm: { padding: 'p-2', iconSize: 'h-3.5 w-3.5', titleSize: 'xs', textSize: 'xs' },
  md: { padding: 'p-3', iconSize: 'h-4 w-4', titleSize: 'sm', textSize: 'xs' },
  lg: { padding: 'p-4', iconSize: 'h-5 w-5', titleSize: 'base', textSize: 'sm' },
}

export type InfoBannerProps = {
  title?: string
  children: ReactNode
  variant?: SemanticVariant
  size?: ComponentSize
  icon?: LucideIcon
  className?: string
}

export const InfoBanner = ({
  title,
  children,
  variant = 'default',
  size = 'md',
  icon: Icon = Info,
  className,
}: InfoBannerProps) => {
  const colors = semanticColors[variant]
  const sizes = sizeStyles[size]

  return (
    <Box
      display="flex"
      role={variant === 'danger' || variant === 'warning' ? 'alert' : undefined}
      className={cn('gap-2.5 rounded-lg border', colors.bgSubtle, colors.border, sizes.padding, className)}
    >
      <Icon className={cn(sizes.iconSize, 'shrink-0 mt-0.5', colors.icon)} />
      <Box>
        {title && (
          <>
            <Text size={sizes.titleSize} weight="medium" element="div" className={colors.text}>
              {title}
            </Text>
            <Spacer size={1} />
          </>
        )}
        <Text size={sizes.textSize} element="div" leading="relaxed" className={colors.text}>
          {children}
        </Text>
      </Box>
    </Box>
  )
}
