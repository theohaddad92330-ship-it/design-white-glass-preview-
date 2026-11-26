import {
  Badge,
  Box,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Text,
  cn,
} from '@bellum/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { priorityStyle } from './siteStyles'
import type { SiteRow } from './siteTypes'
import { SITES_TABLE_SHELL, sitesColumnClass } from './sitesTableColumns'

const ROW_CELL =
  'transition-colors group-hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)] group-data-[state=selected]:bg-[color-mix(in_srgb,var(--bellum-text-primary)_7%,transparent)]'

type SitesTableProps = {
  rows: SiteRow[]
  page: number
  totalPages: number
  isFetching: boolean
  onPageChange: (page: number | ((page: number) => number)) => void
  toolbar?: ReactNode
}

export function SitesTable({ rows, page, totalPages, isFetching, onPageChange, toolbar }: SitesTableProps) {
  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]">
      <SitesTableTitle toolbar={toolbar} />
      <div className="max-h-[420px] overflow-y-auto">
        {/* #4612.2 — `table-fixed` + parts (jumeau de `EntitiesGraphCard`) : le tableau tient dans son conteneur. */}
        <Table className={SITES_TABLE_SHELL}>
          <SitesTableHeader />
          <TableBody>
            {rows.length > 0 ? (
              rows.map((row, index) => <SiteTableRow key={`${row.city}-${index}`} row={row} />)
            ) : (
              <EmptyRows />
            )}
          </TableBody>
        </Table>
      </div>
      <SitesPagination page={page} totalPages={totalPages} isFetching={isFetching} onPageChange={onPageChange} />
    </Card>
  )
}

function SitesTableTitle({ toolbar }: { toolbar?: ReactNode }) {
  const { t } = useTranslation('accountSites')
  return (
    <div className="space-y-4 border-b border-[var(--bellum-border)] px-5 py-4">
      <div>
        <Text size="base" weight="semibold">
          {t('table.title')}
        </Text>
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('table.description')}
        </Text>
      </div>
      {toolbar ? <div className="flex flex-wrap gap-3">{toolbar}</div> : null}
    </div>
  )
}

function EmptyRows() {
  const { t } = useTranslation('accountSites')
  return (
    <TableRow>
      <TableCell colSpan={4} className="px-4 py-8">
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('table.empty')}
        </Text>
      </TableCell>
    </TableRow>
  )
}

