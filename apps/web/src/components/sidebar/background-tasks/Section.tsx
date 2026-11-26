import { Text } from '@bellum/ui'
import type { ReactNode } from 'react'

type SectionProps = {
  title: string
  count: number
  children: ReactNode
}

export function Section({ title, count, children }: SectionProps) {
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <Text
          element="h3"
          size="xs"
          weight="semibold"
          className="uppercase tracking-wider text-[var(--bellum-text-muted)]"
        >
          {title}
        </Text>
        <Text element="span" size="xs" weight="semibold" className="tabular-nums text-[var(--bellum-text-secondary)]">
          {count}
        </Text>
      </header>
      <div className="space-y-2 min-w-0">{children}</div>
    </section>
  )
}
