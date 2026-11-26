'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '../lib/utils'

type SwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}

/**
 * Toggle on/off — wrapper Radix avec couleurs explicites pour rester
 * visible sur les surfaces sombres BellumAI.
 *
 * Note Tailwind : Radix expose l'état via `data-state="checked"` /
 * `data-state="unchecked"`. La syntaxe TW3 pour cibler ces attributs
 * est `data-[state=checked]:` (la forme `data-checked:` n'existe que
 * sous TW4 → ne compile pas ici).
 */
function Switch({ className, size = 'default', ...props }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        // structure
        'peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none cursor-pointer',
        // hit zone élargie pour mobile/tactile
        // Zone tactile ≥ 44 px au doigt (GA-35) : sans `content-['']` le ::after ne
        // génère AUCUNE boîte — l'ancienne extension ne s'appliquait à rien (même
        // défaut que `checkbox.tsx`). 20 px + 2 × 12 px = 44 px sous pointer-coarse.
        "after:absolute after:content-[''] after:-inset-x-3 after:-inset-y-2 pointer-coarse:after:-inset-y-3",
        // focus
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
        // tailles
        'data-[size=default]:h-[20px] data-[size=default]:w-[34px]',
        'data-[size=sm]:h-[14px] data-[size=sm]:w-[24px]',
        // Théo DS §2.13 — piste au repos `--border2` (plus lisible que `--border`), cochée `--primary` thématisé.
        'data-[state=checked]:bg-[var(--bellum-primary)] data-[state=unchecked]:bg-[var(--bellum-border-strong)]',
        // disabled
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        // erreur (form)
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow-sm ring-0 transition-transform',
          // taille du thumb (légèrement plus petite que le track)
          'group-data-[size=default]/switch:size-[14px] group-data-[size=sm]/switch:size-[10px]',
          // translation : on => bord droit, off => bord gauche
          'group-data-[size=default]/switch:data-[state=checked]:translate-x-[16px]',
          'group-data-[size=default]/switch:data-[state=unchecked]:translate-x-[2px]',
          'group-data-[size=sm]/switch:data-[state=checked]:translate-x-[12px]',
          'group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-[2px]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
