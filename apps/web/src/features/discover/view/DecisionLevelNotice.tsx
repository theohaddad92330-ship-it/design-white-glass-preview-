import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'

/**
 * #3528 (recette prod 03/10) — « niveau de décision » : un niveau indéterminable
 * ne passe pas (doctrine), mais l'écran DIT pourquoi la liste se vide au lieu
 * d'un vide muet. Même gabarit neutre que `CapabilityNotice` (la source a
 * répondu, ce n'est pas une panne).
 *
 * Quatre états : `loading` (les contacts de l'espace se lisent — le filtre n'est
 * pas encore appliqué, jamais une liste à zéro), `error` (illisibles — dit, pas
 * appliqué), `ready` avec le nombre écarté (« 0 écarté » ne se dit pas : rien à
 * dire, rien affiché).
 */
export type DecisionLevelNoticeState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; unit: 'accounts' | 'contacts'; removedCount: number; shown: number }

export function DecisionLevelNotice({ state }: { state: DecisionLevelNoticeState }) {
  const { t } = useTranslation('discover')
  if (state.kind === 'off') return null
  if (state.kind === 'ready' && state.removedCount === 0) return null

  const lines: string[] = []
  if (state.kind === 'loading') lines.push(t('decisionLevelNotice.loading'))
  else if (state.kind === 'error') lines.push(t('decisionLevelNotice.error'))
  else {
    lines.push(
      t(state.unit === 'accounts' ? 'decisionLevelNotice.removedAccounts' : 'decisionLevelNotice.removedContacts', {
        count: state.removedCount,
      }),
    )
    if (state.shown === 0) lines.push(t('decisionLevelNotice.emptyHint'))
  }

  return (
    <div
      role="status"
      data-slot="decision-level-notice"
      className="mb-4 rounded-lg border border-[color:var(--border-subtle)] p-3"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-primary)]">
        <Info className="h-[13px] w-[13px]" aria-hidden />
        {t('decisionLevelNotice.title')}
      </p>
      {lines.map(line => (
        <p key={line} className="mt-1 text-xs leading-snug text-[color:var(--text-secondary)]">
          {line}
        </p>
      ))}
    </div>
  )
}
