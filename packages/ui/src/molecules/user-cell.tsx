import { memo, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { Avatar, AvatarFallback, AvatarImage } from '../components/avatar'
import { cn } from '../lib/utils'

const sizeStyles: Record<ComponentSize, { avatar: string; name: 'xs' | 'sm' | 'base'; sub: 'xs' | 'sm'; gap: string }> =
  {
    sm: { avatar: 'size-7', name: 'xs', sub: 'xs', gap: 'gap-2' },
    md: { avatar: 'size-9', name: 'sm', sub: 'xs', gap: 'gap-3' },
    lg: { avatar: 'size-11', name: 'base', sub: 'sm', gap: 'gap-3' },
  }

export type UserCellProps = {
  name: string
  subtitle?: string
  initials?: string
  avatarUrl?: string
  badges?: ReactNode
  size?: ComponentSize
  className?: string
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

export const UserCell = memo<UserCellProps>(function UserCell({
  name,
  subtitle,
  initials,
  avatarUrl,
  badges,
  size = 'md',
  className,
}) {
  const s = sizeStyles[size]
  const displayInitials = initials ?? getInitials(name)

  return (
    <Box display="flex" className={cn('items-center min-w-0', s.gap, className)}>
      <Avatar className={cn(s.avatar, 'shrink-0')}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
        <AvatarFallback className="bg-[var(--bellum-surface-2)]">
          <Text size="xs" weight="medium" element="span" className="text-[var(--bellum-text-secondary)]">
            {displayInitials}
          </Text>
        </AvatarFallback>
      </Avatar>
      <Box className="min-w-0">
        <Box display="flex" className="items-center gap-2">
          <Text size={s.name} weight="medium" element="span" className="text-[var(--bellum-text-primary)] truncate">
            {name}
          </Text>
          {badges}
        </Box>
        {subtitle && (
          <Text size={s.sub} element="div" className="text-[var(--bellum-text-secondary)] truncate">
            {subtitle}
          </Text>
        )}
      </Box>
    </Box>
  )
})
