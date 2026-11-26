import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'

import { cn } from '../lib/utils'

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-2', className)} {...props} />
}

/**
 * Théo DS §2.8 — deux formes d'onglets.
 *
 * - `segmented` (défaut, inchangé) : le basculeur en pastilles, pour un choix de
 *   VUE à deux ou trois positions.
 * - `underline` : l'onglet de Théo V22 — une ligne basse de 1 px, l'onglet actif
 *   en texte accent souligné de 2 px `--primary`. Pour les SECTIONS d'une page.
 *
 * Le style vit sur la liste (`data-variant`) et les déclencheurs le lisent par
 * `group-data-[variant=…]/tabs-list` : un seul endroit à changer.
 */
function TabsList({
  className,
  variant = 'segmented',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & { variant?: 'segmented' | 'underline' }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        'group/tabs-list text-muted-foreground inline-flex w-fit items-center data-[variant=segmented]:bg-muted data-[variant=segmented]:h-9 data-[variant=segmented]:justify-center data-[variant=segmented]:rounded-lg data-[variant=segmented]:p-[3px] data-[variant=underline]:gap-6 data-[variant=underline]:border-b data-[variant=underline]:border-[var(--bellum-border)]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * ⚠️ #1882 — L'IMPORTANT N'EST PAS UNE FACILITÉ, IL EST LA SEULE ISSUE.
 *
 * Mesuré en production le 11/09/2026, APRÈS le premier correctif : la classe
 * `min-w-min` était bien posée, sa règle bien générée — et `getComputedStyle`
 * rendait quand même `min-width: 0px`. « Recrutements » débordait encore
 * (scrollWidth 84 contre clientWidth 76).
 *
 * La cause : `index.css` pose `:where(.flex, …) > * { min-width: 0 }` HORS
 * couche, et un style hors `@layer` bat TOUT ce qui vit dans une couche, quelle
 * que soit sa spécificité. Les utilitaires Tailwind étant dans `@layer
 * utilities`, `min-w-min` ne pouvait pas gagner — sa spécificité supérieure n'y
 * changeait rien.
 *
 * Vérifié en direct dans le navigateur : forcer la priorité fait passer
 * l'onglet de 76 à 108 px et `scrollWidth === clientWidth`. L'alternative —
 * déplacer la règle globale dans une couche — toucherait la protection contre
 * les débordements horizontaux de TOUT le dépôt ; elle se décide, elle ne se
 * glisse pas dans un correctif d'onglet.
 *
 * ⚠️ Aucun test en jsdom ne pouvait voir ça : jsdom ne calcule pas les couches
 * ni la cascade. Seule une mesure dans un vrai navigateur le dit.
 *
 * #1882 — `min-w-min` n'est pas une décoration : c'est le plancher que `flex-1`
 * SUPPOSE, et que ce dépôt retire partout.
 *
 * `flex-1` vaut `flex: 1 1 0%` : base zéro, part égale. En amont (shadcn) rien
 * ne casse, parce qu'un enfant de flex a `min-width: auto` — sa taille minimale
 * automatique est celle de son contenu, et c'est ce plancher qui empêche la part
 * égale de descendre sous le libellé. `apps/web/src/index.css:213` le met à zéro
 * pour TOUS les enfants de flex et de grid (`min-width: auto` est la cause n°1
 * de débordement horizontal responsive) ; sa spécificité est nulle exprès, pour
 * qu'une classe explicite l'emporte — encore faut-il l'écrire.
 *
 * Sans elle, mesuré en production le 11/09/2026 sur la barre de filtres de la
 * veille : cinq boutons de 77,7 px pour des libellés de 92,5 et 83,6 px, et
 * `whitespace-nowrap` juste à côté qui interdit de replier. Le texte sortait de
 * sa boîte et se posait sur celle du voisin. Le même défaut avait déjà été
 * mesuré le 31/08/2026 sur la fiche d'un talent (dix onglets superposés) et
 * contourné à l'écran, pas ici — voir `TalentDetailPage.tsx`. Garde GA-290.
 */
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] !min-w-min flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Théo DS §2.8 — forme `underline` : pas de pastille, un trait bas de 2 px
        // sous l'onglet actif, texte accent ; au repos, texte secondaire.
        'group-data-[variant=underline]/tabs-list:h-auto group-data-[variant=underline]/tabs-list:flex-none group-data-[variant=underline]/tabs-list:-mb-px group-data-[variant=underline]/tabs-list:rounded-none group-data-[variant=underline]/tabs-list:border-0 group-data-[variant=underline]/tabs-list:border-b-2 group-data-[variant=underline]/tabs-list:border-transparent group-data-[variant=underline]/tabs-list:px-0 group-data-[variant=underline]/tabs-list:pb-3 group-data-[variant=underline]/tabs-list:pt-1 group-data-[variant=underline]/tabs-list:text-[var(--bellum-text-secondary)] group-data-[variant=underline]/tabs-list:hover:text-[var(--bellum-text-primary)] group-data-[variant=underline]/tabs-list:data-[state=active]:border-[var(--bellum-primary)] group-data-[variant=underline]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=underline]/tabs-list:data-[state=active]:text-[var(--bellum-text-accent)] group-data-[variant=underline]/tabs-list:data-[state=active]:shadow-none dark:group-data-[variant=underline]/tabs-list:data-[state=active]:border-[var(--bellum-primary)] dark:group-data-[variant=underline]/tabs-list:data-[state=active]:bg-transparent dark:group-data-[variant=underline]/tabs-list:data-[state=active]:text-[var(--bellum-text-accent)]',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
