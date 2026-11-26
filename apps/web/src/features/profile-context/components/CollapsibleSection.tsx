import { useState } from 'react'
import type { ReactNode } from 'react'
import { Card, CardContent, Text, cn, EASE } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

type CollapsibleSectionProps = {
  label: string
  labelClassName?: string
  title?: string
  defaultOpen?: boolean
  tone?: 'light' | 'dark'
  children: ReactNode
}

export function CollapsibleSection({
  label,
  labelClassName,
  title,
  defaultOpen = true,
  tone = 'light',
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const surface =
    tone === 'dark'
      ? 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] hover:bg-[var(--bellum-bg-lighter)]'
      : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] hover:bg-[var(--bellum-bg-lighter)]'
  return (
    <Card className={surface}>
      <CardContent className="space-y-1 px-4 py-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className={cn(
            'group inline-flex rounded-sm items-center gap-1 mt-1 text-xs text-[var(--bellum-text-muted)] hover:text-[var(--bellum-text-primary)] transition',
            labelClassName,
          )}
        >
          {label}
          <ChevronRight className={cn('h-3 w-3 transition-transform duration-300', open ? 'rotate-90' : '')} />
        </button>
        {title && (
          <Text element="h3" size="base" weight="semibold">
            {title}
          </Text>
        )}
        <motion.div
          initial={false}
          animate={{ maxHeight: open ? 1200 : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.5, ease: EASE.out }}
          className="overflow-hidden"
        >
          <div className="space-y-3 py-2">{children}</div>
        </motion.div>
      </CardContent>
    </Card>
  )
}
