import { memo, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

export type InfoLineProps = {
  label: string
  value?: string | ReactNode
  capitalize?: boolean
  className?: string
}

export const InfoLine = memo<InfoLineProps>(function InfoLine(props) {
  const { label, value, capitalize = false, className } = props

  return (
    <Box display="flex" className={cn('items-center gap-2', className)}>
      <Text size="sm" className="text-muted-foreground">
        {label} :
      </Text>
      {typeof value === 'string' ? (
        <Text size="sm" weight="medium" className={cn('text-[var(--bellum-text-accent)]', capitalize && 'capitalize')}>
          {value}
        </Text>
      ) : (
        value
      )}
    </Box>
  )
})
