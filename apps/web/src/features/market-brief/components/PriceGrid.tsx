import type { MarketBrief } from '@bellum/contracts'
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCount } from '@/lib/locale'

type PriceGridData = NonNullable<MarketBrief['price_grid']>
type PriceRow = PriceGridData['rows'][number]
type Cell = NonNullable<PriceRow['junior']>

/** Même seuil que le contrôle PRICE_CELL_UNDERSAMPLED du contrat : n < 3 ⇒ cellule absente. */
const MIN_CELL_SAMPLE = 3

const LEVELS = ['junior', 'confirmed', 'senior'] as const

function readableCell(cell: Cell | undefined): Cell | null {
  return cell && cell.n >= MIN_CELL_SAMPLE ? cell : null
}

/**
 * Grille de prix d'un marché : métier × séniorité. Une cellule sans échantillon
 * suffisant est « non mesuré » — jamais 0, jamais un prix interpolé. La période
 * et la source s'écrivent toujours ; le garde-fou de concentration est collé
 * sous le tableau (un prix sans sa limite se lit comme un fait de marché).
 * Sous 768 px : une carte par métier.
 */
export function PriceGrid({ grid }: { grid: PriceGridData }) {
  const { t } = useTranslation('marketBrief')
  const amount = (cell: Cell) => t('priceGrid.amount', { amount: formatCount(cell.amount), currency: grid.currency })
  const top = grid.top_client
  const percent = top && grid.sample_size > 0 ? Math.round((top.n / grid.sample_size) * 100) : null

  return (
    <Card data-testid="market-price-grid" className="min-w-0 p-4">
      <Text element="h3" size="base" weight="semibold">
        {t('priceGrid.title')}
      </Text>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('priceGrid.period', { period: grid.period })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('priceGrid.sample', { count: grid.sample_size })}
        </Text>
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('priceGrid.sourceLabel')} <span>{t(`priceGrid.source.${grid.source_kind}`)}</span>
        </Text>
      </div>

      <div data-testid="market-price-grid-table" className="mt-3 hidden md:block">
        <Table scrollLabel={t('priceGrid.title')}>
          <TableHeader>
            <TableRow>
              <TableHead>{t('priceGrid.columns.family')}</TableHead>
              <TableHead>{t('priceGrid.columns.needs')}</TableHead>
              {LEVELS.map(level => (
                <TableHead key={level}>{t(`priceGrid.columns.${level}`)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grid.rows.map(row => (
              <TableRow key={row.family}>
                <TableCell className="whitespace-normal">{row.family}</TableCell>
                <TableCell>{formatCount(row.needs)}</TableCell>
                {LEVELS.map(level => {
                  const cell = readableCell(row[level])
                  return (
                    <TableCell key={level}>
                      {cell ? (
                        <>
                          <Text size="sm" weight="medium">
                            {amount(cell)}
                          </Text>
                          <Text size="xs" className="text-[var(--bellum-text-muted)]">
                            {t('priceGrid.cellN', { n: cell.n })}
                          </Text>
                        </>
                      ) : (
                        <Text size="sm" className="text-[var(--bellum-text-muted)]">
                          {t('priceGrid.notMeasured')}
                        </Text>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="mt-3 flex flex-col gap-3 md:hidden">
        {grid.rows.map(row => (
          <li
            key={row.family}
            data-testid="market-price-grid-card"
            className="min-w-0 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3"
          >
            <Text size="sm" weight="semibold">
              {row.family}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('priceGrid.needsCount', { count: row.needs })}
            </Text>
            <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LEVELS.map(level => {
                const cell = readableCell(row[level])
                return (
                  <div key={level} className="min-w-0">
                    <dt>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        {t(`priceGrid.columns.${level}`)}
                      </Text>
                    </dt>
                    <dd>
                      {cell ? (
                        <>
                          <Text size="sm" weight="medium">
                            {amount(cell)}
                          </Text>
                          <Text size="xs" className="text-[var(--bellum-text-muted)]">
                            {t('priceGrid.cellN', { n: cell.n })}
                          </Text>
                        </>
                      ) : (
                        <Text size="sm" className="text-[var(--bellum-text-muted)]">
                          {t('priceGrid.notMeasured')}
                        </Text>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </li>
        ))}
      </ul>

      {top ? (
        <div
          data-testid="market-price-grid-concentration"
          role="note"
          className="mt-3 min-w-0 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-3"
        >
          <Text size="sm">
            {t('priceGrid.concentration', {
              client: top.name,
              count: top.n,
              formatted: formatCount(top.n),
              total: formatCount(grid.sample_size),
              percent: percent === null ? '' : percent,
            })}
          </Text>
        </div>
      ) : null}
    </Card>
  )
}
