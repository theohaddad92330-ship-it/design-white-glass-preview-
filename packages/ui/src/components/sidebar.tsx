import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { PanelLeftIcon } from 'lucide-react'
import * as React from 'react'

import { useIsMobile } from '../hooks/use-mobile'
import { cn } from '../lib/utils'
import { Button } from './button'
import { Input } from './input'
import { Separator } from './separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'
import { Skeleton } from './skeleton'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

/**
 * ⚠️ CE DÉPÔT COMPILE EN TAILWIND 3.4, PAS 4.
 *
 * Ce fichier venait d'un shadcn écrit pour la v4, et le chemin
 * `collapsible="icon"` en avait gardé la syntaxe : `w-(--sidebar-width)`,
 * `size-10!`, `--spacing(4)`. En v3, ces noms de classes ne produisent AUCUN
 * CSS — la barre « savait » se replier, et le repli n'avait littéralement pas
 * de largeur. C'est ce qui rendait la dette invisible : le code se lisait
 * juste, les tests passaient, et rien ne l'appelait.
 *
 * Les classes du chemin replié sont donc écrites en v3 : `w-[var(--x)]` pour
 * une variable, `!size-11` (préfixe) pour l'important. Ce qui reste en v4
 * ailleurs dans le fichier concerne des variantes qu'aucun écran n'utilise.
 */

/**
 * Théo DS §2.18 (22/10/2026) — 232 px (`--sidebar-w` de Théo V22), en `rem`
 * pour suivre le réglage « Taille du texte ». Les deux barres de l'application
 * lisent `var(--sidebar-width)`, donc elles suivent ce jeton sans retouche.
 *
 * Historique : 240 px — la largeur RÉELLE des deux barres latérales de l'application, qui
 * l'écrivaient jusqu'ici à la main (`w-[240px]`) pendant que ce jeton valait
 * 16rem. L'écart ne se voyait pas tant que `collapsible="icon"` dormait : c'est
 * ce jeton qui donne sa largeur au VIDE laissé dans le flux, et une valeur
 * différente de celle du panneau ouvrirait une bande de fond entre la barre et
 * le contenu.
 */
const SIDEBAR_WIDTH = '14.5rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
/**
 * Le rail replié. 3,5rem (56 px) et non 3rem : c'est ce qui laisse 44 px de
 * cible tactile à l'entrée qu'il contient, une fois retirées les gouttières —
 * le plancher de GA-30. En `rem`, donc il suit le réglage « Taille du texte ».
 */
const SIDEBAR_WIDTH_ICON = '3.5rem'
const SIDEBAR_KEYBOARD_SHORTCUT = 'b'

const SIBEBAR_BG = 'bg-[var(--bellum-bg)]'
/** Coque Théo (23/10/2026) — le PANNEAU de la barre porte `--sidebar` de la maquette (blanc / #131316),
 *  posé sur le fond de page gris teinté, et un liseré droit `--border`. */
const SIDEBAR_PANEL = 'bg-[var(--bellum-sidebar)] border-r border-[var(--bellum-border)]'

type SidebarContextProps = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }

  return context
}

/**
 * Le contexte de repli, ou `null` — sans lever.
 *
 * Une barre `collapsible="none"` ne se replie pas : elle n'a aucun besoin de cet
 * état. `useSidebar` LÈVE pourtant hors d'un `SidebarProvider`, et `/settings`
 * sur MOBILE rend sa navigation dans `MobileShell`, hors de `MenuLayout` — donc
 * sans fournisseur. La page rendait un écran blanc, en production.
 *
 * ⚠️ La correction évidente — déplacer `useSidebar()` APRÈS la branche `none` —
 * est un piège : elle rend le hook CONDITIONNEL, ce que les règles des hooks
 * interdisent. Elle marche, et casse au premier changement d'ordre de rendu.
 * C'est le lint qui l'a rattrapée.
 *
 * Ici le hook est lu INCONDITIONNELLEMENT, en haut du composant, et c'est
 * l'EXIGENCE du contexte qui devient conditionnelle — pas son appel.
 */
function useSidebarOptional() {
  return React.useContext(SidebarContext)
}

