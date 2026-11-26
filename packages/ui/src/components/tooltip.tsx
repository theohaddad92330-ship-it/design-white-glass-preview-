'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '../lib/utils'

function TooltipProvider({ delayDuration = 0, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
}

function Tooltip({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Content> & {
  showArrow?: boolean
}

function TooltipContent({ className, sideOffset = 4, children, showArrow = false, ...props }: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          // #1788 — `z-picker` (90) : même famille que les menus déroulants.
          // Un `z-50` brut restait sous le toast (70) et le widget de
          // signalement (80).
          '[--tooltip-bg:theme(colors.zinc.800)] bg-[var(--tooltip-bg)] border border-[var(--tooltip-border)] [--tooltip-border:theme(colors.zinc.700)] shadow-sm text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-picker w-fit origin-(--radix-tooltip-content-transform-origin) rounded-lg px-3 py-1 text-xs text-balance',
          className,
        )}
        {...props}
      >
        {children}
        {showArrow && (
          // #1788 — même étage que son propre contenu (`z-picker`).
          <TooltipPrimitive.Arrow className="bg-[var(--tooltip-bg)] fill-[var(--tooltip-border)] z-picker size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
