'use client'

import * as React from 'react'
import { CheckIcon } from 'lucide-react'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'

import { cn } from '../lib/utils'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        // structure
        'peer relative flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-colors outline-none cursor-pointer',
        // hit zone élargie pour mobile/tactile — invisible (after:content-['']
        // sans contenu visible), donc la case affichée reste size-4.
        // pointer-coarse: garantit 44×44 sous le doigt (GA-30/32) ; la
        // souris garde une extension plus modeste.
        "after:absolute after:content-[''] after:-inset-x-3 after:-inset-y-2 pointer-coarse:after:-inset-x-3.5 pointer-coarse:after:-inset-y-3.5",
        // focus — brand accent, aligned with Switch and Input focus rings
        'focus-visible:border-[var(--bellum-primary-500)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--bellum-primary-500)_35%,transparent)]',
        // checked state — brand accent, flat and restrained
        'data-[state=checked]:border-[var(--bellum-primary-400)] data-[state=checked]:bg-[var(--bellum-primary-400)] data-[state=checked]:text-white',
        // hover
        'hover:border-[color-mix(in_srgb,var(--bellum-primary-300)_60%,transparent)] data-[state=checked]:hover:bg-[var(--bellum-primary-300)]',
        // disabled
        'disabled:cursor-not-allowed disabled:opacity-50',
        // erreur (form)
        'aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
