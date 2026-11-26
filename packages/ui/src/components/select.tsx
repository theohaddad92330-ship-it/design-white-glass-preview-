import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '../lib/utils'

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex h-10 w-full items-center justify-between rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] px-3 py-2 text-sm text-[var(--bellum-text-primary)] transition-[border-color,background-color,box-shadow] duration-150 ease-out placeholder:text-[var(--bellum-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--bellum-primary-500)] focus:ring-offset-2 focus:ring-offset-[var(--bellum-bg)] disabled:cursor-not-allowed disabled:opacity-50 data-[state=open]:border-[var(--bellum-primary-500)] data-[state=open]:bg-[var(--bellum-bg-lighter)] [&>span]:line-clamp-1',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 text-[var(--bellum-text-muted)] transition-transform duration-150 ease-out group-data-[state=open]:rotate-180" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectScrollUpButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(function SelectScrollUpButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1 text-[var(--bellum-text-muted)]', className)}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  )
})

export const SelectScrollDownButton = forwardRef<
  ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(function SelectScrollDownButton({ className, ...props }, ref) {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1 text-[var(--bellum-text-muted)]', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  )
})

export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          // #1788 — `z-picker` (90) : un select est un picker par
          // définition. Un `z-50` brut restait sous le toast (70) et le
          // widget de signalement (80).
          'relative z-picker max-h-96 min-w-[8rem] origin-[var(--radix-select-content-transform-origin)] overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] text-[var(--bellum-text-primary)] shadow-lg outline-none transition-[opacity,transform] duration-150 ease-out data-[state=closed]:scale-[0.98] data-[state=closed]:opacity-0 data-[state=open]:scale-100 data-[state=open]:opacity-100',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            'p-1.5',
            position === 'popper' &&
              // #3712 — un `min-w` SANS son pendant `max-w` laisse le menu
              // grandir à la largeur de son option la plus longue (un nom de
              // projet, de compte…), loin au-delà du déclencheur qui l'a
              // ouvert (mesuré ~1480 px en recette prod). Les deux bornes au
              // même repère Radix : le menu tient EXACTEMENT la largeur du
              // déclencheur, jamais plus, jamais moins.
              'w-full min-w-[var(--radix-select-trigger-width)] max-w-[var(--radix-select-trigger-width)]',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn('px-2 py-1.5 text-sm font-medium text-[var(--bellum-text-muted)]', className)}
      {...props}
    />
  )
})

export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & {
    /**
     * Une ligne qui EXPLIQUE l'option, dans le menu seulement : rendue hors de
     * `ItemText`, donc jamais recopiée dans le déclencheur fermé (Radix n'y
     * reprend que `ItemText`).
     */
    description?: string
    /**
     * #3697.6 (recette prod 09/10) — #3712 tronque PROPREMENT par défaut
     * (menu borné à la largeur du déclencheur) : juste pour une dizaine de
     * scénarios d'appel dont certains libellés dépassaient largement ce
     * menu étroit (« Invitation accep… »), la troncature rendait le choix
     * illisible. `wrapLabel` reste un OPT-IN par option : le défaut de
     * #3712 (troncature) ne change pour personne d'autre — seul ce libellé
     * passe à la ligne au lieu d'être coupé, toujours dans la largeur du
     * déclencheur (jamais plus large que lui).
     */
    wrapLabel?: boolean
  }
>(function SelectItem({ className, children, description, wrapLabel = false, ...props }, ref) {
  const labelClassName = wrapLabel ? 'block whitespace-normal break-words' : 'block truncate'
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex min-h-9 w-full min-w-0 cursor-default select-none items-center rounded-lg py-2 pl-8 pr-2 text-sm text-[var(--bellum-text-secondary)] outline-none transition-[background-color,color] duration-150 ease-out focus:bg-[var(--bellum-bg)] focus:text-[var(--bellum-text-primary)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-[var(--bellum-primary-500)]">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {description ? (
        <span className="flex min-w-0 flex-col">
          {/* #3712 — le menu tient désormais la largeur du déclencheur ; un
              libellé plus long que ça se tronque PROPREMENT (points de
              suspension), il ne force plus le menu à s'élargir. */}
          <SelectPrimitive.ItemText>
            <span className={labelClassName}>{children}</span>
          </SelectPrimitive.ItemText>
          <span className="truncate text-xs text-[var(--bellum-text-muted)]">{description}</span>
        </span>
      ) : (
        <SelectPrimitive.ItemText>
          <span className={labelClassName}>{children}</span>
        </SelectPrimitive.ItemText>
      )}
    </SelectPrimitive.Item>
  )
})

export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1.5 my-1 h-px bg-[var(--bellum-border)]', className)}
      {...props}
    />
  )
})
