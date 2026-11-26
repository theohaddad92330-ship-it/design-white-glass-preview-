import { Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ACCOUNTS_TABLE_CLASS } from './accountsTableShell'
import { SELECT_CELL } from './selection'

const COL_HEAD = 'h-10 bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-muted)]'
const ROW_CELL = 'border-b border-[var(--bellum-border)] py-4'
const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4]

/** Loading skeleton matching the structure of `AccountsTable`. */
export function AccountsTableSkeleton() {
  const { t } = useTranslation('accounts')
  return (
    // ⚠️ Le squelette porte les MÊMES colonnes que `AccountsTable` (refonte Théo : sept), aux mêmes
    // largeurs, et masque les mêmes sous 768 px — « le squelette occupe exactement la place du bloc
    // final » (tome 7 §18.1). GA-29 compte les paires : une entête sans sa cellule décalerait les
    // colonnes suivantes sous leurs mauvais libellés, juste avant l'arrivée des données.
    <div className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
      <Table className={ACCOUNTS_TABLE_CLASS}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(COL_HEAD, 'w-auto pl-4 md:w-64 md:pl-5')}>
              <div className="flex min-w-0 items-center gap-3">
                <div className={SELECT_CELL}>
                  <Skeleton className="size-4 rounded" />
                </div>
                <span>{t('table.company')}</span>
              </div>
            </TableHead>
            <TableHead className={cn(COL_HEAD, 'hidden w-64 md:table-cell')}>{t('table.subject')}</TableHead>
            <TableHead className={cn(COL_HEAD, 'hidden w-32 md:table-cell')}>{t('table.relation')}</TableHead>
            <TableHead className={cn(COL_HEAD, 'hidden w-28 md:table-cell')}>{t('table.people')}</TableHead>
            <TableHead className={cn(COL_HEAD, 'hidden w-28 md:table-cell')}>{t('table.owner')}</TableHead>
            <TableHead className={cn(COL_HEAD, 'w-40 min-w-40')}>{t('table.interest')}</TableHead>
            <TableHead className={cn(COL_HEAD, 'w-20 pr-4 text-right')}>
              <span className="sr-only">{t('table.rowActions')}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {PLACEHOLDER_ROWS.map(i => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell className={cn(ROW_CELL, 'pl-4 md:pl-5')}>
                {/* La case de sélection occupe la MÊME place : sans elle, l'arrivée des données
                    décalerait le nom de 32 px. */}
                <div className="flex items-center gap-3">
                  <div className={SELECT_CELL}>
                    <Skeleton className="size-4 rounded" />
                  </div>
                  <Skeleton className="size-8 rounded-control" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
              </TableCell>
              <TableCell className={cn(ROW_CELL, 'hidden md:table-cell')}>
                <Skeleton className="h-3 w-40 rounded" />
                <Skeleton className="mt-2 h-3 w-28 rounded" />
              </TableCell>
              <TableCell className={cn(ROW_CELL, 'hidden md:table-cell')}>
                <Skeleton className="h-6 w-20 rounded-badge" />
              </TableCell>
              <TableCell className={cn(ROW_CELL, 'hidden md:table-cell')}>
                <Skeleton className="h-6 w-16 rounded-full" />
              </TableCell>
              <TableCell className={cn(ROW_CELL, 'hidden md:table-cell')}>
                <Skeleton className="h-5 w-16 rounded-full" />
              </TableCell>
              <TableCell className={ROW_CELL}>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="mt-2 h-3 w-16 rounded" />
              </TableCell>
              {/* Le « … » de fin de ligne : visible AUSSI sous 768 px, comme dans le tableau final. */}
              <TableCell className={cn(ROW_CELL, 'pr-4 text-right')}>
                <Skeleton className="ml-auto size-7 rounded-control" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
