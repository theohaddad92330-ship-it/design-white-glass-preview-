import type { ReactNode } from 'react'
import { Gauge, Text, cn, type GaugeProps } from '@bellum/ui'

const VALUE_FONT: Record<NonNullable<GaugeProps['size']>, string> = {
  tiny: 'text-xs',
  small: 'text-sm',
  medium: 'text-lg',
  large: 'text-2xl',
}

type GaugeDonutProps = {
  value: number | null
  color: string
  size?: GaugeProps['size']
  /** Full-scale denominator — the `Gauge` atom fills on `value / max` (0..1).
   *  Defaults to 10 (the historical /10 gauges); pass 100 for a /100 score. */
  max?: number
  displayValue?: ReactNode
  suffix?: ReactNode
  className?: string
  valueClassName?: string
  suffixClassName?: string
  trackColor?: string
  emptyLabel?: ReactNode
}

export function GaugeDonut({
  value,
  color,
  size = 'large',
  max = 10,
  displayValue,
  suffix,
  className,
  valueClassName,
  suffixClassName,
  trackColor = 'rgba(255,255,255,0.08)',
  emptyLabel = 'en attente',
}: GaugeDonutProps) {
  if (value == null) {
    return <Text className="relative inline-flex">-</Text>
  }

  return (
    <div className={cn('relative inline-flex', className)}>
      <Gauge size={size} value={value / max} showValue={false} colors={{ primary: color, secondary: trackColor }} />
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('font-bold', VALUE_FONT[size], valueClassName)} style={{ color }}>
          {displayValue ?? value}
        </span>
        {suffix ? <span className={cn('text-xs text-muted-foreground', suffixClassName)}>{suffix}</span> : null}
      </div>
    </div>
  )
}
