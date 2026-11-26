import type { ReactNode } from 'react'
import { Box } from '../atoms/box'
import { cn } from '../lib/utils'

export type AbsoluteLayoutProps = {
  children: ReactNode
  className?: string
}

/**
 * AbsoluteLayout — fixed fullscreen container.
 */
export function AbsoluteLayout({ children, className }: AbsoluteLayoutProps) {
  return <Box className={cn('top-0 left-0 right-0 bottom-0 fixed', className)}>{children}</Box>
}
