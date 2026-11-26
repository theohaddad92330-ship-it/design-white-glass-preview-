import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Avatar, AvatarFallback, AvatarImage } from './avatar'
import { cn } from '../lib/utils'

const entityAvatarVariants = cva('border border-transparent text-black shadow-xs', {
  variants: {
    size: {
      // #1417.4 — 32 px (`size-8`), la borne haute de la fourchette 30-32 que le
      // retour demandait. ⚠️ TROISIÈME valeur de ce cran : 36 px à l'origine,
      // réduit à 28 px par un lot qui visait « 30-32 » et a visé trop bas, puis
      // 32 px ici. La garde `avatar-scale.test.ts` épingle l'échelle pour qu'un
      // quatrième aller-retour demande une décision explicite.
      xs: 'size-8 text-xs',
      sm: 'size-9 text-xs',
      md: 'size-11 text-sm',
      lg: 'size-16 text-lg',
    },
    shape: {
      circle: 'rounded-full',
      square: 'rounded-md',
    },
  },
  defaultVariants: {
    size: 'md',
    shape: 'circle',
  },
})

const AVATAR_PALETTE = [
  'bg-[var(--bellum-primary-100)] dark:bg-[var(--bellum-primary-300)]',
  'bg-amber-100 dark:bg-amber-500',
  'bg-emerald-100 dark:bg-emerald-500',
  'bg-sky-100 dark:bg-sky-500',
  'bg-rose-100 dark:bg-rose-500',
] as const

type EntityAvatarProps = React.ComponentProps<typeof Avatar> &
  VariantProps<typeof entityAvatarVariants> & {
    name: string | null | undefined
    src?: string | null
    fallback?: string
  }

function pickAvatarTone(name: string | null | undefined) {
  const cleanName = name?.trim()
  if (!cleanName) {
    return AVATAR_PALETTE[0]
  }

  let hash = 0
  for (let index = 0; index < cleanName.length; index += 1) {
    hash = cleanName.charCodeAt(index) + ((hash << 5) - hash)
  }

  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length]!
}

function getAvatarFallback(name: string | null | undefined, fallback?: string) {
  if (fallback) {
    return fallback.slice(0, 2).toUpperCase()
  }

  const cleanName = name?.trim()
  if (!cleanName) {
    return '?'
  }

  const parts = cleanName.split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}

export function EntityAvatar({ name, src, fallback, size, shape, className, ...props }: EntityAvatarProps) {
  return (
    <Avatar
      className={cn(
        entityAvatarVariants({ size, shape }),
        'bg-[var(--bellum-border)] dark:bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)]',
        className,
      )}
      {...props}
    >
      {src && <AvatarImage src={src} alt={name ?? ''} />}
      <AvatarFallback className="rounded-[inherit] bg-transparent text-current font-semibold uppercase tracking-normal">
        {getAvatarFallback(name, fallback)}
      </AvatarFallback>
    </Avatar>
  )
}

export { entityAvatarVariants }
export type { EntityAvatarProps }