function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === 'function' ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }
      // Pas de persistance ici. Ce composant écrivait un cookie `sidebar_state`
      // que RIEN ne relisait — et depuis que l'application garde le choix de
      // repli dans sa préférence d'interface, ce cookie serait le deuxième
      // endroit où vit le même réglage (GA-26 : un réglage vit à un seul
      // endroit). Qui veut restaurer un état passe `defaultOpen` ou `open`.
    },
    [setOpenProp, open],
  )

  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile(open => !open) : setOpen(open => !open)
  }, [isMobile, setOpen, setOpenMobile])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggleSidebar()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSidebar])

  const state = open ? 'expanded' : 'collapsed'

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar],
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn('group/sidebar-wrapper flex min-h-svh w-full', SIBEBAR_BG, className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  )
}

function Sidebar({
  side = 'left',
  variant = 'sidebar',
  collapsible = 'offcanvas',
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  side?: 'left' | 'right'
  variant?: 'sidebar' | 'floating' | 'inset'
  collapsible?: 'offcanvas' | 'icon' | 'none'
}) {
  // ⚠️ La branche `none` est AVANT `useSidebar()`, et l'ordre est le correctif.
  //
  // `useSidebar` LÈVE hors d'un `SidebarProvider`. Une barre déclarée
  // `collapsible="none"` n'a pourtant besoin d'aucun état de repli : elle ne se
  // replie pas. Lire le contexte avant de le savoir rendait obligatoire un
  // fournisseur dont ce cas n'a que faire.
  //
  // Ce n'était pas théorique : `/settings` sur MOBILE rendait sa navigation
  // dans `MobileShell`, hors de `MenuLayout` — donc sans fournisseur — et la
  // page PLANTAIT. C'était la seule navigation des Réglages sur téléphone.
  //
  // On retire le MOYEN de la panne plutôt que de la contourner chez l'appelant :
  // corriger `SettingsPage` aurait laissé le prochain appelant tomber dedans.
  // Lu INCONDITIONNELLEMENT (règles des hooks). Vaut `null` hors fournisseur,
  // ce qui est légitime pour `collapsible="none"` et seulement pour lui.
  const sidebar = useSidebarOptional()

  if (collapsible === 'none') {
    return (
      <div
        data-slot="sidebar"
        className={cn('text-sidebar-foreground flex h-full flex-col overscroll-none', SIDEBAR_PANEL, className)}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (!sidebar) {
    throw new Error('useSidebar must be used within a SidebarProvider.')
  }
  const { isMobile, state, openMobile, setOpenMobile } = sidebar

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          // #1797 — `[&>button]:hidden` retire déjà la croix de fermeture du
          // rendu (et donc de l'arbre d'accessibilité) : `closeLabel` n'est ici
          // jamais annoncé, mais la prop reste obligatoire côté type.
          closeLabel="Fermer"
          className="bg-sidebar text-sidebar-foreground p-0 [&>button]:hidden"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="flex h-full w-full flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      /**
       * `relative` et `shrink-0`, tous deux indispensables au repli :
       *
       * — `relative` fait de cette boîte le REPÈRE du panneau, qui était
       *   `fixed` et se calait donc sur la fenêtre. Cette application n'occupe
       *   pas la fenêtre : `#app-shell` vit sous des bandeaux qui poussent le
       *   contenu vers le bas, et en développement sous une barre d'état de
       *   28 px. Un panneau calé sur la fenêtre serait passé PAR-DESSUS le
       *   bandeau — et le seul jour où on l'aurait vu est celui où un bandeau
       *   est affiché.
       *
       * — `shrink-0` parce que c'est CETTE boîte qui est l'élément flex, et
       *   non le panneau : le `shrink-0` que les appelants posent atterrit sur
       *   le panneau et ne protège plus rien. Le contenu de page, en `w-full`,
       *   écraserait la barre.
       */
      className="group peer text-sidebar-foreground relative hidden shrink-0 md:block"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          // La largeur de BASE du vide laissé dans le flux par le panneau, qui
          // est positionné hors flux. Elle manquait : tant que personne
          // n'appelait `collapsible="icon"`, le vide faisait 0 px et rien ne le
          // montrait — le panneau serait passé PAR-DESSUS le contenu au premier
          // écran qui aurait osé se replier.
          'relative w-[var(--sidebar-width)] bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=offcanvas]:w-0',
          'group-data-[side=right]:rotate-180',
          variant === 'floating' || variant === 'inset'
            ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem)]'
            : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)]',
        )}
      />
      <div
        data-slot="sidebar-container"
        className={cn(
          // `absolute` (et non `fixed`) : voir le repère posé plus haut. La
          // largeur de base manquait aussi — le panneau n'en avait aucune et
          // dépendait de celle que son appelant voulait bien lui donner, donc
          // de deux valeurs à tenir d'accord avec le vide ci-dessus.
          // #1788 — `z-nav` (40) : le panneau desktop est la navigation, au
          // même titre que le `Sheet` mobile (déjà en `z-overlay`, voir
          // sheet.tsx). Un `z-10` brut le laissait hors de l'échelle nommée,
          // bien en dessous de `nav`.
          'absolute inset-y-0 z-nav hidden h-full w-[var(--sidebar-width)] transition-[left,right,width] duration-200 ease-linear md:flex',
          side === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+1rem+2px)]'
            : 'group-data-[collapsible=icon]:w-[var(--sidebar-width-icon)] group-data-[side=right]:border-l',
          className,
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn('flex h-full w-full flex-col', SIDEBAR_PANEL)}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * #2593 — `useSidebarOptional`, et non `useSidebar` : la QUATRIÈME reprise du
 * même défaut, mesurée en production le 18/09/2026 sur `SidebarMenuButton`
 * (voir son commentaire plus bas). `SidebarTrigger` n'a alors AUCUN appelant
 * dans le dépôt (`git grep` du 18/09/2026), mais c'est exactement le profil du
 * défaut : un composant juste, que personne n'appelle aujourd'hui, prêt à
 * planter le jour où quelqu'un le monte hors de `SidebarProvider` — un
 * gabarit mobile, par exemple, comme `SettingsNavbarBody` l'a déjà fait deux
 * fois pour d'autres appelants de ce fichier.
 *
 * Sans fournisseur il n'y a rien à replier : on ne rend RIEN, pas un bouton
 * inerte qui se tabulerait pour ne rien faire (même doctrine que
 * `SidebarCollapseToggle`, `apps/web/src/components/sidebar/
 * SidebarCollapseToggle.tsx`).
 */
