import type { AnalysisScopeSelection } from '@bellum/contracts'
import { cn } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { scopeKindOf, type ScopeKind } from '../lib/scopeKind'

const KINDS: readonly ScopeKind[] = ['group', 'entity', 'site']

/**
 * « Entreprise / groupe · Une entité · Un site » — la porte d'entrée du périmètre. Elle ne crée aucun
 * réglage : le périmètre envoyé au serveur se DÉDUIT toujours de la zone (cadrage du 15/10). Choisir
 * « Un site » pose la zone « Ville / site », choisir « Entreprise / groupe » retire les entités
 * ciblées ; « Une entité » reste choisie même tant qu'aucune entité n'est encore saisie.
 */
export function ScopeKindRow({
  selection,
  patch,
  country,
}: {
  selection: AnalysisScopeSelection
  patch: (next: Partial<AnalysisScopeSelection>) => void
  country: string
}) {
  const { t } = useTranslation('search')
  const [forced, setForced] = useState<ScopeKind | null>(null)
  const kind = forced ?? scopeKindOf(selection)
  const pick = (next: ScopeKind) => {
    setForced(next)
    if (next === 'site') patch({ geo_perimeter: 'city' })
    else if (selection.geo_perimeter === 'city') patch({ geo_perimeter: country === 'FR' ? 'france' : undefined })
    if (next === 'group' && (selection.included_entities ?? []).length > 0) patch({ included_entities: [] })
  }
  // `.an15-scope-row` : trois cases égales, la retenue teintée d'accent.
  return (
    <div role="group" aria-label={t('analyze.scope.kindLabel')} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {KINDS.map(option => {
        const on = option === kind
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => pick(option)}
            className={cn(
              'min-h-11 rounded-lg border px-2 text-xs font-medium transition-colors duration-immediate md:min-h-9',
              on
                ? 'border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] font-semibold text-[var(--bellum-text-accent)]'
                : 'border-[var(--bellum-border)] bg-[var(--bellum-bg)] text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-surface-2)]',
            )}
          >
            {t(`analyze.scope.kind.${option}`)}
          </button>
        )
      })}
    </div>
  )
}
