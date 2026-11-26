import { memo, type ReactNode } from 'react'
import { Box } from '../atoms/box'
import { Text } from '../atoms/text'
import type { ComponentSize } from '../atoms/variants'
import { cn } from '../lib/utils'

export type DataListColumn<T> = {
  header: string
  width: string
  render: (item: T, index: number) => ReactNode
  align?: 'left' | 'center' | 'right'
}

export type DataListProps<T> = {
  columns: DataListColumn<T>[]
  data: T[]
  keyExtractor?: (item: T, index: number) => string | number
  toolbar?: ReactNode
  footer?: ReactNode
  onRowClick?: (item: T, index: number) => void
  emptyState?: ReactNode
  size?: ComponentSize
  className?: string
}

const sizeStyles: Record<
  ComponentSize,
  { headerPy: string; rowPy: string; px: string; text: 'xs' | 'sm' | 'base'; gap: string }
> = {
  sm: { headerPy: 'py-1.5', rowPy: 'py-2', px: 'px-3', text: 'xs', gap: 'gap-3' },
  md: { headerPy: 'py-2', rowPy: 'py-3', px: 'px-4', text: 'xs', gap: 'gap-4' },
  lg: { headerPy: 'py-3', rowPy: 'py-4', px: 'px-5', text: 'sm', gap: 'gap-5' },
}

function DataListInner<T>({
  columns,
  data,
  keyExtractor,
  toolbar,
  footer,
  onRowClick,
  emptyState,
  size = 'md',
  className,
}: DataListProps<T>) {
  const s = sizeStyles[size]
  const gridTemplate = columns.map(c => c.width).join(' ')

  return (
    <Box rounded="xl" className={cn('border bg-white overflow-hidden', className)}>
      {toolbar && <Box className={cn('border-b', s.px, 'py-2.5')}>{toolbar}</Box>}

      <Box
        className={cn('grid items-center border-b', s.px, s.headerPy, s.gap)}
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {columns.map((col, i) => (
          <Text
            key={i}
            size="xs"
            weight="medium"
            element="div"
            className={cn(
              'text-[var(--text-muted)]',
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
            )}
          >
            {col.header}
          </Text>
        ))}
      </Box>

      {data.length > 0 ? (
        data.map((item, i) => (
          <Box
            key={keyExtractor ? keyExtractor(item, i) : i}
            onClick={onRowClick ? () => onRowClick(item, i) : undefined}
            className={cn(
              'grid items-center border-b last:border-b-0 transition-colors',
              'hover:bg-neutral-50/70',
              onRowClick && 'cursor-pointer',
              s.px,
              s.rowPy,
              s.gap,
            )}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((col, j) => (
              <Box
                key={j}
                className={cn(col.align === 'right' && 'text-right', col.align === 'center' && 'text-center')}
              >
                {col.render(item, i)}
              </Box>
            ))}
          </Box>
        ))
      ) : emptyState ? (
        <Box className={cn('py-12 text-center', s.px)}>{emptyState}</Box>
      ) : null}

      {footer && <Box className={cn(s.px, 'py-2')}>{footer}</Box>}
    </Box>
  )
}

export const DataList = memo(DataListInner) as typeof DataListInner