function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const sidebar = useSidebarOptional()
  if (!sidebar) return null
  const { toggleSidebar } = sidebar

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn('size-7', className)}
      onClick={event => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

// #2593 — même filet que `SidebarTrigger` ci-dessus, même raison.
function SidebarRail({ className, ...props }: React.ComponentProps<'button'>) {
  const sidebar = useSidebarOptional()
  if (!sidebar) return null
  const { toggleSidebar } = sidebar

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        // #1788 — `z-nav` : la poignée de redimensionnement fait partie du
        // panneau de navigation, pas un étage à part. Un `z-20` brut la
        // laissait hors de l'échelle nommée.
        'hover:after:bg-sidebar-border absolute inset-y-0 z-nav hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
        'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
        '[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
        'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
        '[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
        '[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
        className,
      )}
      {...props}
    />
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<'main'>) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        'bg-background relative flex w-full flex-1 flex-col',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        className,
      )}
      {...props}
    />
  )
}

function SidebarInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn('bg-background h-8 w-full shadow-none', className)}
      {...props}
    />
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-2 p-2', className)}
      {...props}
    />
  )
}

function SidebarSeparator({ className, ...props }: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn('bg-sidebar-border mx-2 w-auto', className)}
      {...props}
    />
  )
}

function SidebarContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-2', className)}
      {...props}
    />
  )
}

function SidebarGroupLabel({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'div'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'div'

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'text-sidebar-foreground/70 ring-sidebar-ring flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupAction({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="sidebar-group-action"
      data-sidebar="group-action"
      className={cn(
        'text-sidebar-foreground ring-sidebar-ring hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 md:after:hidden',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...props}
    />
  )
}

function SidebarMenu({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...props}
    />
  )
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...props}
    />
  )
}

