import { Box, Text, cn, Card } from '@bellum/ui'
import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

type Tone = 'violet' | 'blue' | 'green' | 'amber'

const toneClasses: Record<Tone, { box: string; text: string; border: string }> = {
  violet: {
    box: 'bg-[var(--bellum-primary-100)] dark:bg-[var(--bellum-primary-300)]',
    text: 'text-black',
    border: 'border-transparent',
  },
  blue: {
    box: 'bg-sky-100 dark:bg-sky-500',
    text: 'text-black',
    border: 'border-transparent',
  },
  green: {
    box: 'bg-emerald-100 dark:bg-emerald-500',
    text: 'text-black',
    border: 'border-transparent',
  },
  amber: {
    box: 'bg-amber-100 dark:bg-amber-500',
    text: 'text-black',
    border: 'border-transparent',
  },
}

export function ShellCard({ children, className }: { children: ReactNode; className?: string }) {
  return <Card className={cn('space-y-3 p-4', className)}>{children}</Card>
}

export function IconTile({ icon: Icon, tone, size = 'md' }: { icon: LucideIcon; tone: Tone; size?: 'sm' | 'md' }) {
  const toneClass = toneClasses[tone]
  const sizes = size === 'sm' ? 'size-8 [&>svg]:size-4' : 'size-11 [&>svg]:size-5'

  return (
    <Box
      display="flex"
      className={cn('items-center justify-center rounded-lg border', sizes, toneClass.box, toneClass.border)}
    >
      <Icon className={toneClass.text} />
    </Box>
  )
}

type SectionTitleProps = {
  icon: LucideIcon
  iconClassName?: string
  title: string
}

export function SectionTitle({ icon: Icon, iconClassName, title }: SectionTitleProps) {
  return (
    <Box display="flex" className="items-center gap-2">
      <Icon className={cn('size-4', iconClassName)} />
      <Text size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {title}
      </Text>
    </Box>
  )
}

export function FooterLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--bellum-text-secondary)] transition-colors hover:text-[var(--bellum-text-primary)]"
    >
      {label}
      <ArrowRight className="size-4" />
    </button>
  )
}
