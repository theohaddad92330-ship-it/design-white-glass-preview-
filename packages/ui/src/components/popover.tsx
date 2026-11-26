import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as React from 'react'
import { cn } from '../lib/utils'

export function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

// forwardRef so a parent that clones the trigger (e.g. TooltipTrigger `asChild`)
// can pass a ref through — a plain function component drops it and React warns:
// "Function components cannot be given refs".
export const PopoverTrigger = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Trigger>,
  React.ComponentProps<typeof PopoverPrimitive.Trigger>
>(function PopoverTrigger(props, ref) {
  return <PopoverPrimitive.Trigger ref={ref} data-slot="popover-trigger" {...props} />
})

export function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // #1788 — `z-picker` (90) : un popover est de la même famille que
          // les menus déroulants. Un `z-50` brut restait sous le toast (70)
          // et le widget de signalement (80).
          // #3845.1 — clampée à l'espace Popper disponible, défilable plutôt
          // que poussée hors écran (même défaut que `DropdownMenuContent`).
          'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-picker max-h-[var(--radix-popover-content-available-height)] w-72 origin-[var(--radix-popover-content-transform-origin)] overflow-y-auto rounded-md border p-4 shadow-md outline-none',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}