const sidebarMenuButtonVariants = cva(
  'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-control p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] focus-visible:ring-2 active:bg-[var(--bellum-surface-2)] active:text-[var(--bellum-text-primary)] disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-[var(--bellum-accent-bg)] data-[active=true]:font-medium data-[active=true]:text-[var(--bellum-text-accent)] data-[state=open]:hover:bg-[var(--bellum-surface-2)] data-[state=open]:hover:text-[var(--bellum-text-primary)] group-data-[collapsible=icon]:!size-11 group-data-[collapsible=icon]:!p-2.5 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
        outline:
          'bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] hover:shadow-[0_0_0_1px_var(--bellum-accent-line)]',
      },
      size: {
        default: 'h-8 text-sm',
        sm: 'h-7 text-xs',
        lg: 'h-12 text-sm group-data-[collapsible=icon]:!p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function SidebarMenuButton({
  asChild = false,
  isActive = false,
  variant = 'default',
  size = 'default',
  tooltip,
  className,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  isActive?: boolean
  tooltip?: string | React.ComponentProps<typeof TooltipContent>
} & VariantProps<typeof sidebarMenuButtonVariants>) {
  const Comp = asChild ? Slot : 'button'
  /**
   * #2593 — `useSidebarOptional`, et non `useSidebar` : LE DÉFAUT MESURÉ EN
   * PRODUCTION LE 18/09/2026, identique sur `/settings` et `/integrations` au
   * chargement DIRECT (lien, favori, rechargement) — jamais en y arrivant par
   * le menu. `SettingsPage.tsx` rend la navigation des Réglages dans
   * `MobileShell` sur téléphone, hors de tout `SidebarProvider` ; ce bouton
   * PORTE chaque entrée de cette navigation (`SettingsNavbarBody.tsx:57`), et
   * `useSidebar()` levait avant même d'atteindre le rendu.
   *
   * ⚠️ Contrairement à `SidebarTrigger`/`SidebarRail` (repli d'une barre —
   * rien à faire sans fournisseur, donc `null`), ce bouton porte le LIEN de
   * navigation lui-même : le rendre `null` viderait la seule navigation des
   * Réglages sur téléphone, un défaut PIRE que celui qu'on corrige. Il rend
   * donc TOUJOURS son contenu ; seule l'info-bulle (repli à l'icône, jamais le
   * cas sans fournisseur) dépend du contexte, absent ou présent.
   */
  const sidebar = useSidebarOptional()

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
      {...props}
    />
  )

  if (!tooltip) {
    return button
  }

  const tooltipProps = typeof tooltip === 'string' ? { children: tooltip } : tooltip

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        side="right"
        align="center"
        // Sans fournisseur, `sidebar` est `undefined` : `state` l'est aussi,
        // donc `!== 'collapsed'` vaut `true` et l'info-bulle reste masquée —
        // la même issue que si la barre n'était jamais repliée à l'icône,
        // ce qui est la vérité hors de `SidebarProvider`.
        hidden={sidebar?.state !== 'collapsed' || sidebar?.isMobile}
        {...tooltipProps}
      />
    </Tooltip>
  )
}

function SidebarMenuAction({
  className,
  asChild = false,
  showOnHover = false,
  ...props
}: React.ComponentProps<'button'> & {
  asChild?: boolean
  showOnHover?: boolean
}) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="sidebar-menu-action"
      data-sidebar="menu-action"
      className={cn(
        'text-sidebar-foreground ring-sidebar-ring hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] peer-hover/menu-button:text-[var(--bellum-text-primary)] absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0',
        'after:absolute after:-inset-2 md:after:hidden',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        showOnHover &&
          'peer-data-[active=true]/menu-button:text-[var(--bellum-text-accent)] group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 md:opacity-0',
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuBadge({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        'text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none',
        'peer-hover/menu-button:text-[var(--bellum-text-primary)] peer-data-[active=true]/menu-button:text-[var(--bellum-text-accent)]',
        'peer-data-[size=sm]/menu-button:top-1',
        'peer-data-[size=default]/menu-button:top-1.5',
        'peer-data-[size=lg]/menu-button:top-2.5',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}: React.ComponentProps<'div'> & {
  showIcon?: boolean
}) {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  }, [])

  return (
    <div
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn('flex h-8 items-center gap-2 rounded-md px-2', className)}
      {...props}
    >
      {showIcon && <Skeleton className="size-4 rounded-md" data-sidebar="menu-skeleton-icon" />}
      <Skeleton
        className="h-4 max-w-(--skeleton-width) flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            '--skeleton-width': width,
          } as React.CSSProperties
        }
      />
    </div>
  )
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        'border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function SidebarMenuSubItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn('group/menu-sub-item relative', className)}
      {...props}
    />
  )
}

function SidebarMenuSubButton({
  asChild = false,
  size = 'md',
  isActive = false,
  className,
  ...props
}: React.ComponentProps<'a'> & {
  asChild?: boolean
  size?: 'sm' | 'md'
  isActive?: boolean
}) {
  const Comp = asChild ? Slot : 'a'

  return (
    <Comp
      data-slot="sidebar-menu-sub-button"
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        'text-sidebar-foreground ring-sidebar-ring hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)] active:bg-[var(--bellum-surface-2)] active:text-[var(--bellum-text-primary)] [&>svg]:text-[var(--bellum-text-primary)] flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
        'data-[active=true]:bg-[var(--bellum-accent-bg)] data-[active=true]:text-[var(--bellum-text-accent)]',
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm',
        'group-data-[collapsible=icon]:hidden',
        className,
      )}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
  useSidebarOptional,
}
