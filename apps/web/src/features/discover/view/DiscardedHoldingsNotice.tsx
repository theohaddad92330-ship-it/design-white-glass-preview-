import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

const HOLDING_CODE = 'holding_subsidiary_in_zone'

interface DiscardedHoldingsNoticeProps {
  candidates: readonly DiscoverCandidate[]
}

/**
 * #3983.1 — une holding écartée au profit de sa filiale est NOMMÉE avec sa raison : le compteur
 * « masquées » dit combien, jamais qui. Aucune holding écartée ⇒ aucune ligne.
 */
export function DiscardedHoldingsNotice({ candidates }: DiscardedHoldingsNoticeProps) {
  const { t } = useTranslation('discover')
  const heads = candidates.filter(c => c.qualification?.verdict === 'excluded' && c.qualification.code === HOLDING_CODE)
  if (heads.length === 0) return null
  return (
    <div role="status" className="mb-4 rounded-lg p-3" style={{ border: '1px solid rgba(148,163,184,0.22)' }}>
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        {t('discardedHoldings.title', { count: heads.length })}
      </p>
      <ul className="mt-1 space-y-1">
        {heads.map(head => {
          const names = (head.qualification?.subsidiaries ?? []).map(s => s.name)
          return (
            <li key={head.siren} className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-medium">{head.name}</span>
              {' — '}
              {names.length > 0
                ? t('discardedHoldings.reason', { names: names.join(', '), count: names.length })
                : head.qualification?.reason}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
