import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '../lib/discover-types'

/**
 * #4284.26 (décision 22, Louis 19/10/2026) — un compte HORS du métier de l'espace n'est jamais écarté : il est
 * gardé plus bas et se DIT « hors de ton métier » dès la ligne repliée. Le fait vient de l'IA (`outOfTrade`) ;
 * ici rien n'est deviné. Un compte ordinaire n'affiche RIEN (même règle que les autres repères de la ligne).
 */
export function OutOfTradeMark({ candidate }: { candidate: Pick<DiscoverCandidate, 'outOfTrade'> }) {
  const { t } = useTranslation('discover')
  if (candidate.outOfTrade !== true) return null
  return (
    <span
      data-testid="candidate-out-of-trade"
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
      title={t('card.outOfTradeHelp')}
    >
      {t('card.outOfTrade')}
    </span>
  )
}
