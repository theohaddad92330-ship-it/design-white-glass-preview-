import { useTranslation } from 'react-i18next'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import { ToggleChip } from './filter-controls'

/**
 * #4973 — « Proposés d'après ton onboarding » : les secteurs choisis à l'onboarding, OFFERTS sous le sélecteur. Aucun
 * n'est coché d'office (#4529.1) ; un secteur déjà dans le rail ne se repropose pas ; rien à proposer ⇒ rien d'affiché.
 */
export function OnboardingSectorProposal({
  proposed,
  selected,
  onAdd,
}: {
  proposed: readonly string[]
  selected: readonly string[]
  onAdd: (code: string) => void
}) {
  const { t, i18n } = useTranslation('discover')
  const remaining = proposed.filter(code => !selected.includes(code))
  if (remaining.length === 0) return null
  return (
    <div data-testid="onboarding-sector-proposal" className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
        {t('rail.onboardingSectors')}
      </span>
      {remaining.map(code => (
        <ToggleChip key={code} active={false} onClick={() => onAdd(code)}>
          {applicationSectorLabel(code, i18n.language)}
        </ToggleChip>
      ))}
    </div>
  )
}
