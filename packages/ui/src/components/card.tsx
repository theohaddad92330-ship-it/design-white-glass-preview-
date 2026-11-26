import * as React from 'react'

import { cn } from '../lib/utils'

/**
 * La carte — la surface la plus répandue du produit (290 usages).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TROIS CORRECTIONS DU 01/09/2026, toutes issues de la mesure du dépôt.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * 1. `dark:bg-neutral-900` A ÉTÉ RETIRÉ. C'était un gris de la palette
 *    Tailwind (#171717) qui écrasait `bg-card`, c'est-à-dire le token que le
 *    thème définit pour cette surface (#18181B aujourd'hui, #1C1C19 avant la
 *    rampe neutre). Conséquence pendant des mois : **les 290 cartes du
 *    produit rendaient en sombre une couleur que le système de thème n'avait
 *    jamais décidée**, et aucune garde ne pouvait le voir — elles vérifient
 *    les tokens, et le token était juste. C'est la classe qui mentait.
 *
 * 2. `ring-foreground/10` devient `ring-border`. Le liseré se déduisait de la
 *    couleur du TEXTE à 10 % : il changeait de teinte à chaque retouche de
 *    `--foreground`, sans que personne ne l'ait demandé. Il porte maintenant
 *    le token de bordure, comme tous les autres traits du produit.
 *
 * 3. `shadow-sm` a été retiré. Sur le fond blanc (décision « FA »), une carte
 *    se tient par sa BORDURE — c'est le contrat de cette DA. Une ombre en
 *    plus du trait, c'est deux signaux pour un seul objet, et c'est ce qui
 *    faisait « flotter » les cartes sans qu'elles se détachent pour autant.
 *
 * Théo DS §2.5 (22/10/2026) — rayon de carte 18 px (`rounded-card`). Toujours
 * SANS ombre au repos : Théo n'en pose plus dans ses strates récentes (relevé §1.5),
 * le fond de page gris teinté suffit à détacher la carte blanche.
 */
function Card({ className, size = 'default', ...props }: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-card bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-border [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-card *:[img:last-child]:rounded-b-card',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-card px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('cn-font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-(--card-spacing)', className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center rounded-b-card border-t bg-muted/50 p-(--card-spacing)', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
