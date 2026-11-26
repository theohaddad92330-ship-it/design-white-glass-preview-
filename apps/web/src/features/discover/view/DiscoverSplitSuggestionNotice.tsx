import { useTranslation } from 'react-i18next'
import { Sparkles } from 'lucide-react'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import type { DiscoverSplitSuggestion, DiscoverSubSearch } from '@/features/discover/lib/discover-split-suggestion'
import type { UnifiedFilters } from '@/features/discover/lib/discover-filters'

/**
 * #2165.11 — DÉCISION Louis 17/09 midi (QCM Découvrir) : Laura propose de
 * diviser une demande trop large en 2 à 3 sous-recherches NOMMÉES, plutôt que
 * de rendre une liste que personne ne parcourt jusqu'au bout.
 *
 * Ton NEUTRE, comme les autres bandeaux de l'écran (`AmbiguityNotice`,
 * `CoverageNotice`) : ce n'est pas une panne, c'est une proposition — le
 * commercial garde la main, chaque sous-recherche est un CLIC, rien n'est
 * lancé tout seul.
 */
export function DiscoverSplitSuggestionNotice({
  suggestion,
  onApply,
}: {
  suggestion: DiscoverSplitSuggestion
  onApply: (patch: Partial<UnifiedFilters>) => void
}) {
  const { t, i18n } = useTranslation('discover')

  function labelFor(sub: DiscoverSubSearch): string {
    return suggestion.reason === 'mixed_sectors' ? applicationSectorLabel(sub.value, i18n.language) : sub.value
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Sparkles className="h-[13px] w-[13px]" />
        {t('splitSuggestion.title')}
      </p>
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {t(`splitSuggestion.reason.${suggestion.reason}`)}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {suggestion.subSearches.map(sub => (
          <button
            key={sub.value}
            type="button"
            onClick={() => onApply(sub.patch)}
            className="rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
          >
            {labelFor(sub)}
          </button>
        ))}
      </div>
    </div>
  )
}
