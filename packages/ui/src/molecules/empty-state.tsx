import { memo, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Spacer } from '../atoms/spacer'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<
  ComponentSize,
  {
    iconSize: string
    imgSize: string
    titleSize: 'sm' | 'base' | 'lg'
    descSize: 'xs' | 'sm' | 'base'
    padding: string
  }
> = {
  sm: { iconSize: 'w-10 h-10', imgSize: 'w-32 h-32', titleSize: 'sm', descSize: 'xs', padding: 'py-8' },
  md: { iconSize: 'w-14 h-14', imgSize: 'w-64 h-64', titleSize: 'base', descSize: 'sm', padding: 'py-12' },
  lg: { iconSize: 'w-20 h-20', imgSize: 'w-80 h-80', titleSize: 'lg', descSize: 'base', padding: 'py-16' },
}

export type EmptyStateProps = {
  title: string
  description?: string
  icon?: ReactNode
  srcUrl?: string
  alt?: string
  sizeImg?: string
  action?: ReactNode
  size?: ComponentSize
  align?: 'center' | 'start'
  className?: string
}

export const EmptyState = memo<EmptyStateProps>(function EmptyState({
  title,
  description,
  icon,
  srcUrl,
  alt,
  sizeImg,
  action,
  size = 'md',
  align = 'center',
  className,
}) {
  const sizes = sizeStyles[size]
  const isStart = align === 'start'
  const innerLayout = isStart ? 'items-start text-left' : 'items-center text-center'

  return (
    <Box display="flex" className={cn('w-full flex-col items-center', sizes.padding, className)}>
      <Box display="flex" className={cn('flex-col', innerLayout, 'max-w-sm')}>
        {srcUrl && (
          <>
            <img src={srcUrl} alt={alt ?? ''} className={cn('object-contain', sizeImg ?? sizes.imgSize)} />
            <Spacer size={4} />
          </>
        )}
        {!srcUrl &&
          icon &&
          (isStart ? (
            <>
              {icon}
              <Spacer size={4} />
            </>
          ) : (
            <>
              <Box display="flex" className={cn('items-center justify-center rounded-2xl', sizes.iconSize)}>
                {icon}
              </Box>
              <Spacer size={4} />
            </>
          ))}
        <Text size={sizes.titleSize} weight="medium" element="div" className="text-[var(--bellum-text-primary)]">
          {title}
        </Text>
        {description && (
          <>
            <Spacer size={1} />
            <Text size={sizes.descSize} element="div" className="text-[var(--bellum-text-secondary)]">
              {description}
            </Text>
          </>
        )}
        {action && (
          <>
            <Spacer size={4} />
            {action}
          </>
        )}
      </Box>
    </Box>
  )
})
