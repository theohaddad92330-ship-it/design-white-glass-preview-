import { HORIZONTAL_OVERSCROLL_CLASS, Text, cn } from '@bellum/ui'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ScoreCircle } from '@/components/ui/ScoreCircle'
import { InterestPenetrabilityCompareCell } from './InterestPenetrabilityCompareCell'
import { StatusCell } from './StatusCell'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { getRecommendation, type AccountRow } from './types'

interface CompareDialogTableProps {
  accounts: AccountRow[]
}

export function CompareDialogTable({ accounts }: CompareDialogTableProps) {
  const { t, i18n } = useTranslation('accounts')
  // #3818 — même lecture de l'objectif que la fiche compte.
  const hasObjective = useHasOfferObjective()
  return (
    // #2588 — un tableau large ne renvoie pas le navigateur en arrière.
    <div className={cn('overflow-x-auto', HORIZONTAL_OVERSCROLL_CLASS)}>
      <table className="w-full text-left border-collapse">
        <thead>
          <tr>
            <th
              style={{ width: '140px' }}
              className="text-xs uppercase tracking-wider font-medium pr-4 pb-3 text-[var(--text-ghost)]"
            >
              {t('compare.criterion')}
            </th>
            {accounts.map(a => (
              <th key={a.id} className="pb-3 px-3 text-sm font-semibold truncate text-[var(--text-primary)]">
                {a.company_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <CompareRow
            label={t('compare.score')}
            cells={accounts.map(a =>
              a.priority_score != null ? (
                <div className="flex items-center gap-2">
                  <ScoreCircle score={a.priority_score} size="sm" />
                  <Text element="span" size="sm" weight="semibold" className="text-[var(--text-primary)]">
                    {a.priority_score}
                  </Text>
                </div>
              ) : (
                <Text element="span" size="sm" className="text-[var(--text-ghost)]">
                  —
                </Text>
              ),
            )}
          />
          <CompareRow
            label={t('compare.sector')}
            cells={accounts.map(a => (
              <Text element="span" size="sm" className="text-[var(--text-muted)]">
                {a.sector || '—'}
              </Text>
            ))}
          />
          <CompareRow
            label={t('compare.status')}
            cells={accounts.map(a => (
              <StatusCell status={a.status} />
            ))}
          />
          <CompareRow
            label={t('compare.analysisDate')}
            cells={accounts.map(a => (
              <Text element="span" size="xs" className="text-[var(--text-ghost)] font-mono">
                {new Date(a.created_at).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            ))}
          />
          <CompareRow
            label={t('compare.recommendation')}
            cells={accounts.map(a => {
              const rec = getRecommendation(a.priority_score, { hasObjective })
              return (
                <span
                  className="inline-block rounded-sm px-2.5 py-1 text-xs font-bold tracking-wide"
                  style={{ color: rec.color, background: `${rec.color}18`, border: `1px solid ${rec.color}30` }}
                >
                  {rec.label}
                </span>
              )
            })}
          />
          {/* #3258.15 (épopée #3362, lot E25 30/09) — la matrice intérêt ×
              pénétrabilité, LUE compte par compte (`useAccountInterestPenetrability`),
              jamais un second calcul de quadrant (GA-26). */}
          <CompareRow
            label={t('compare.interestPenetrability')}
            cells={accounts.map(a => (
              <InterestPenetrabilityCompareCell accountId={a.id} />
            ))}
          />
        </tbody>
      </table>
    </div>
  )
}

function CompareRow({ label, cells }: { label: string; cells: ReactNode[] }) {
  return (
    <tr className="border-t border-[var(--border-subtle)]">
      <td className="pr-4 py-3 text-xs font-medium text-[var(--text-ghost)]">{label}</td>
      {cells.map((cell, i) => (
        <td key={i} className="px-3 py-3">
          {cell}
        </td>
      ))}
    </tr>
  )
}
