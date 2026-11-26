import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { LucideIcon } from 'lucide-react'
import * as React from 'react'
import { Spinner } from '../atoms/spinner'
import { Text } from '../atoms/text'
import { cn } from '../lib/utils'

type ButtonIcon = React.ElementType<{ className?: string }> | React.ReactNode

const reactComponentTypes = new Set([
  Symbol.for('react.forward_ref'),
  Symbol.for('react.memo'),
  Symbol.for('react.lazy'),
])

const buttonVariants = cva(
  "cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-immediate ease-bellum-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-focus-ring)] focus-visible:ring-offset-[3px] focus-visible:ring-offset-background aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        /* Primary CTA — flat (no gradient, no glow). Théo DS §2.1 : le remplissage
         * est THÉMATISÉ (`--bellum-primary`, éclairci en sombre) et le survol suit
         * Théo (assombri en clair, éclairci en sombre). */
        default:
          'bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)] shadow-xs hover:bg-[var(--bellum-primary-hover)] active:bg-[var(--bellum-primary-hover)]',
        black:
          'border border-black bg-black text-white shadow-xs hover:bg-[color-mix(in_srgb,black_88%,white)] active:bg-[color-mix(in_srgb,black_78%,white)] dark:border-white/10 dark:bg-white dark:text-black dark:hover:bg-[color-mix(in_srgb,white_88%,black)] dark:active:bg-[color-mix(in_srgb,white_78%,black)]',
        light:
          'border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-primary)] shadow-xs hover:bg-[var(--bellum-surface-2)] active:bg-[var(--bellum-bg-darker)] dark:border-white/10 dark:bg-[var(--bellum-surface-1)] dark:hover:bg-[var(--bellum-surface-2)]',
        destructive:
          'bg-[var(--bellum-danger)] text-white shadow-xs hover:bg-[color-mix(in_srgb,var(--bellum-danger)_85%,black)] focus-visible:ring-[color-mix(in_srgb,var(--bellum-danger)_30%,transparent)]',
        outline:
          'border border-[var(--bellum-border)] bg-transparent text-foreground shadow-xs hover:bg-[var(--bellum-surface-2)] hover:border-[var(--bellum-text-muted)]',
        secondary:
          'bg-[var(--bellum-surface-2)] text-foreground shadow-xs hover:bg-[var(--bellum-border)] border border-transparent hover:border-[var(--bellum-border)]',
        ghost: 'text-foreground hover:bg-[var(--bellum-surface-2)] hover:text-foreground',
        /* Théo DS §2.1 — `.btn.soft` : aplat lavande `--accent-bg` + trait `--accent-line`, texte accent (5,76:1). */
        soft: 'border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] text-[var(--bellum-text-accent)] hover:border-[var(--bellum-text-accent)]',
        /* Théo DS §2.1 — `.btn.plain` : sans bordure ni fond, texte secondaire ; le survol creuse. */
        plain:
          'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-2)] hover:text-[var(--bellum-text-primary)]',
        link: 'text-[var(--bellum-primary-500)] underline-offset-4 hover:underline hover:text-[var(--bellum-primary-600)]',
        /* violet = alias of default for backward compat */
        violet:
          'bg-[var(--bellum-primary)] text-[var(--bellum-on-primary)] shadow-xs hover:bg-[var(--bellum-primary-hover)] active:bg-[var(--bellum-primary-hover)]',
      },
      size: {
        // `pointer-coarse:min-h-11` (44px) sur les quatre tailles À TEXTE :
        // c'était la cause des 616 boutons mesurés sous 44 px sur 271
        // fichiers (chantiers-livres.md) — aucune des tailles à texte ne
        // portait de plancher tactile, seul `icon` en avait un (GA-30 bis).
        // Ce plancher ne joue QUE sous un pointeur grossier : un bouton
        // dense au clavier/souris (desktop) garde sa hauteur `h-*` telle
        // quelle, ce sont deux réponses au MÊME rendu, jamais une branche
        // `isMobile ?`. `compoundVariants` (plus bas) neutralise ce plancher
        // pour `variant: 'link'` — le lien de texte dans une phrase reste à
        // hauteur de ligne, l'exception que GA-30 nomme elle-même.
        default: 'h-9 px-4 py-2 has-[>svg]:px-3 pointer-coarse:min-h-11',
        xs: 'h-7 px-2 py-1 has-[>svg]:px-2 pointer-coarse:min-h-11',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:min-h-11',
        lg: 'h-10 px-6 has-[>svg]:px-4 pointer-coarse:min-h-11',
        xl: 'h-12 px-8 has-[>svg]:px-6',
        // `icon` est carré et sans texte — même famille que la croix de
        // fermeture à 24 px mesurée sous le doigt (GA-30) : le plancher
        // tactile s'applique donc à TOUTE instance de cette taille, sans
        // passer par un `className` au cas par cas sur chaque appelant.
        icon: 'size-9 pointer-coarse:min-h-11 pointer-coarse:min-w-11',
      },
    },
    compoundVariants: [
      {
        // Le lien de texte DANS une phrase (`variant="link"`, presque
        // toujours posé avec un `className="h-auto p-0"` par l'appelant)
        // doit rester à la hauteur de sa ligne — l'agrandir à 44 px au doigt
        // casserait le paragraphe. `h-auto` côté appelant n'annule PAS
        // `pointer-coarse:min-h-11` (ce sont deux groupes Tailwind
        // différents, `height` et `min-height`) : sans cette ligne, tout
        // lien texte deviendrait un pavé de 44 px sur mobile.
        variant: 'link',
        class: 'pointer-coarse:min-h-0',
      },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    fullWidth?: boolean
    isLoading?: boolean
    loadingText?: string
    icon?: ButtonIcon
    iconClassName?: string
    iconPosition?: 'left' | 'right'
  }

