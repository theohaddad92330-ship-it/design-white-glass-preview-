import { AccountsCrmChip, AccountsImportedChip, AccountsImportJobChip } from './AccountsCrmChip'
import { AccountsLensToggle } from './AccountsLensToggle'
import { AccountsPortfolioTabs, type PortfolioTab } from './AccountsPortfolioTabs'

/**
 * V22 (`.a4-list-head`, #4496) — UNE SEULE RANGÉE : les quatre onglets du portefeuille, la puce « Mon CRM » (#4526)
 * qui se combine avec eux, et la bascule Commercial | Facturation poussée à droite.
 *
 * Recette prod 23/10 : deux rangées. Les onglets portaient `w-full` dans un conteneur `flex-wrap` — ils prenaient 100 %
 * de la rangée et la puce passait à la ligne. Ici les trois sont frères d'UN conteneur, qui ne se replie qu'en dessous
 * de la borne mobile (GA-28) ; au-delà, les onglets défilent dans leur propre bande plutôt que de pousser la suite.
 */
export function AccountsListHead({
  portfolioTab,
  onPortfolioTabChange,
  crmCount,
  crmActive,
  crmName,
  onCrmToggle,
  importedCount,
  importedActive,
  onImportedToggle,
  onClearImportJob,
  deliveryLens,
  onDeliveryLensChange,
}: {
  portfolioTab: PortfolioTab
  onPortfolioTabChange: (tab: PortfolioTab) => void
  crmCount: number | undefined
  crmActive: boolean
  crmName?: string
  onCrmToggle: () => void
  /** #4597.1 — la puce « Importés » : les comptes venus d'un fichier. Absente à zéro/inconnu, sauf active. */
  importedCount: number | undefined
  importedActive: boolean
  onImportedToggle: () => void
  /** #4597.3 — présent quand la liste est ouverte sur UN import précis : la puce le dit et le relâche. */
  onClearImportJob?: () => void
  deliveryLens: boolean
  /** Absent : pas de bascule (l'onglet Suivis n'a pas d'angle facturation). */
  onDeliveryLensChange?: (next: boolean) => void
}) {
  return (
    <div data-testid="accounts-list-head-row" className="flex flex-wrap items-center gap-3 md:flex-nowrap">
      <div className="min-w-0 shrink">
        <AccountsPortfolioTabs active={portfolioTab} onChange={onPortfolioTabChange} />
      </div>
      <AccountsCrmChip
        count={crmCount}
        active={crmActive}
        crmName={crmName}
        onToggle={onCrmToggle}
        className="shrink-0"
      />
      <AccountsImportedChip
        count={importedCount}
        active={importedActive}
        onToggle={onImportedToggle}
        className="shrink-0"
      />
      {onClearImportJob ? <AccountsImportJobChip onClear={onClearImportJob} className="shrink-0" /> : null}
      {onDeliveryLensChange ? (
        <AccountsLensToggle
          deliveryLens={deliveryLens}
          onChange={onDeliveryLensChange}
          className="mt-0 ml-auto shrink-0"
        />
      ) : null}
    </div>
  )
}
