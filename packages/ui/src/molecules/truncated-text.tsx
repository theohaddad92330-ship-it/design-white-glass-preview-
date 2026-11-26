import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/tooltip'
import { cn } from '../lib/utils'

export type TruncatedTextProps = {
  children: string
  className?: string
  /** Content rendered to the right of the truncated label */
  rightContent?: ReactNode
}

/**
 * TruncatedText — text that shows a tooltip only when truncated.
 */
export const TruncatedText = memo<TruncatedTextProps>(function TruncatedText({ children, className, rightContent }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [isTruncated, setIsTruncated] = useState(false)

  useEffect(() => {
    if (ref.current) {
      setIsTruncated(ref.current.scrollWidth > ref.current.clientWidth)
    }
  }, [children])

  return (
    <div className="flex items-center justify-between gap-3 w-full overflow-visible">
      <div className="flex-1 min-w-0">
        <TooltipProvider delayDuration={300}>
          {isTruncated ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span ref={ref} className={cn('block truncate', className)}>
                  {children}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-sm w-full" align="start">
                {children}
              </TooltipContent>
            </Tooltip>
          ) : (
            <span ref={ref} className={cn('block truncate', className)}>
              {children}
            </span>
          )}
        </TooltipProvider>
      </div>
      {rightContent}
    </div>
  )
})
