import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react'
import { ModalOpenRegistrar } from '../hooks/use-modal-open'
import { cn } from '../lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogPortal = DialogPrimitive.Portal
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        // #1788 — `z-overlay` (60) : le voile d'une modale, pas un `z-50` brut.
        // Un `z-50` restait SOUS le toast (70) et le widget de signalement
        // (80) : une modale ouverte pendant qu'un toast s'affiche passait
        // visuellement dessous.
        'fixed inset-0 z-overlay bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className,
      )}
      {...props}
    />
  )
})

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /**
     * #1797 — le nom accessible de la croix de fermeture.
     *
     * Il était écrit « Close » EN DUR dans un produit dont la langue par
     * défaut est le français : soixante-cinq dialogues annonçaient un mot
     * anglais au lecteur d'écran. `packages/ui` n'a pas d'i18n — la traduction
     * appartient donc à l'appelant, qui la passe ici.
     *
     * #1797 (suite) — le défaut anglais est parti : les 70 appelants de ce
     * dépôt passent tous `closeLabel` désormais (garde GA-338,
     * `apps/web/src/architecture/dialog-close-label-is-translated.test.ts`).
     * La prop est donc OBLIGATOIRE — un défaut, quel qu'il soit, mentirait
     * dans une langue pour l'appelant qui l'oublie.
     */
    closeLabel: string
  }
>(function DialogContent({ className, children, closeLabel, ...props }, ref) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // #1788 — `z-overlay` : le contenu de la modale reste au même
          // étage que son propre voile (l'ordre du DOM le place déjà
          // au-dessus), pas au rôle d'un menu ni d'un toast.
          //
          // #1797 — `w-[calc(100%-2rem)]` et non `w-full` : l'élément est en
          // `fixed`, donc `w-full` vaut la LARGEUR DE LA FENÊTRE et la boîte
          // touchait les deux bords sur un téléphone. La règle du dépôt
          // demande une gouttière d'au moins 16 px à toute largeur. Au-delà de
          // `max-w-lg`, rien ne change : c'est le maximum qui gagne.
          //
          // #2509 — `max-h-[calc(100dvh-2rem)] overflow-y-auto` : LA fenêtre
          // partagée n'avait AUCUNE borne de hauteur. Mesuré en production
          // sur « Nouvelle conversation » (/chat, PDF ScopeDialog) — 576×900
          // dans une fenêtre de 805 de haut, à y = −47 : le pied de boutons
          // sortait de l'écran, hors d'atteinte au clic comme au clavier. Le
          // plafond laisse `le-document-ne-defile-jamais.test.ts` (GA-256)
          // intact — un `max-h-*` ne peut structurellement pas rendre une
          // boîte plus haute que le viewport, c'est la forme qu'il liste déjà
          // comme innocente. Le contenu ENTIER défile en cas de dépassement
          // (même mécanique que `ActionDialog`, déjà `max-h-[90vh]
          // overflow-y-auto` pour ses variantes `base`/`info`) : un appelant
          // qui a besoin d'une hauteur différente la passe via `className`,
          // que `cn` (tailwind-merge) fait gagner sur cette valeur par défaut.
          // Théo DS §2.10 — rayon de surcouche 12 px, ombre `--v22-shadow` (`shadow-overlay`).
          // SIMON-FIX — `--impersonation-banner-height` (publiée par le bandeau d'incarnation, fixe et au-dessus de tout,
          // 0 sinon) : la fenêtre se centre dans la zone SOUS le bandeau, son titre n'y passe plus dessous.
          'fixed left-[50%] top-[calc(50%+var(--impersonation-banner-height,0px)/2)] z-overlay grid w-[calc(100%-2rem)] max-w-lg max-h-[calc(100dvh-2rem-var(--impersonation-banner-height,0px))] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-[var(--bellum-surface-1)] p-6 shadow-overlay duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-overlay',
          className,
        )}
        {...props}
      >
        {/* #4623 — le dock de Laura (`z-widget`) s'efface tant que ce contenu est monté (= dialogue ouvert). */}
        <ModalOpenRegistrar />
        {children}
        {/* #1797 — la croix a enfin une CIBLE.
            Elle ne mesurait que son icône (16 px) : c'est la « croix de
            fermeture mesurée sous le doigt » que le commentaire de
            `button.tsx` cite déjà, et le seul geste de sortie d'une modale au
            doigt. Même réponse que la variante `icon` du bouton partagé —
            32 px au pointeur fin, plancher de 44 px au pointeur grossier, sans
            branche `isMobile`. */}
        {/* SIMON-FIX (recette Simon 20/10) — la croix ne mesurait que 32 px au pointeur fin, à ~10 px du bord
            visible : une cible de 44 px PARTOUT (plancher du dépôt), dégagée du bord, centrée sur le titre. */}
        <DialogPrimitive.Close className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">{closeLabel}</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // `pr-8` : le titre ne passe jamais sous la croix de 44 px (SIMON-FIX).
  return <div className={cn('flex flex-col space-y-1.5 pr-8 text-center sm:text-left', className)} {...props} />
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
})
