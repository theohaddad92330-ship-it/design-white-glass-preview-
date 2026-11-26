import { readFilterList, writeFilterList } from '@/features/accounts/lib/portfolioFilters'
import { TabNav, type TabNavItem } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

const PORTFOLIO_TABS = ['all', 'favorites', 'followed', 'archives'] as const
export type PortfolioTab = (typeof PORTFOLIO_TABS)[number]

/**
 * Refonte Théo (comptes-liste) — les QUATRE onglets du portefeuille : Tout le portefeuille · Favoris · Suivis ·
 * Archives. Chacun est un vrai onglet qui n'affiche que son contenu :
 *  · Favoris → les comptes que TU as épinglés (`favorite=mine`) ;
 *  · Suivis → ce que tu suis explicitement (3 au plus, #4267) — la liste de suivi, pas un filtre ;
 *  · Archives → les comptes archivés (`status=archived`).
 * Sans compteur, volontairement : la liste est paginée, un compteur dérivé des lignes chargées mentirait.
 */
export function AccountsPortfolioTabs({
  active,
  onChange,
}: {
  active: PortfolioTab
  onChange: (tab: PortfolioTab) => void
}) {
  const { t } = useTranslation('accounts')
  const tabs: TabNavItem[] = PORTFOLIO_TABS.map(key => ({ key, label: t(`portfolioTabs.${key}`) }))
  return (
    <TabNav
      tabs={tabs}
      activeTab={active}
      onTabChange={key => onChange(key as PortfolioTab)}
      size="sm"
      variant="pill"
    />
  )
}

/** L'onglet que l'URL désigne : suivis (lentille) > archives (statut) > favoris > tout. */
export function portfolioTabOf(search: { lens?: string; status?: string | string[]; favorite?: string }): PortfolioTab {
  if (search.lens === 'followed') return 'followed'
  if (readFilterList(search.status).includes('archived')) return 'archives'
  if (search.favorite === 'mine') return 'favorites'
  return 'all'
}

/** L'URL après le clic sur un onglet : ses axes posés, ceux des autres onglets retirés. */
export function searchForPortfolioTab(prev: Record<string, unknown>, tab: PortfolioTab): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev, page: undefined }
  // Un onglet possède ces trois axes ; les autres clés (recherche, secteur…) lui sont étrangères.
  next.lens = tab === 'followed' ? 'followed' : prev.lens === 'followed' ? undefined : prev.lens
  // #4498.a — le statut peut porter plusieurs valeurs : quitter « Archives » ne retire que « archived ».
  next.status =
    tab === 'archives' ? 'archived' : writeFilterList(readFilterList(prev.status).filter(value => value !== 'archived'))
  next.favorite = tab === 'favorites' ? 'mine' : undefined
  // #4643 — « Archives » exclut les puces de source et les vues de la bande : elles comptent le portefeuille vivant.
  if (tab === 'archives') {
    next.crm = undefined
    next.imported = undefined
    next.importJob = undefined
    next.headline = undefined
  }
  return next
}
