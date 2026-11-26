import type { Account } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'

/**
 * #3420.2 (recette démo 06/10) — l'ÉTAT de la porte de priorité « À trancher », en toutes lettres.
 *
 * Le bouton du hero (`AccountGateControl`) n'est qu'une icône nommée : il ne DIT pas où en est la décision.
 * Cette pastille la dit sur la Synthèse et sur le Plan d'action, d'un seul composant (GA-26). Elle ne se rend
 * que pour une porte EXPLICITEMENT « à trancher » : priorisé, écarté ou porte inconnue ne font aucune pastille.
 */
export function AccountGateStateChip({ account }: { account: Pick<Account, 'priority_gate'> }) {
  const { t } = useTranslation('accounts')
  if (account.priority_gate !== 'pending') return null
  return (
    <span
      data-testid="verdict-gate"
      className="w-fit rounded-full border border-[var(--bellum-border)] px-2.5 py-0.5 text-xs font-semibold text-[var(--bellum-text-muted)]"
    >
      {t('gate.state.pending')}
    </span>
  )
}
