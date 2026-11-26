import { PAGE_GUTTER_MX } from '@/components/page/page-gutter'
import { AccountPortfolioCard } from './AccountPortfolioCard'
import type { AccountRow } from './types'

/**
 * Refonte Théo — la vue « Cartes » du portefeuille (bascule Tableau / Cartes de la barre) : les MÊMES
 * lignes, les mêmes filtres, la même pagination que le tableau, rendues avec la carte de l'étagère
 * « Reprendre le fil » (`AccountPortfolioCard`, écrite une fois).
 */
export function AccountsCardGrid({ rows }: { rows: readonly AccountRow[] }) {
  return (
    <ul data-testid="accounts-card-grid" className={`grid gap-3 md:grid-cols-2 xl:grid-cols-3 ${PAGE_GUTTER_MX}`}>
      {rows.map(row => (
        <AccountPortfolioCard key={row.id} row={row} />
      ))}
    </ul>
  )
}
