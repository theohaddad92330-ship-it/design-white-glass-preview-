import * as React from 'react'
import { forwardRef } from 'react'
import { cn } from '../lib/utils'
import { Label } from '../components/label'

type ElementType = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span' | 'label' | 'div'

/** Tailwind-compatible font size tokens */
export type TextSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'

/** Tailwind-compatible font weight tokens */
export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold'

/** Tailwind-compatible line height tokens */
export type TextLeading = 'none' | 'tight' | 'snug' | 'normal' | 'relaxed' | 'loose'

export type TextProps = {
  size?: TextSize
  weight?: TextWeight
  leading?: TextLeading
  color?: string
  backgroundColor?: string
  element?: ElementType
  children?: React.ReactNode
  htmlFor?: string
  className?: string
  noWrap?: boolean
  /**
   * Retire la largeur de lecture — pour un texte qui doit occuper toute la
   * largeur de son conteneur (une cellule, une ligne de tableau de bord).
   * À n'utiliser que quand la ligne est COURTE par nature : le défaut existe
   * parce qu'une ligne longue est pénible à lire, pas par décoration.
   */
  full?: boolean
} & Omit<React.HTMLAttributes<HTMLElement>, 'color' | 'className' | 'children' | 'style'>

const sizeClasses: Record<TextSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
}

const weightClasses: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const leadingClasses: Record<TextLeading, string> = {
  none: 'leading-none',
  tight: 'leading-tight',
  snug: 'leading-snug',
  normal: 'leading-normal',
  relaxed: 'leading-relaxed',
  loose: 'leading-loose',
}

function resolveColor(color?: string): { className?: string; style?: string } {
  if (!color) return {}
  if (color.startsWith('text-')) return { className: color }
  return { style: color }
}

/**
 * Text — typography primitive with Tailwind-native props.
 *
 * @example
 * <Text size="base" weight="medium" color="text-[var(--bellum-text-primary)]">Hello</Text>
 */
export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    size = 'base',
    weight = 'normal',
    leading,
    element = 'p',
    color,
    backgroundColor,
    htmlFor,
    className,
    noWrap = false,
    full = false,
    children,
    ...props
  },
  ref,
) {
  const colorResolved = resolveColor(color)

  /**
   * LA LARGEUR DE LECTURE (décision D81 de Louis, 23/08/2026).
   *
   * Mesuré en production sur `/pilotage` à 1 440 px : les paragraphes de
   * description faisaient **1 080 à 1 112 px, soit ~180 caractères par
   * ligne** — deux fois et demie la limite au-delà de laquelle l'œil perd le
   * début de la ligne suivante. Sur un 27 pouces, davantage encore.
   *
   * La borne vit ICI et pas dans les écrans, pour trois raisons :
   *
   * 1. C'est la seule façon de la tenir. Soixante-huit paragraphes de
   *    description existent aujourd'hui ; les borner un par un garantit
   *    d'en oublier, et surtout que le soixante-neuvième ne le soit pas.
   * 2. Elle est SANS EFFET là où elle ne sert pas : un texte dans une carte
   *    de 300 px n'atteint jamais 70 caractères, donc rien ne bouge.
   * 3. Elle s'exprime en `ch`, l'unité qui suit la taille de police de
   *    l'élément — 70 caractères restent 70 caractères que le texte soit en
   *    12 ou en 16 px, et le réglage « Grand » des préférences ne casse rien.
   *
   * Ce qui ÉCHAPPE à la borne, et c'est voulu : les titres (un titre long
   * doit pouvoir tenir sur sa ligne), tout appelant qui passe déjà un
   * `max-w-`, une troncature (`truncate` / `line-clamp` mesurent leur
   * conteneur : borner d'abord couperait le texte plus tôt qu'il ne faut),
   * et `full` pour les cas restants.
   */
  const isHeading = element.startsWith('h')
  const callerSetsWidth = /\b(max-w-|w-\[|truncate|line-clamp-|whitespace-nowrap)/.test(className ?? '')
  const capped = !full && !noWrap && !isHeading && !callerSetsWidth
  // Un texte CENTRÉ borné sans `mx-auto` deviendrait un bloc de 70 caractères
  // collé à gauche, avec son texte centré à l'intérieur : pire que la ligne
  // trop longue qu'on corrige. Les états vides sont précisément l'endroit où
  // les deux se rencontrent.
  const readingWidth = capped && (/\btext-center\b/.test(className ?? '') ? 'mx-auto max-w-[70ch]' : 'max-w-[70ch]')

  const combinedClassName = cn(
    sizeClasses[size],
    weightClasses[weight],
    leading && leadingClasses[leading],
    colorResolved.className,
    element !== 'label' && 'select-text',
    noWrap && 'whitespace-nowrap overflow-hidden text-ellipsis',
    'font-sans',
    readingWidth,
    className,
  )

  const style = React.useMemo(
    () => ({ color: colorResolved.style, backgroundColor }),
    [colorResolved.style, backgroundColor],
  )

  if (element === 'label') {
    return (
      <Label
        ref={ref as React.Ref<HTMLLabelElement>}
        htmlFor={htmlFor}
        className={combinedClassName}
        style={style}
        {...props}
      >
        {children}
      </Label>
    )
  }

  return React.createElement(element, { ref, htmlFor, className: combinedClassName, style, ...props }, children)
})