function isIconComponent(icon: ButtonIcon): icon is React.ElementType<{ className?: string }> {
  if (React.isValidElement(icon)) {
    return false
  }

  if (typeof icon === 'function') {
    return true
  }

  if (typeof icon !== 'object' || icon === null || !('$$typeof' in icon)) {
    return false
  }

  return reactComponentTypes.has(icon.$$typeof as symbol)
}

function ButtonIconView({ icon, className }: { icon: ButtonIcon; className?: string }) {
  if (isIconComponent(icon)) {
    const Icon = icon
    return <Icon className={cn('w-4 h-4 shrink-0', className)} />
  }

  return (
    <span className={cn('inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4', className)}>
      {icon}
    </span>
  )
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    asChild = false,
    fullWidth = false,
    isLoading = false,
    loadingText,
    icon,
    iconClassName,
    iconPosition = 'left',
    ...props
  },
  ref,
) {
  // `asChild` = le bouton PRÊTE son style à l'élément fourni (un <Link>, une
  // <a>). Radix `Slot` fusionne les props dans un ENFANT UNIQUE : lui passer le
  // gabarit habituel (icône + <Text> autour des enfants) lui donnait un fragment
  // à fusionner, et il rendait alors l'enfant SANS aucune classe — un lien nu au
  // lieu d'un bouton. On court-circuite donc le gabarit et on ne transmet que le
  // style. Corollaire assumé : `icon` / `isLoading` ne sont pas composables ici
  // (un seul enfant possible) — l'appelant rend son icône DANS l'enfant.
  if (asChild) {
    return (
      <Slot
        ref={ref}
        data-slot="button"
        className={cn(
          buttonVariants({ variant, size, className }),
          fullWidth && 'w-full flex items-center justify-center',
        )}
        {...props}
      />
    )
  }

  const Comp = 'button'
  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        fullWidth && 'w-full flex items-center justify-center',
        isLoading && 'cursor-default',
      )}
      aria-busy={isLoading || undefined}
      disabled={props.disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2">
          <Spinner size={16} className="animate-spin" aria-hidden="true" />
          {loadingText && <span>{loadingText}</span>}
        </div>
      ) : (
        <>
          {icon && iconPosition === 'left' && <ButtonIconView icon={icon} className={iconClassName} />}
          {/*
            ⚠️ `gap-1.5` ICI, et pas seulement sur le bouton — mesuré en
            production le 03/09/2026.

            Le bouton porte bien un `gap` (2 en taille normale, 1.5 en `sm`),
            mais ce `<Text>` enveloppe TOUS les enfants dans un seul élément :
            un appelant qui écrit `<Button><Icon/>{libellé}</Button>` — le motif
            le plus naturel, et celui de VINGT-DEUX boutons du produit — ne
            donne donc qu'UN enfant à espacer au bouton, et son gap n'espace
            rien. L'icône se colle au mot, sur tout le produit.

            La prop `icon` reste le chemin recommandé (elle rend l'icône en
            FRÈRE du texte, et permet `iconPosition="right"`). Ce gap-ci répare
            l'autre chemin plutôt que de le laisser produire un défaut visuel
            silencieux — un bouton sans icône n'a qu'un enfant, le gap n'y
            change rien.
          */}
          <Text className="flex items-center justify-center gap-1.5" weight="medium" size="sm">
            {props.children}
          </Text>
          {icon && iconPosition === 'right' && <ButtonIconView icon={icon} className={iconClassName} />}
        </>
      )}
    </Comp>
  )
})

export { buttonVariants }
export type { ButtonProps }
