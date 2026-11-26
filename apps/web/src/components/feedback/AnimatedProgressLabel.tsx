import { cn, EASE } from '@bellum/ui'
import { AnimatePresence, motion } from 'framer-motion'
import { Shimmer } from './Shimmer'

type AnimatedProgressLabelProps = {
  label: string
  labelKey?: string
  appendEllipsis?: boolean
  className?: string
  textClassName?: string
}

function withEllipsis(label: string): string {
  return label.endsWith('...') || label.endsWith('…') ? label : `${label}...`
}

export function AnimatedProgressLabel({
  label,
  labelKey,
  appendEllipsis = false,
  className,
  textClassName,
}: AnimatedProgressLabelProps) {
  const text = appendEllipsis ? withEllipsis(label) : label

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={labelKey ?? label}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: EASE.out }}
        className={cn('border-l-2 border-[var(--bellum-primary-500)] pl-4', className)}
      >
        <Shimmer spread={80} className={cn('block text-sm font-semibold italic', textClassName)}>
          {text}
        </Shimmer>
      </motion.div>
    </AnimatePresence>
  )
}
