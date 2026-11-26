import * as React from 'react'
import { cn } from '../lib/utils'
import {
  HORIZONTAL_OVERSCROLL_CLASS,
  scrollEdgeClass,
  scrollRegionProps,
  useHorizontalOverflow,
} from '../hooks/use-horizontal-overflow'

type TableProps = React.HTMLAttributes<HTMLTableElement> & {
  /**
   * Le nom de la zone défilante, lu par un lecteur d'écran quand le tableau
   * déborde vraiment. Sans lui, la zone reste ATTEIGNABLE (elle prend le focus)
   * mais ne se déclare pas `region` : une région sans nom est ignorée des
   * technologies d'assistance, l'annoncer serait se donner raison à vide.
   */
  scrollLabel?: string
  /** Classes de la zone qui défile (pas du `<table>`) — ex. sa barre toujours visible (#4337.1). */
  viewportClassName?: string
}

/**
 * Un tableau, et son conteneur défilant.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUI A CHANGÉ, ET CE QUE ÇA CORRIGE (30/08/2026, GA-119)
 * ─────────────────────────────────────────────────────────────────────────
 * Ce `<div>` était déjà le conteneur qui défile pour les quatorze tableaux du
 * produit. Il n'avait ni tabulation, ni rôle, ni nom : la dernière colonne d'un
 * tableau large était à l'écran, hors du cadre, et **aucune touche du clavier
 * ne l'amenait**. Un `<div>` qui défile sans `tabIndex` n'est atteignable qu'à
 * la souris ou au doigt.
 *
 * Trois gestes, et pas un de plus :
 *
 *  - `tabIndex={0}` **quand il déborde vraiment**. Le poser inconditionnellement
 *    ajouterait un arrêt clavier sur chaque tableau du produit, y compris ceux
 *    où il n'y a rien à atteindre — un défaut d'accessibilité à son tour.
 *  - `role="region"` + `aria-label`, uniquement si l'appelant a nommé la zone.
 *  - une ombre intérieure sur le bord qui CACHE encore quelque chose. La barre
 *    de défilement existe (6 px, `index.css`) mais elle est rendue tout en bas
 *    du tableau : sur vingt-cinq lignes, il faut descendre jusqu'à la dernière
 *    pour découvrir qu'on pouvait aller à droite. L'ombre, elle, est peinte sur
 *    la boîte VISIBLE — elle reste au bord quelle que soit la position.
 *
 * ⚠️ `overflow-x: auto` force `overflow-y` à `auto` (CSS Overflow §3 : deux axes
 * ne peuvent pas être l'un `visible` et l'autre non). Un conteneur qui défile
 * horizontalement est donc TOUJOURS un conteneur défilant vertical aussi — d'où
 * `overflow-auto`, qui dit la vérité, plutôt qu'un `overflow-x-auto` qui
 * laisserait croire à un axe unique. La conséquence — deux conteneurs défilants
 * imbriqués sur les écrans qui posent déjà leur propre boîte bornée — est
 * mesurée et parquée (D338), elle ne se corrige pas ici.
 */
const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, scrollLabel, viewportClassName, ...props }, ref) => {
    const { ref: viewportRef, overflowing, start, end } = useHorizontalOverflow<HTMLDivElement>()
    return (
      <div
        ref={viewportRef}
        {...scrollRegionProps(overflowing, scrollLabel)}
        className={cn(
          // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
          'relative w-full overflow-auto',
          HORIZONTAL_OVERSCROLL_CLASS,
          overflowing &&
            'outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-text-accent)] focus-visible:ring-offset-0',
          scrollEdgeClass(start, end),
          viewportClassName,
        )}
      >
        <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
      </div>
    )
  },
)
Table.displayName = 'Table'

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => <thead ref={ref} className={cn('', className)} {...props} />,
)
TableHeader.displayName = 'TableHeader'

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  ),
)
TableBody.displayName = 'TableBody'

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot ref={ref} className={cn(' bg-muted/50 font-medium [&>tr]:last:border-b-0', className)} {...props} />
  ),
)
TableFooter.displayName = 'TableFooter'

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    // Théo DS §2.7 — survol de ligne `--v22-hover` (#202027 en sombre, ≠ du creux).
    <tr
      ref={ref}
      className={cn('border-b transition-colors hover:bg-[var(--bellum-row-hover)]', className)}
      {...props}
    />
  ),
)
TableRow.displayName = 'TableRow'

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        // Théo DS §2.7 — `th` 12 px `--muted` sur `--surface2`. Le muted de Théo y échouait AA
        // (4,17:1) ; le jeton corrigé (#6c6d7e, tokens.css) y fait 4,55:1.
        'h-10 bg-[var(--bellum-surface-2)] px-2 text-left align-middle text-xs font-medium text-[var(--bellum-text-muted)] [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
        className,
      )}
      {...props}
    />
  ),
)
TableHead.displayName = 'TableHead'

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td
      ref={ref}
      className={cn('p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]', className)}
      {...props}
    />
  ),
)
TableCell.displayName = 'TableCell'

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption ref={ref} className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  ),
)
TableCaption.displayName = 'TableCaption'

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow }
