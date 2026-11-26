import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '../lib/discover-types'
import { belowTargetHeadcount } from '../lib/discover-below-target'

/**
 * #5006 — « hors cible : moins de 20 salariés » dès la ligne repliée. La raison est écrite ; un effectif inconnu
 * n'affiche RIEN. Jamais un filtre posé d'office, jamais un compte caché.
 */
export function BelowTargetMark({ candidate }: { candidate: Pick<DiscoverCandidate, 'headcountRange'> }) {
  const { t } = useTranslation('discover')
  if (!belowTargetHeadcount(candidate.headcountRange)) return null
  return (
    <span
      data-testid="candidate-below-target"
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs"
      style={{ color: 'var(--text-muted)', border: '1px solid var(--border-default)' }}
    >
      {t('card.belowTarget')}
    </span>
  )
}
