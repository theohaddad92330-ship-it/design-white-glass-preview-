import * as React from 'react'
import { cn } from '../lib/utils'

type BoxProps = {
  /** HTML element to render */
  as?: 'div' | 'section' | 'article' | 'aside' | 'main' | 'header' | 'footer' | 'nav'
  /** Tailwind padding class token (e.g. 4 = p-4) */
  p?: number | string
  px?: number | string
  py?: number | string
  pt?: number | string
  pb?: number | string
  pl?: number | string
  pr?: number | string
  /** Tailwind margin class token */
  m?: number | string
  mx?: number | string
  my?: number | string
  mt?: number | string
  mb?: number | string
  /** Border radius */
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Background color (Tailwind class without "bg-" prefix, e.g. "white", "gray-100") */
  bg?: string
  /** Display */
  display?: 'block' | 'flex' | 'inline' | 'inline-flex' | 'grid' | 'inline-block' | 'hidden'
  className?: string
  children?: React.ReactNode
  style?: React.CSSProperties
  onClick?: React.MouseEventHandler<HTMLElement>
  onMouseEnter?: React.MouseEventHandler<HTMLElement>
  onMouseLeave?: React.MouseEventHandler<HTMLElement>
  role?: string
  /** Ancre (`#id`) — #4016.6d : une ligne d'historique visée par un lien. */
  id?: string
  'data-slot'?: string
  'data-state'?: string
  [key: `data-${string}`]: unknown
}

function spacingClass(prefix: string, value?: number | string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'number') return `${prefix}-${value}`
  return `${prefix}-[${value}]`
}

/**
 * Box — a generic layout primitive.
 *
 * Provides a declarative API for padding, margin, border-radius, background,
 * and display using Tailwind tokens.
 *
 * @example
 * <Box p={4} rounded="lg" bg="white">
 *   Content
 * </Box>
 */
export const Box = React.forwardRef<HTMLElement, BoxProps>(function Box(
  {
    as: Component = 'div',
    p,
    px,
    py,
    pt,
    pb,
    pl,
    pr,
    m,
    mx,
    my,
    mt,
    mb,
    rounded,
    bg,
    display,
    className,
    children,
    ...props
  },
  ref,
) {
  return React.createElement(
    Component,
    {
      ref,
      className: cn(
        spacingClass('p', p),
        spacingClass('px', px),
        spacingClass('py', py),
        spacingClass('pt', pt),
        spacingClass('pb', pb),
        spacingClass('pl', pl),
        spacingClass('pr', pr),
        spacingClass('m', m),
        spacingClass('mx', mx),
        spacingClass('my', my),
        spacingClass('mt', mt),
        spacingClass('mb', mb),
        rounded && `rounded-${rounded}`,
        bg && `bg-${bg}`,
        display,
        className,
      ),
      ...props,
    },
    children,
  )
})

export type { BoxProps }
