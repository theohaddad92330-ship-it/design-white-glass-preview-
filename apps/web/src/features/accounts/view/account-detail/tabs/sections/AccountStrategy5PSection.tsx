import type { AccountStrategy5PDimension } from '@bellum/contracts'
import { useAccountStrategy5P } from '@/features/accounts/hooks/useAccountStrategy5P'
import type { TabId } from '../../components/AccountDetailTabsBar'
import { AccountStrategy5PCard } from './AccountStrategy5PCard'

/** #3684.2 — l'onglet Partenaires se monte après la lecture réseau : on attend la ligne (≤ 2 s), puis on y amène la vue. */
function scrollToPartnerRow(partnerId: string, attempt = 0): void {
  const row = document.querySelector(`[data-testid="partner-row-${partnerId}"]`)
  if (row instanceof HTMLElement) {
    row.scrollIntoView({ block: 'center' })
    return
  }
  if (attempt < 12) window.setTimeout(() => scrollToPartnerRow(partnerId, attempt + 1), 170)
}

/**
 * BEL-SC-225 (#3254, P0) — L'APPELANT de `GET /accounts/:id/strategy-5p`.
 *
 * Même motif que `AccountCanonicalContextSection` (#2116) : le hook réseau
 * vit dans ce composant dédié, jamais dans `TabOverview` directement, pour
 * que les tests qui montent `TabOverview` sans `SessionProvider` continuent
 * de passer. La carte reste PURE (elle reçoit `strategy`).
 *
 * #3715 — les cinq cartes annexes (Périmètre, Influence, Flux de décision, Écosystème, Colonnes)
 * ne sont plus montées : elles reprojetaient les mêmes personnes que la carte 5P. Leur résumé utile
 * est absorbé par Périmètre / Personnes / Passage, et chaque vue propriétaire (Périmètres,
 * Organigramme, Comité d'achat, Partenaires) reste atteignable depuis la carte.
 */
export function AccountStrategy5PSection({
  accountId,
  onOpenTab,
  onAddToPlan,
}: {
  accountId: string
  onOpenTab?: (tab: TabId) => void
  /** #3277.3 — transmis à la carte 5P. */
  onAddToPlan?: (dimension: AccountStrategy5PDimension) => void
}) {
  const strategy = useAccountStrategy5P(accountId).data ?? null
  return (
    <AccountStrategy5PCard
      strategy={strategy}
      onOpenTab={onOpenTab}
      onAddToPlan={onAddToPlan}
      onOpenPartner={
        onOpenTab
          ? partnerId => {
              onOpenTab('partners')
              if (partnerId) scrollToPartnerRow(partnerId)
            }
          : undefined
      }
    />
  )
}
