import { useTranslation } from 'react-i18next'
import { candidateAdvice } from '../lib/discover-candidate-advice'
import type { DiscoverCandidate } from '../lib/discover-types'
import { familyOf } from './FamilyBadge'

/**
 * #3408.2 — périmètre conseillé, risque, première action : trois lignes sous le
 * badge d'effort (#3408.3), jamais un bloc de plus. Rien ne s'affiche sans fait
 * (voir `candidateAdvice`). Même réserve que `EffortSuggestionBadge` : un compte
 * déjà possédé porte sa vraie décision, pas une suggestion.
 */
export function CandidateAdvice({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const { scope, risk, firstAction } = candidateAdvice(candidate, familyOf(candidate))
  if (scope.length === 0 && !risk && !firstAction) return null
  return (
    <dl data-testid="discover-candidate-advice" className="mt-1.5 space-y-0.5 text-xs">
      {scope.length > 0 && <AdviceRow label={t('advice.scope')} value={scope.join(', ')} />}
      {risk && (
        <AdviceRow
          label={t('advice.risk.label')}
          value={risk.key === 'barrier' && risk.label ? risk.label : t(`advice.risk.${risk.key}`)}
        />
      )}
      {firstAction && (
        <AdviceRow
          label={t('advice.first.label')}
          value={t(`advice.first.${firstAction.key}`, { role: firstAction.role })}
        />
      )}
    </dl>
  )
}

function AdviceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      {/* #3408 — le libellé ne se coupe jamais (colonne score ~279 px : « Première
          action : » passait sur 2 lignes) ; c'est la valeur qui reprend à la ligne. */}
      <dt className="shrink-0 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        {label} :
      </dt>
      <dd className="min-w-0" style={{ color: 'var(--text-secondary)' }}>
        {value}
      </dd>
    </div>
  )
}
