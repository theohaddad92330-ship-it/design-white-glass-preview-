import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'

type SpinnerProps = {
  size?: number
  className?: string
}

/** Lucide spinner with animate-spin. */
export function Spinner({ size = 24, className }: SpinnerProps) {
  return <Loader2 className={cn('animate-spin', className)} size={size} />
}

export type { SpinnerProps }
