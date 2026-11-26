import { useTranslation } from 'react-i18next'
import type { PartnerComplementarityScore } from '@/features/discover/lib/discover-partner-complementarity'

/**
 * #2151.36 — le score n'est JAMAIS nu : chaque axe est nommé, et un axe non
 * évalué s'écrit « non évalué », jamais 0 %.
 *
 * #2165.55 — réutilisé par `PartnerResultRow.tsx`, la MÊME lecture (score
 * décomposé par axes, jamais un score nu) sur l'écran qui rend réellement
 * `/discover?type=partners`.
 * #3597.7 — déplacé hors de `CandidateCard.tsx` (supprimé avec la carte).
 */
export function PartnerComplementarityBlock({ result }: { result: PartnerComplementarityScore }) {
  const { t } = useTranslation('discover')
  return (
    <div
      data-testid="partner-complementarity"
      className="mt-2 rounded-md p-2"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
    >
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {t('card.partnerComplementarity.title')}
        {result.score !== null && ` · ${result.score}%`}
      </p>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {result.axes.map(axis => (
          <li key={axis.axis}>
            {t(`card.partnerComplementarity.axis.${axis.axis}`)} :{' '}
            {axis.score === null ? t('card.partnerComplementarity.unmeasured') : `${axis.score}%`}
          </li>
        ))}
      </ul>
      {result.score === null && (
        <p className="mt-1 text-xs italic" style={{ color: 'var(--text-muted)' }}>
          {t('card.partnerComplementarity.scoreUnavailable')}
        </p>
      )}
    </div>
  )
}
