import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'
import { cn } from '../lib/utils'

export const ScrollArea = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.Root>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(function ScrollArea({ className, children, ...props }, ref) {
  return (
    <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn(
          'h-full w-full rounded-[inherit]',
          // Le Root est `overflow-hidden` et n'a le plus souvent PAS de hauteur
          // définie : beaucoup d'appelants ne lui passent qu'un `max-h-*`.
          // `h-full` (height:100%) retombe alors sur `auto` — le viewport prend
          // la hauteur du CONTENU, n'a donc rien à faire défiler, et le Root le
          // ROGNE. Résultat : contenu coupé, aucune barre, aucun recours.
          // `max-h-[inherit]` redonne au viewport la borne du Root, qui redevient
          // le conteneur de défilement. No-op quand le Root n'a pas de
          // max-height : `inherit` vaut alors `none`.
          'max-h-[inherit]',
          // Radix enveloppe le contenu dans un `display:table` (il s'en sert pour
          // mesurer la largeur). Une table est en largeur « shrink-to-fit » :
          // une ligne `truncate` (white-space:nowrap) l'élargit AU-DELÀ du
          // viewport. Or ce composant ne monte jamais de barre horizontale, donc
          // `overflow-x` y vaut toujours `hidden` : le débord est coupé sans
          // recours. En `block`, le wrapper est borné par la largeur du viewport
          // et `truncate` / le retour à la ligne refonctionnent.
          '[&>div]:!block',
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
})

export const ScrollBar = forwardRef<
  ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(function ScrollBar({ className, orientation = 'vertical', ...props }, ref) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      ref={ref}
      orientation={orientation}
      className={cn(
        'flex touch-none select-none transition-colors',
        orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
        orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
})
