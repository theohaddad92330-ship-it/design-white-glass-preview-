import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@bellum/ui'

type AnimatedIconProps = HTMLAttributes<HTMLDivElement> & {
  size?: number
}

const ICON_TRANSITION = { duration: 1.8, repeat: Infinity, repeatDelay: 0.35 } as const

export function CompassIcon({ className, size = 28, ...props }: AnimatedIconProps) {
  return (
    <IconRoot className={className} size={size} {...props}>
      <circle cx="12" cy="12" r="10" />
      <motion.polygon
        points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"
        animate={{ rotate: 360 }}
        transition={{ type: 'spring', stiffness: 120, damping: 15, repeat: Infinity, repeatDelay: 0.4 }}
        style={{ transformOrigin: '12px 12px' }}
      />
    </IconRoot>
  )
}

export function CursorClickIcon({ className, size = 28, ...props }: AnimatedIconProps) {
  return (
    <IconRoot className={className} size={size} {...props}>
      <motion.path
        d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"
        animate={{ x: [0, 0, -3, 0], y: [0, -4, 0, 0] }}
        transition={ICON_TRANSITION}
      />
      <ClickRay d="M14 4.1 12 6" x={1} y={-1} />
      <ClickRay d="m5.1 8-2.9-.8" x={-1} y={0} />
      <ClickRay d="m6 12-1.9 2" x={-1} y={1} />
      <ClickRay d="M7.2 2.2 8 5.1" x={0} y={-1} />
    </IconRoot>
  )
}

export function LinkIcon({ className, size = 28, ...props }: AnimatedIconProps) {
  const animation = {
    pathLength: [1, 0.97, 1, 0.97, 1],
    pathOffset: [0, 0.05, 0, 0.05, 0],
    rotate: [0, -5, 0],
  }

  return (
    <IconRoot className={className} size={size} {...props}>
      <motion.path
        d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        animate={animation}
        transition={ICON_TRANSITION}
      />
      <motion.path
        d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        animate={animation}
        transition={ICON_TRANSITION}
      />
    </IconRoot>
  )
}

export function ProblemIconCycle({
  className,
  interval = 2400,
  size = 24,
}: {
  className?: string
  interval?: number
  size?: number
}) {
  const [index, setIndex] = useState(0)
  const icons = [CompassIcon, CursorClickIcon, LinkIcon] as const
  const Icon = icons[index]!

  useEffect(() => {
    const timer = window.setInterval(() => setIndex(current => (current + 1) % icons.length), interval)
    return () => window.clearInterval(timer)
  }, [icons.length, interval])

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={index}
        initial={{ opacity: 0, scale: 0.82, rotate: -8 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={{ opacity: 0, scale: 0.82, rotate: 8 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
      >
        <Icon size={size} className={cn('pt-1', className)} />
      </motion.div>
    </AnimatePresence>
  )
}

function ClickRay({ d, x, y }: { d: string; x: number; y: number }) {
  return (
    <motion.path
      d={d}
      animate={{ opacity: [0, 1, 0, 0, 1], x: [0, x, 0, 0], y: [0, y, 0, 0] }}
      transition={ICON_TRANSITION}
    />
  )
}

function IconRoot({
  children,
  className,
  size,
  ...props
}: AnimatedIconProps & {
  children: ReactNode
  size: number
}) {
  return (
    <div className={cn('inline-flex', className)} {...props}>
      <svg
        aria-hidden="true"
        fill="none"
        height={size}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width={size}
      >
        {children}
      </svg>
    </div>
  )
}
