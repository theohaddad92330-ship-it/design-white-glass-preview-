import { TabNav } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Les onglets de Finance (Théo D, 23/10/2026) : chacun n'affiche que sa lecture, jamais des blocs
 * empilés. Les quatre lectures sont celles des quatre rangées de la page (L4, 14/10) — elles restent
 * montées, seules celles des onglets non choisis sont masquées : un chiffre ne change pas de source en
 * changeant d'onglet, et rien n'est relu pour rien.
 *
 * Le premier onglet est celui de la maquette : « Du carnet au cash » (ce qui est préparé, facturé, à
 * préparer — jamais mêlé à l'encaissé).
 */
export const FINANCE_TABS = ['carnet', 'encaissements', 'marge', 'adv'] as const
export type FinanceTab = (typeof FINANCE_TABS)[number]

export function FinanceTabs({ tab, onChange }: { tab: FinanceTab; onChange: (next: FinanceTab) => void }) {
  const { t } = useTranslation('pilotage')
  return (
    <TabNav
      variant="pill"
      tabs={FINANCE_TABS.map(key => ({ key, label: t(`finance.tabs.${key}`) }))}
      activeTab={tab}
      onTabChange={key => onChange(FINANCE_TABS.find(value => value === key) ?? 'carnet')}
    />
  )
}