function SitesTableHeader() {
  const { t } = useTranslation('accountSites')
  return (
    <TableHeader className="sticky top-0 z-10 bg-[var(--bellum-surface-1)]">
      <TableRow className="border-[var(--bellum-border)] max-md:hidden">
        {(
          [
            ['city', t('table.city')],
            ['region', t('table.region')],
            ['type', t('table.type')],
            ['priority', t('table.priority')],
          ] as const
        ).map(([id, header]) => (
          <TableHead key={id} className={cn(sitesColumnClass(id), 'h-11 px-4')}>
            <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
              {header}
            </Text>
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  )
}

function SiteTableRow({ row }: { row: SiteRow }) {
  const { t } = useTranslation()
  const style = priorityStyle(row.priority)
  return (
    <TableRow className="group border-[var(--bellum-border)]">
      <TableCell className={cn(sitesColumnClass('city'), 'h-14 overflow-hidden px-4 py-3', ROW_CELL)}>
        <Box display="flex" className="min-w-0 items-center gap-1.5">
          <Text element="span" size="sm" weight="semibold" className="min-w-0 truncate">
            {row.city}
          </Text>
          {(row.establishments ?? 1) > 1 && (
            <Text element="span" size="xs" className="shrink-0 text-[var(--bellum-text-muted)]">
              {t('accountSites:table.establishmentsCount', { count: row.establishments })}
            </Text>
          )}
          {/* #2966 (#2119.57) — une présence lue par le modèle (jamais le
              registre légal) reste NOMMÉE comme telle : elle ne se lit jamais
              comme un établissement officiel. */}
          {row.source === 'inferred' && (
            <Badge
              variant="outline"
              className="shrink-0 px-1 py-0 text-xs"
              aria-label={t('accountSites:table.inferredHelp')}
            >
              {t('accountSites:table.inferred')}
            </Badge>
          )}
        </Box>
      </TableCell>
      <TableCell className={cn(sitesColumnClass('region'), 'h-14 overflow-hidden px-4 py-3', ROW_CELL)}>
        <Text element="span" size="sm" className="block min-w-0 truncate text-[var(--bellum-text-secondary)]">
          {row.region ?? '-'}
        </Text>
      </TableCell>
      <TableCell className={cn(sitesColumnClass('type'), 'h-14 overflow-hidden px-4 py-3', ROW_CELL)}>
        <Text element="span" size="sm" className="block min-w-0 truncate text-[var(--bellum-text-secondary)]">
          {row.type ?? '-'}
        </Text>
      </TableCell>
      <TableCell className={cn(sitesColumnClass('priority'), 'h-14 overflow-hidden px-4 py-3', ROW_CELL)}>
        <Badge className={cn('inline-flex w-fit items-center justify-center rounded-full px-3 py-0.5', style.pill)}>
          {/* i18n keys: accountSites:priority.haute | accountSites:priority.moyenne | accountSites:priority.basse */}
          {t(style.labelKey)}
        </Badge>
      </TableCell>
    </TableRow>
  )
}

function SitesPagination({ page, totalPages, isFetching, onPageChange }: Omit<SitesTableProps, 'rows'>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--bellum-border)] px-4 py-3">
      <PaginationButton
        disabled={page === 1 || isFetching}
        onClick={() => onPageChange(current => Math.max(1, current - 1))}
        direction="previous"
      />
      <PageNumbers page={page} totalPages={totalPages} isFetching={isFetching} onPageChange={onPageChange} />
      <PaginationButton
        disabled={page === totalPages || isFetching}
        onClick={() => onPageChange(current => Math.min(totalPages, current + 1))}
        direction="next"
      />
    </div>
  )
}

function PaginationButton({
  disabled,
  onClick,
  direction,
}: {
  disabled: boolean
  onClick: () => void
  direction: 'previous' | 'next'
}) {
  const { t } = useTranslation()
  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={disabled} className="gap-1 active:scale-[0.98]">
      {direction === 'previous' ? <ChevronLeft className="size-3.5" /> : null}
      {direction === 'previous' ? t('common:actions.previous') : t('common:actions.next')}
      {direction === 'next' ? <ChevronRight className="size-3.5" /> : null}
    </Button>
  )
}

function PageNumbers({ page, totalPages, isFetching, onPageChange }: Omit<SitesTableProps, 'rows'>) {
  return (
    <div className="flex items-center gap-1">
      {pageWindow(page, totalPages).map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1 text-xs text-[var(--bellum-text-muted)]">
            ...
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            disabled={isFetching}
            className={cn(
              'h-7 min-w-7 rounded-md px-2 text-xs font-medium transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)] active:scale-[0.98]',
              item === page
                ? 'bg-[var(--bellum-surface-2)] text-[var(--bellum-text-primary)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_16%,transparent)] dark:text-[var(--bellum-primary-300)]'
                : 'text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-bg-lighter)]',
            )}
          >
            {item}
          </button>
        ),
      )}
    </div>
  )
}

function pageWindow(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages = new Set([1, total, current - 1, current, current + 1].filter(page => page > 0 && page <= total))
  return Array.from({ length: total }, (_, index) => index + 1)
    .filter(page => pages.has(page))
    .reduce<(number | 'ellipsis')[]>((acc, page) => {
      if (acc.length > 0 && typeof acc[acc.length - 1] === 'number' && page - (acc[acc.length - 1] as number) > 1)
        acc.push('ellipsis')
      acc.push(page)
      return acc
    }, [])
}
