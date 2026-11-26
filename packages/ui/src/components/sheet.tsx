'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'

import { cn } from '../lib/utils'

/**
 * Combien de `Sheet` sont ouverts EN CE MOMENT, n'importe où dans l'app.
 *
 * Existe pour UNE raison : le widget de retour flottant (bottom-right,
 * `z-widget`) et l'action primaire d'un tiroir ancré à droite (`side="right"`)
 * se disputent le MÊME coin de l'écran — mesuré sur « Plus de filtres » du
 * vivier le 30/08/2026, le bouton « Appliquer » était recouvert. Monter le
 * z-index du tiroir casserait la raison d'être du widget (rester au-dessus du
 * contenu ordinaire) ; corriger tiroir par tiroir se ré-oublierait au
 * prochain. Ce compteur est la porte UNIQUE par laquelle `FeedbackWidget` sait
 * qu'un tiroir occupe ce coin et s'efface pendant ce temps — voir GA-205 et
 * `useAnySheetOpen` ci-dessous.
 */
let openSheetCount = 0
const openSheetListeners = new Set<() => void>()

function notifyOpenSheetListeners(): void {
  for (const listener of openSheetListeners) listener()
}

function subscribeToOpenSheets(listener: () => void): () => void {
  openSheetListeners.add(listener)
  return () => {
    openSheetListeners.delete(listener)
  }
}

function getOpenSheetSnapshot(): boolean {
  return openSheetCount > 0
}

function getOpenSheetServerSnapshot(): boolean {
  return false
}

/** True tant qu'au moins un `Sheet` est ouvert quelque part dans l'app. */
export function useAnySheetOpen(): boolean {
  return React.useSyncExternalStore(subscribeToOpenSheets, getOpenSheetSnapshot, getOpenSheetServerSnapshot)
}

function Sheet({ open, ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  React.useEffect(() => {
    if (!open) return
    openSheetCount += 1
    notifyOpenSheetListeners()
    return () => {
      openSheetCount -= 1
      notifyOpenSheetListeners()
    }
  }, [open])
  return <SheetPrimitive.Root data-slot="sheet" open={open} {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        // `z-overlay` — l'échelle d'empilement NOMMÉE du dépôt, pas un `z-50`
        // magique : c'est ce qui rend « le widget reste au-dessus d'un tiroir »
        // lisible depuis `tailwind.config.ts` plutôt que d'un nombre isolé ici.
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-overlay bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

/**
 * #1797 — le nom accessible de la croix de fermeture, même contrat que
 * `DialogContent` (`packages/ui/src/components/dialog.tsx`) : le libellé
 * était « Close » EN DUR dans un produit dont la langue par défaut est le
 * français. `packages/ui` n'a pas d'i18n — la traduction appartient donc à
 * l'appelant, qui la passe ici.
 *
 * `closeLabel` est OBLIGATOIRE sauf quand `hideClose` vaut `true` : dans ce
 * cas la croix ne se rend pas du tout, et un nom qu'on ne lirait jamais
 * mentirait pour rien. L'union ci-dessous force ce choix à la compilation
 * plutôt qu'à un défaut qui pourrait mentir.
 */
type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left'
  /**
   * #3471 — un panneau non-modal (`Sheet` ouvert avec `modal={false}`) n'a
   * plus besoin d'un fond qui couvre la page : cette même div, `fixed
   * inset-0`, intercepte alors les clics destinés au contenu dessous (une
   * case à cocher d'une autre ligne) avant qu'ils ne l'atteignent — la barre
   * de sélection des contacts capturait toute la page pour cette raison.
   * Réservé aux appelants non-modaux ; les tiroirs modaux existants (filtres)
   * gardent leur fond par défaut.
   */
  hideOverlay?: boolean
} & ({ hideClose: true; closeLabel?: never } | { hideClose?: false; closeLabel: string })

function SheetContent({
  className,
  children,
  side = 'right',
  hideClose,
  closeLabel,
  hideOverlay,
  ...props
}: SheetContentProps) {
  return (
    <SheetPortal>
      {!hideOverlay && <SheetOverlay />}
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // Théo DS §2.11 — le tiroir est un PANNEAU (`--surface`, blanc en clair), pas
        // le fond de page gris ; rayon et ombre de surcouche.
        className={cn(
          'bg-[var(--bellum-surface-1)] data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-overlay flex flex-col gap-4 shadow-overlay transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 overflow-hidden',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-3 right-3 h-[calc(100%-1.5rem)] w-3/4 rounded-overlay border sm:max-w-sm',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-3 left-3 h-[calc(100%-1.5rem)] w-3/4 rounded-overlay border sm:max-w-sm',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t',
          className,
        )}
        {...props}
      >
        {children}
        {/*
          ⚠️ Rendu HORS FLUX : ce bouton occupe la bande 16→32 px depuis le bord
          droit (et le haut) du panneau, sans rien réserver dans la mise en page.
          Un `SheetHeader` qui aligne du contenu à DROITE (badge, action) doit
          donc réserver la gouttière lui-même — p. ex. `pr-6` sur sa rangée quand
          l'en-tête est en `p-5` — sinon ce contenu passe sous la croix.
          La réserve ne peut pas être posée ici : `SheetHeader` est un frère et
          ignore la valeur de `hideClose`, et un `pr-*` ajouté à sa classe de base
          serait de toute façon écrasé par le `p-*` des appelants (tailwind-merge).
        */}
        {!hideClose && (
          <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none">
            <XIcon className="size-4" />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-header" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('flex flex-col gap-1.5 p-4', className)} {...props} />
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription }
