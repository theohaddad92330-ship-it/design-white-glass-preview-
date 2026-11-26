import { DEFAULT_BRAND_NAME } from '@bellum/contracts'
import type { ReactNode } from 'react'
import { Logo } from '../assets/logo'
import { Text, type TextSize } from '../atoms/text'
import { cn } from '../lib/utils'

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

type Props = {
  /**
   * LA MARQUE À AFFICHER — marque blanche, 01/09/2026.
   *
   * ⚠️ Ce composant vit dans `@bellum/ui`, qui ne connaît NI le réseau NI
   * l'espace actif : il ne peut pas aller chercher la marque lui-même. Elle
   * lui est donc PASSÉE, et le repli reste le nôtre — c'est ce qui permet au
   * paquet de rester utilisable par le site public, qui n'a pas d'espace.
   *
   * L'appelant de l'application passe `useBrand()` ; les autres ne passent
   * rien et voient la marque du produit.
   */
  brand?: { name: string; logoUrl?: string | null }
  /** Visual scale. Defaults to `md` (logo 6/24, text base). */
  size?: Size
  /** Optional override class applied to the wrapper. */
  className?: string
  /** Optional override class applied to the logo glyph. */
  logoClassName?: string
  /** Optional override class applied to the wordmark text. */
  textClassName?: string
  /** Render extra content next to the wordmark (e.g. a badge). */
  children?: ReactNode
  mode?: 'row' | 'column'
}

const LOGO_CLASS_BY_SIZE: Record<Size, string> = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-10 w-10',
  '2xl': 'h-12 w-12',
  '3xl': 'h-14 w-14',
}

const TEXT_SIZE_BY_SIZE: Record<Size, TextSize> = {
  sm: 'sm',
  md: 'base',
  lg: 'lg',
  xl: 'xl',
  '2xl': '2xl',
  '3xl': '3xl',
}

export function BrandMark({
  brand,
  size = 'md',
  className,
  logoClassName,
  textClassName,
  children,
  mode = 'row',
}: Props) {
  const name = brand?.name?.trim() || DEFAULT_BRAND_NAME
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2',
        className,
        mode === 'row' ? 'flex-row' : 'flex-col items-center gap-1',
      )}
    >
      {brand?.logoUrl ? (
        /*
         * Le logo du client, servi depuis SON adresse.
         *
         * ⚠️ `object-contain` et une hauteur bornée : un logo est fourni par
         * quelqu'un d'autre, donc on ne sait rien de ses proportions. Sans la
         * contrainte, un fichier carré de 2000 px pousserait toute l'entête.
         *
         * L'`alt` porte le NOM et non « logo » : un lecteur d'écran doit
         * entendre de quel produit il s'agit, pas qu'il y a une image.
         */
        <img src={brand.logoUrl} alt={name} className={cn(LOGO_CLASS_BY_SIZE[size], 'object-contain', logoClassName)} />
      ) : (
        <Logo
          aria-label={name}
          className={cn(LOGO_CLASS_BY_SIZE[size], 'text-[var(--bellum-primary-400)]', logoClassName)}
        />
      )}
      <Text
        element="span"
        size={TEXT_SIZE_BY_SIZE[size]}
        weight="semibold"
        className={cn('tracking-tight ', textClassName)}
      >
        {name}
      </Text>
      {children}
    </div>
  )
}
