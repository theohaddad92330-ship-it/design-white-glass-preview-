import { Box, Button, TableHead, cn } from '@bellum/ui'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { getSortDirection, getSortField, toggleSort, type SortField, type SortKey } from './types'

type SortableTableHeadProps = {
  label: string
  field: SortField
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
  className?: string
  align?: 'left' | 'right'
  /** Une commande posée AVANT le libellé, dans la même cellule d'entête — la
   *  case « tout sélectionner » du portefeuille. Elle vit ici et non dans une
   *  sixième colonne : ajouter une colonne au tableau décalerait le squelette,
   *  la largeur minimale et les cinq cellules du corps, alors que la case
   *  appartient visuellement à la colonne qu'elle sélectionne. Elle reste HORS
   *  du bouton de tri : cocher ne doit pas trier. */
  leading?: ReactNode
}

/** Linear-style clickable header — toggles ascending/descending sort on the field. */
export function SortableTableHead({
  label,
  field,
  sortKey,
  onSortKeyChange,
  className,
  align = 'left',
  leading,
}: SortableTableHeadProps) {
  const isActive = getSortField(sortKey) === field
  const direction = isActive ? getSortDirection(sortKey) : null
  const Arrow = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : undefined

  return (
    <TableHead className={cn('h-11 text-sm font-medium text-[var(--bellum-text-muted)]', className)}>
      <Box display="flex" className="min-w-0 items-center gap-3">
        {leading}
        <Button
          variant="ghost"
          size="xs"
          icon={Arrow}
          iconPosition={align === 'right' ? 'right' : 'left'}
          iconClassName="size-3.5"
          onClick={() => onSortKeyChange(toggleSort(field, sortKey))}
          // `min-h-11` au DOIGT seulement : trier une colonne est un geste
          // courant, et un bouton de 28 px se rate. Sur un écran pointé à la
          // souris, la densité de l'entête reste celle qu'elle était — la règle
          // des 44 px vient du doigt, pas de la taille de la fenêtre.
          className={cn(
            '-mx-2 text-[var(--bellum-text-muted)] pointer-coarse:min-h-11',
            isActive && 'text-[var(--bellum-text-primary)]',
          )}
        >
          {label}
        </Button>
      </Box>
    </TableHead>
  )
}
