import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { getRecommendation } from './types'

const LEGEND_VERDICTS = [
  ['AGIR MAINTENANT', 'actNow'],
  ['RÉSERVE', 'reserve'],
  ['METTRE EN VEILLE', 'onHold'],
  ['ÉCARTER POUR CET OBJECTIF', 'setAside'],
  ['QUALIFIER', 'qualify'],
] as const

type VerdictSummary = { evaluated: number; actNow: number; reserve: number; setAside: number; unavailable: number }

/**
 * #4990.2 — le décompte des comptes CHARGÉS par verdict nommé, lu par `getRecommendation` (le MÊME libellé que la
 * ligne, GA-26). Un score absent ne compte pour rien : on n'affiche pas ce qu'on n'a pas. Les SEUILS ne changent pas.
 */
export function summarizeVerdicts(
  rows: ReadonlyArray<{ priority_score: number | null }>,
  hasObjective: boolean,
): VerdictSummary {
  const summary: VerdictSummary = { evaluated: 0, actNow: 0, reserve: 0, setAside: 0, unavailable: 0 }
  for (const row of rows) {
    if (row.priority_score == null) continue
    const rec = getRecommendation(row.priority_score, { hasObjective })
    summary.evaluated += 1
    if (rec.label === 'AGIR MAINTENANT') summary.actNow += 1
    else if (rec.label === 'RÉSERVE') summary.reserve += 1
    else if (rec.unavailableReason != null) summary.unavailable += 1
    else summary.setAside += 1
  }
  return summary
}

export function AccountsVerdictSummary({ rows }: { rows: ReadonlyArray<{ priority_score: number | null }> }) {
  const { t } = useTranslation('accounts')
  const hasObjective = useHasOfferObjective()
  const summary = summarizeVerdicts(rows, hasObjective)
  if (summary.evaluated === 0) return null
  // La raison dominante : ce qui retient le plus de comptes hors « agir maintenant ».
  const reasonKey =
    summary.unavailable >= summary.reserve && summary.unavailable >= summary.setAside && summary.unavailable > 0
      ? 'unavailable'
      : summary.reserve >= summary.setAside
        ? 'reserve'
        : 'setAside'
  return (
    <div data-testid="accounts-verdict-summary" className="flex flex-col gap-2">
      {/* #4990.2 — aucun « agir maintenant » : on le DIT et on nomme pourquoi, sans toucher aux seuils. */}
      {summary.actNow === 0 ? (
        <Text data-testid="accounts-no-act-now" size="sm" className="text-[var(--text-secondary)]">
          {t('verdictSummary.noActNow', { reserve: summary.reserve, total: summary.evaluated })}{' '}
          {t('verdictSummary.mainReason', { reason: t(`verdictSummary.reason.${reasonKey}`) })}
        </Text>
      ) : null}
      {/* #4990.1 — la légende des cinq verdicts, au clic. */}
      <details data-testid="accounts-verdict-legend">
        <summary className="min-h-11 cursor-pointer text-xs text-[var(--text-muted)]">
          {t('verdictSummary.legendTitle')}
        </summary>
        <ul className="mt-1 flex flex-col gap-1">
          {LEGEND_VERDICTS.map(([name, key]) => (
            <li key={key} className="text-xs text-[var(--text-secondary)]">
              <span className="font-semibold">{name}</span> — {t(`verdictSummary.legend.${key}`)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
