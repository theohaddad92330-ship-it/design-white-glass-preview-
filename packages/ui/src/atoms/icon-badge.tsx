import { memo, type ElementType } from 'react'
import { cn } from '../lib/utils'

type Size = 'sm' | 'md' | 'lg'
type Rounded = 'none' | 'sm' | 'md' | 'lg' | 'full'

type IconBadgeProps = {
  icon: ElementType
  iconSize?: number
  iconColor?: string
  size?: Size
  rounded?: Rounded
  className?: string
  bg?: string
}

const paddingMap: Record<Size, string> = {
  sm: 'p-1',
  md: 'p-2',
  lg: 'p-4',
}

const roundedMap: Record<Rounded, string> = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

/**
 * IconBadge — square / round container framing a Lucide icon.
 *
 * @example
 * <IconBadge icon={Bell} size="md" rounded="full" bg="bg-primary" iconColor="text-primary-foreground" />
 */
export const IconBadge = memo<IconBadgeProps>(function IconBadge({
  icon: Icon,
  iconSize = 5,
  iconColor = 'text-[var(--bellum-text-accent)]',
  size = 'md',
  className = '',
  bg = 'bg-muted',
  rounded = 'md',
}) {
  return (
    <div className={cn('flex items-center justify-center', roundedMap[rounded], bg, paddingMap[size], className)}>
      <Icon className={cn('dark:text-black', `w-${iconSize} h-${iconSize}`, iconColor)} />
    </div>
  )
})
