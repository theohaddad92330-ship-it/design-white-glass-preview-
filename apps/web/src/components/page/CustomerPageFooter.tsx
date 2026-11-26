import type { ReactNode } from 'react'
import { cn } from '@bellum/ui'

type CustomerPageFooterProps = {
  children: ReactNode
  className?: string
}

export function CustomerPageFooter({ children, className }: CustomerPageFooterProps) {
  return (
    <div className={cn('flex min-w-0 w-full items-center justify-end overflow-visible', className)}>{children}</div>
  )
}
