import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '../lib/utils'

export const Container = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Container(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn(className)} {...props} />
})

export const FlexContainer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function FlexContainer(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex', className)} {...props} />
})

export const MainContainer = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function MainContainer(
  { className, ...props },
  ref,
) {
  return <main ref={ref} className={cn(className)} {...props} />
})
