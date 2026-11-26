import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { cn } from '../lib/utils'

const sizeStyles: Record<ComponentSize, { padding: string; textSize: 'xs' | 'sm' | 'base' }> = {
  sm: { padding: 'px-2.5 py-1', textSize: 'xs' },
  md: { padding: 'px-3 py-1.5', textSize: 'sm' },
  lg: { padding: 'px-4 py-2', textSize: 'base' },
}

type TabItem = {
  key: string
  label: string
  count?: number
  icon?: ReactNode
}

export type TabBarProps = {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (key: string) => void
  size?: ComponentSize
  className?: string
}

export const TabBar = ({ tabs, activeTab, onTabChange, size = 'md', className }: TabBarProps) => {
  const sizes = sizeStyles[size]

  return (
    // `overflow-x-auto` : sous 768px, une liste d'onglets trop large défile
    // dans SON conteneur au lieu de déborder de la page (§5/§8 du design
    // system) — même rendu tant que ça tient dans la largeur disponible.
    <Box
      display="flex"
      className={cn('items-center gap-1 overflow-x-auto bg-[var(--bellum-surface-2)] rounded-lg p-1', className)}
    >
      {tabs.map(tab => {
        const isActive = tab.key === activeTab
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              // shrink-0 : un onglet ne se comprime jamais, il pousse le
              // conteneur à défiler plutôt qu'à écraser son libellé.
              'flex shrink-0 items-center gap-1.5 rounded-md font-medium transition-all',
              sizes.padding,
              isActive
                ? 'bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)] shadow-sm'
                : 'text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)]',
            )}
          >
            {tab.icon}
            <Text size={sizes.textSize} weight={isActive ? 'medium' : 'normal'} element="span">
              {tab.label}
            </Text>
            {tab.count !== undefined && (
              <Text
                size="xs"
                element="span"
                className={cn(
                  'tabular-nums',
                  isActive ? 'text-[var(--bellum-text-secondary)]' : 'text-[var(--bellum-text-muted)]',
                )}
              >
                {tab.count}
              </Text>
            )}
          </button>
        )
      })}
    </Box>
  )
}
