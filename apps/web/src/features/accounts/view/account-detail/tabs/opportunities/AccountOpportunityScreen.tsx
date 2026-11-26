import type { Account, SignalLinePeriod } from '@bellum/contracts'
import type { PlanActionInput } from '@/features/actions/planItems.api'
import { AccountSignalTable } from './AccountSignalTable'

/**
 * #3624 / #3676 (Louis 05/10) — L'ÉCRAN « SIGNAUX ET BESOINS », UN SEUL, quelle que soit la clé d'URL qui ouvre
 * la section (`veille`, `projects` ; `needs`, `besoins`, `programs` sont des alias).
 *
 * #4755 / #4756 / #4762 (lot 761, maquette Louis du 31/10/2026) — et cet écran est désormais UN TABLEAU
 * (`AccountSignalTable`) : Actuel / Historique, les quatre familles, une ligne par fait daté, « À contacter » sur
 * chaque ligne. Il remplace les treize blocs de « Sujets actuels » (recrutements, besoins d'équipe, demandes du
 * compte, vision et programmes, file des projets possibles, affaires suivies, signaux et miroir CRM, journal replié)
 * et le sous-onglet « Besoins historiques » (faits d'affaires CRM, tableau des affaires). Renversement ASSUMÉ de la
 * mise en page #4022 / #4020 (une carte par fait, en sections) ; rien n'est perdu : chaque famille arrive dans le
 * tableau, et un projet possible se tranche sur la ligne qui l'a fait naître.
 */
type AccountOpportunityScreenProps = {
  account: Account
  onOpenTab: (tab: 'overview' | 'contacts' | 'veille', contactSeed?: string) => void
  onAddToPlan: (action: PlanActionInput) => void
  /** Lot 764 — la période ouverte à l'arrivée (`?sp=past` depuis Signaux › Historique) ; absent = Actuel. */
  initialPeriod?: SignalLinePeriod
}

export function AccountOpportunityScreen({
  account,
  onOpenTab,
  onAddToPlan,
  initialPeriod,
}: AccountOpportunityScreenProps) {
  return (
    <div data-testid="signals-screen" className="flex flex-col gap-6">
      <AccountSignalTable
        account={account}
        onOpenTab={onOpenTab}
        onAddToPlan={onAddToPlan}
        initialPeriod={initialPeriod}
      />
    </div>
  )
}
