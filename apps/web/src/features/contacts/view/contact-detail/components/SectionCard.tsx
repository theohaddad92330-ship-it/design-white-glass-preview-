import { Box, Card, Text, cn } from '@bellum/ui'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type SectionCardProps = {
  icon?: LucideIcon
  iconClassName?: string
  title?: string
  children: ReactNode
}

/** Titled card with a violet icon — the building block of the Résumé grid. */
export function SectionCard({ icon: Icon, iconClassName, title, children }: SectionCardProps) {
  return (
    <Card className="rounded-overlay p-5 shadow-none">
      {(Icon || title) && (
        <Box display="flex" className={cn('mb-4 items-center gap-2 text-[var(--bellum-text-accent)]', iconClassName)}>
          {Icon && <Icon className="size-4" />}
          <Text element="h2" size="base" weight="semibold" color="text-foreground">
            {title}
          </Text>
        </Box>
      )}
      {children}
    </Card>
  )
}
