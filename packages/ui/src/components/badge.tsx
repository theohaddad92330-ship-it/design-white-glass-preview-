import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '../lib/utils'

const badgeVariants = cva(
  // Théo DS §2.3 — le badge n'est plus une pilule : rayon 6 px (`rounded-badge`),
  // aplat opaque `--<ton>-soft-bg` et texte `--<ton>-soft-text` (AA dans les deux
  // thèmes, `contrast.test.ts`). Correspondance des noms de Théo : purple →
  // `primary`, green → `success`, amber → `warning`, red → `danger`, blue → `info`.
  //
  // `whitespace-nowrap` : un badge est mono-ligne par construction. Du temps de
  // la pilule `rounded-full`, un texte qui passait à
  // la ligne ne produisait pas une pilule plus haute mais un ovale bombé. Le
  // retour à la ligne se déclenche sur la LARGEUR DISPONIBLE, pas sur la
  // longueur du libellé : dans une cellule étroite, le badge est le dernier
  // élément à être écrasé. Verrouillé par `pill-single-line.test.tsx`.
  //
  // #1608, #1631.7 — `w-fit` : une pilule ne s'ÉTIRE pas non plus, et
  // `inline-flex` ne suffit pas à l'en empêcher. Un enfant de conteneur flex
  // est BLOCKIFIÉ par la spécification (`inline-flex` devient `flex`) ; dans un
  // parent en colonne, l'étirement du deuxième axe lui donne alors toute la
  // largeur. Mesuré en production le 08/09/2026 sur deux cartes livrées la
  // veille : 1 174 px pour 194 px de texte sur l'onglet Accès, 489 px sur
  // l'onglet Sites — dans les deux cas la pilule se lisait comme un champ de
  // saisie vide. L'étirement ne s'applique que si la taille du deuxième axe
  // vaut `auto` : `width: fit-content` le désarme. Posé ici, sur le composant
  // partagé, plutôt qu'aux deux appelants — la carte suivante en colonne
  // aurait reproduit la forme. Un appelant qui veut une largeur explicite la
  // pose et gagne : `cn` passe par `tailwind-merge`, qui sait que `size-*` et
  // `w-*` sont en conflit et garde la dernière (témoin dans la garde).
  'inline-flex w-fit items-center whitespace-nowrap rounded-badge border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        /* Neutral default */
        default: 'border-transparent bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)]',
        /* Subtle primary accent — for "active", "new", counts */
        primary: 'border-transparent bg-[var(--accent-soft-bg)] text-[var(--accent-soft-text)]',
        /* Status variants — Théo DS §1.1 : aplats `-bg` opaques */
        success: 'border-transparent bg-[var(--success-soft-bg)] text-[var(--success-soft-text)]',
        warning: 'border-transparent bg-[var(--warning-soft-bg)] text-[var(--warning-soft-text)]',
        danger: 'border-transparent bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
        info: 'border-transparent bg-[var(--info-soft-bg)] text-[var(--info-soft-text)]',
        /* Outlined */
        outline: 'border-[var(--bellum-border)] bg-transparent text-foreground',
        /* Destructive (shadcn compat) */
        destructive: 'border-transparent bg-[var(--danger-soft-bg)] text-[var(--danger-soft-text)]',
        /* Secondary (shadcn compat) */
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
