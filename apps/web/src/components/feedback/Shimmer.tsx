import { cn } from '@bellum/ui'
import type { CSSProperties, HTMLAttributes } from 'react'

type ShimmerStyle = CSSProperties & {
  '--shimmer-angle'?: string
  '--shimmer-color'?: string
  '--shimmer-duration'?: string
  '--shimmer-spread'?: string
}

type ShimmerProps = Omit<HTMLAttributes<HTMLSpanElement>, 'color'> & {
  angle?: number
  color?: string
  disabled?: boolean
  duration?: number
  once?: boolean
  reverse?: boolean
  spread?: number | string
}

export function Shimmer({
  angle,
  color,
  disabled = false,
  duration,
  once = false,
  reverse = false,
  spread,
  className,
  style,
  ...props
}: ShimmerProps) {
  const shimmerStyle: ShimmerStyle = {
    '--shimmer-angle': angle === undefined ? undefined : `${angle}deg`,
    '--shimmer-color': color,
    '--shimmer-duration': duration === undefined ? undefined : `${duration}ms`,
    '--shimmer-spread': formatSpread(spread),
    ...style,
  }

  return (
    <span
      className={cn(
        'shimmer',
        once && 'shimmer-once',
        reverse && 'shimmer-reverse',
        disabled && 'shimmer-none',
        className,
      )}
      style={shimmerStyle}
      {...props}
    />
  )
}

function formatSpread(spread: number | string | undefined): string | undefined {
  if (spread === undefined) return undefined
  return typeof spread === 'number' ? `${spread}px` : spread
}
