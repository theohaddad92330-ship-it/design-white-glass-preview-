import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'

export function SectionHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-2">
        {icon}
        <Text element="h3" size="base" weight="semibold">
          {title}
        </Text>
      </div>
      <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {description}
      </Text>
    </div>
  )
}
