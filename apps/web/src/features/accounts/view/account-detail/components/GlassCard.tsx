import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { cn } from '@bellum/ui'
import { cardFade } from '../motion'

type GlassCardProps = {
  children: ReactNode
  className?: string
  accent?: boolean
}

export function GlassCard({ children, className, accent = false }: GlassCardProps) {
  return (
    <motion.div
      variants={cardFade}
      className={cn(
        'rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-5 shadow-xs',
        accent && 'border-[var(--bellum-primary-500)]',
        className,
      )}
    >
      {children}
    </motion.div>
  )
}
