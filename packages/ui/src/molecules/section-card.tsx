import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Spacer } from '../atoms/spacer'
import { Text } from '../atoms/text'
import { semanticColors, type ComponentSize, type SemanticVariant } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<
  ComponentSize,
  {
    headerPx: number
    headerPy: number
    contentP: number
    iconSize: string
    titleSize: 'xs' | 'sm' | 'base'
    descSize: 'xs' | 'sm'
  }
> = {
  sm: { headerPx: 3, headerPy: 2, contentP: 3, iconSize: 'h-3.5 w-3.5', titleSize: 'xs', descSize: 'xs' },
  md: { headerPx: 4, headerPy: 3, contentP: 4, iconSize: 'h-4 w-4', titleSize: 'sm', descSize: 'xs' },
  lg: { headerPx: 5, headerPy: 4, contentP: 5, iconSize: 'h-5 w-5', titleSize: 'base', descSize: 'sm' },
}

export type SectionCardProps = {
  icon?: LucideIcon
  title: string
  description?: string
  children: ReactNode
  rightContent?: ReactNode
  variant?: SemanticVariant | 'dashed'
  size?: ComponentSize
  className?: string
}

export function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  rightContent,
  variant = 'default',
  size = 'md',
  className,
}: SectionCardProps) {
  const isDashed = variant === 'dashed'
  const colors = isDashed ? semanticColors.default : semanticColors[variant as SemanticVariant]
  const sizes = sizeStyles[size]

  return (
    <Box
      rounded="lg"
      className={cn(
        'border bg-[var(--bellum-surface-1)]',
        isDashed ? 'border-dashed border-[var(--bellum-border)]' : colors.border,
        variant !== 'default' && variant !== 'dashed' && colors.bgSubtle,
        className,
      )}
    >
      <Box px={sizes.headerPx} py={sizes.headerPy} className="border-b border-[var(--bellum-border)]">
        <Box display="flex" className="items-center justify-between">
          <Box display="flex" className="items-center gap-2">
            {Icon && <Icon className={cn(sizes.iconSize, colors.icon)} />}
            <Text size={sizes.titleSize} weight="medium" color={colors.text}>
              {title}
            </Text>
          </Box>
          {rightContent}
        </Box>
        {description && (
          <>
            <Spacer size={1} />
            <Text size={sizes.descSize} className="text-[var(--bellum-text-muted)]">
              {description}
            </Text>
          </>
        )}
      </Box>
      <Box p={sizes.contentP}>{children}</Box>
    </Box>
  )
}
